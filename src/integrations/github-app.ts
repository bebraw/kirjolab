import {
  GitHubAppTransport,
  GitHubClientError,
  invalidResponse,
  type GitHubAppConfig,
  type GitHubInstallationRequest,
} from "./github-app-transport";

export { GitHubClientError, type GitHubAppConfig } from "./github-app-transport";

export interface GitHubRepositorySelection {
  readonly installationId: number;
  readonly repositoryId?: number;
  readonly owner: string;
  readonly repository: string;
  readonly branch: string;
  readonly rootPath: string;
}

export interface GitHubRemoteMarkdownFile {
  readonly path: string;
  readonly blobSha: string;
  readonly content: string;
}

export interface GitHubSkippedEntry {
  readonly path: string;
  readonly reason: "unsupported-type" | "unsupported-mode" | "git-lfs";
}

export interface GitHubRepositorySnapshot {
  readonly repositoryId: number;
  readonly owner: string;
  readonly repository: string;
  readonly branch: string;
  readonly rootPath: string;
  readonly commitSha: string;
  readonly commitMessage: string;
  readonly files: readonly GitHubRemoteMarkdownFile[];
  readonly skipped: readonly GitHubSkippedEntry[];
}

export interface GitHubCommitChange {
  readonly path: string;
  readonly content: string | null;
}

type FetchExternal = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const maximumMarkdownFiles = 512;
const maximumMarkdownBytes = 2 * 1024 * 1024;

export class GitHubAppClient {
  readonly #transport: GitHubAppTransport;

  constructor(config: GitHubAppConfig, fetchExternal: FetchExternal = (input, init) => fetch(input, init)) {
    this.#transport = new GitHubAppTransport(config, fetchExternal);
  }

  async readMarkdownSnapshot(selection: GitHubRepositorySelection): Promise<GitHubRepositorySnapshot> {
    const normalized = validateSelection(selection);
    const request = await this.#transport.forInstallation(normalized.installationId, normalized.repositoryId);
    const repository = await request(`/repos/${segment(normalized.owner)}/${segment(normalized.repository)}`);
    if (!isRecord(repository) || !isPositiveInteger(repository.id)) throw invalidResponse("GitHub repository metadata is invalid");
    if (normalized.repositoryId !== undefined && repository.id !== normalized.repositoryId) {
      throw new GitHubClientError("forbidden", "GitHub repository is outside the authorized user selection", 403);
    }
    const ref = await request(
      `/repos/${segment(normalized.owner)}/${segment(normalized.repository)}/git/ref/heads/${pathSegment(normalized.branch)}`,
    );
    const commitSha = gitObjectSha(ref, "GitHub branch response is invalid");
    const commit = await request(`/repos/${segment(normalized.owner)}/${segment(normalized.repository)}/git/commits/${segment(commitSha)}`);
    const treeSha = nestedSha(commit, "tree", "GitHub commit response is invalid");
    if (!isRecord(commit) || typeof commit.message !== "string" || commit.message.length > 10_000) {
      throw invalidResponse("GitHub commit response is invalid");
    }
    const tree = await request(
      `/repos/${segment(normalized.owner)}/${segment(normalized.repository)}/git/trees/${segment(treeSha)}?recursive=1`,
    );
    if (!isRecord(tree) || tree.truncated === true || !Array.isArray(tree.tree)) {
      throw new GitHubClientError("bounds", "GitHub returned a truncated or invalid repository tree");
    }

    const blobs: Array<{ path: string; sha: string; size: number }> = [];
    const skipped: GitHubSkippedEntry[] = [];
    for (const value of tree.tree) {
      if (!isRecord(value) || typeof value.path !== "string" || typeof value.type !== "string") continue;
      const relative = relativeToRoot(value.path, normalized.rootPath);
      if (relative === null) continue;
      if (!relative.toLocaleLowerCase().endsWith(".md")) {
        if (relative) skipped.push({ path: relative, reason: "unsupported-type" });
        continue;
      }
      if (value.type !== "blob" || value.mode !== "100644" || typeof value.sha !== "string" || !isNonNegativeInteger(value.size)) {
        skipped.push({ path: relative, reason: "unsupported-mode" });
        continue;
      }
      blobs.push({ path: relative, sha: value.sha, size: value.size });
    }
    blobs.sort((left, right) => compareText(left.path, right.path));
    if (blobs.length === 0) throw new GitHubClientError("bounds", "The selected GitHub folder contains no supported Markdown files");
    if (blobs.length > maximumMarkdownFiles || blobs.reduce((total, blob) => total + blob.size, 0) > maximumMarkdownBytes) {
      throw new GitHubClientError("bounds", "The selected GitHub folder exceeds the Markdown import bounds");
    }

    const files: GitHubRemoteMarkdownFile[] = [];
    for (let offset = 0; offset < blobs.length; offset += 10) {
      const batch = blobs.slice(offset, offset + 10);
      const loaded = await Promise.all(
        batch.map(async (blob) => ({
          path: blob.path,
          blobSha: blob.sha,
          content: await this.#blobText(request, normalized.owner, normalized.repository, blob.sha, blob.size),
        })),
      );
      for (const file of loaded) {
        if (isGitLfsPointer(file.content)) skipped.push({ path: file.path, reason: "git-lfs" });
        else files.push(file);
      }
    }
    skipped.sort((left, right) => compareText(left.path, right.path));
    if (files.length === 0) throw new GitHubClientError("bounds", "The selected GitHub folder contains no supported Markdown files");
    return {
      repositoryId: repository.id,
      owner: normalized.owner,
      repository: normalized.repository,
      branch: normalized.branch,
      rootPath: normalized.rootPath,
      commitSha,
      commitMessage: commit.message,
      files,
      skipped,
    };
  }

  async createCommit(
    selection: GitHubRepositorySelection,
    expectedHead: string,
    message: string,
    changes: readonly GitHubCommitChange[],
  ): Promise<string> {
    const normalized = validateSelection(selection);
    if (
      !isCommitSha(expectedHead) ||
      !message.trim() ||
      message.length > 1_000 ||
      changes.length === 0 ||
      changes.length > maximumMarkdownFiles
    ) {
      throw new GitHubClientError("bounds", "GitHub commit input is invalid");
    }
    const paths = new Set<string>();
    for (const change of changes) {
      const relative = normalizeRelativePath(change.path);
      if (!relative || relative !== change.path || !relative.toLocaleLowerCase().endsWith(".md") || paths.has(relative)) {
        throw new GitHubClientError("bounds", "GitHub commit paths are invalid or duplicated");
      }
      if (change.content !== null && new TextEncoder().encode(change.content).byteLength > maximumMarkdownBytes) {
        throw new GitHubClientError("bounds", "A GitHub commit file exceeds the Markdown bounds");
      }
      paths.add(relative);
    }
    const request = await this.#transport.forInstallation(normalized.installationId, normalized.repositoryId);
    const repositoryPath = `/repos/${segment(normalized.owner)}/${segment(normalized.repository)}`;
    const refPath = `${repositoryPath}/git/ref/heads/${pathSegment(normalized.branch)}`;
    const currentHead = gitObjectSha(await request(refPath), "GitHub branch response is invalid");
    if (currentHead !== expectedHead) throw new GitHubClientError("remote-changed", "The GitHub branch changed after preview");
    const commit = await request(`${repositoryPath}/git/commits/${segment(currentHead)}`);
    const baseTree = nestedSha(commit, "tree", "GitHub commit response is invalid");
    const entries = await Promise.all(
      changes.map(async (change) => ({
        path: joinRoot(normalized.rootPath, change.path),
        mode: "100644",
        type: "blob",
        sha: change.content === null ? null : await this.#createBlob(request, repositoryPath, change.content),
      })),
    );
    const tree = await request(`${repositoryPath}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTree, tree: entries }),
    });
    const treeSha = directSha(tree, "GitHub tree creation response is invalid");
    const created = await request(`${repositoryPath}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message: message.trim(), tree: treeSha, parents: [currentHead] }),
    });
    const commitSha = directSha(created, "GitHub commit creation response is invalid");
    try {
      await request(`${repositoryPath}/git/refs/heads/${pathSegment(normalized.branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commitSha, force: false }),
      });
    } catch (error) {
      if (error instanceof GitHubClientError && error.status === 422) {
        const observedHead = gitObjectSha(await request(refPath), "GitHub branch response is invalid");
        if (observedHead !== currentHead) throw new GitHubClientError("remote-changed", "The GitHub branch changed during publish", 422);
        throw new GitHubClientError("branch-protected", "GitHub rejected the direct branch update", 422);
      }
      if (error instanceof GitHubClientError && error.status === 403) {
        throw new GitHubClientError("branch-protected", "GitHub rejected the direct branch update", 403);
      }
      throw error;
    }
    return commitSha;
  }

  async #createBlob(request: GitHubInstallationRequest, repositoryPath: string, content: string): Promise<string> {
    const blob = await request(`${repositoryPath}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    return directSha(blob, "GitHub blob creation response is invalid");
  }

  async #blobText(
    request: GitHubInstallationRequest,
    owner: string,
    repository: string,
    sha: string,
    expectedSize: number,
  ): Promise<string> {
    const value = await request(`/repos/${segment(owner)}/${segment(repository)}/git/blobs/${segment(sha)}`);
    if (!isRecord(value) || value.encoding !== "base64" || typeof value.content !== "string" || value.size !== expectedSize) {
      throw invalidResponse("GitHub blob response is invalid");
    }
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(value.content.replaceAll(/\s/gu, ""));
    } catch {
      throw invalidResponse("GitHub blob content is not valid base64");
    }
    if (bytes.byteLength !== expectedSize || bytes.byteLength > maximumMarkdownBytes) {
      throw new GitHubClientError("bounds", "GitHub blob content exceeds its declared bounds");
    }
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    } catch {
      throw new GitHubClientError("bounds", "GitHub Markdown files must be valid UTF-8");
    }
  }
}

export function normalizeGitHubRoot(value: string): string | null {
  const trimmed = value.trim().replace(/^\/+|\/+$/gu, "");
  if (!trimmed) return "";
  return normalizeRelativePath(trimmed);
}

function validateSelection(selection: GitHubRepositorySelection): GitHubRepositorySelection {
  const rootPath = normalizeGitHubRoot(selection.rootPath);
  if (
    !isPositiveInteger(selection.installationId) ||
    (selection.repositoryId !== undefined && !isPositiveInteger(selection.repositoryId)) ||
    !repositoryPart(selection.owner) ||
    !repositoryPart(selection.repository) ||
    !selection.branch.trim() ||
    selection.branch.length > 255 ||
    rootPath === null
  ) {
    throw new GitHubClientError("bounds", "GitHub repository selection is invalid");
  }
  return {
    ...selection,
    owner: selection.owner.trim(),
    repository: selection.repository.trim(),
    branch: selection.branch.trim(),
    rootPath,
  };
}

function repositoryPart(value: string): boolean {
  return /^[a-z0-9_.-]{1,100}$/iu.test(value.trim());
}

function normalizeRelativePath(value: string): string | null {
  if (!value || value.startsWith("/") || value.includes("\\") || value.includes("\0")) return null;
  const segments = value.split("/");
  if (segments.some((part) => !part || part === "." || part === "..")) return null;
  return segments.join("/");
}

function relativeToRoot(path: string, root: string): string | null {
  const normalized = normalizeRelativePath(path);
  if (!normalized) return null;
  if (!root) return normalized;
  if (normalized === root) return "";
  return normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : null;
}

function joinRoot(root: string, path: string): string {
  return root ? `${root}/${path}` : path;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function pathSegment(value: string): string {
  return value.split("/").map(segment).join("/");
}

function gitObjectSha(value: unknown, message: string): string {
  if (!isRecord(value) || !isRecord(value.object) || !isCommitSha(value.object.sha)) throw invalidResponse(message);
  return value.object.sha;
}

function nestedSha(value: unknown, key: string, message: string): string {
  if (!isRecord(value) || !isRecord(value[key]) || !isCommitSha(value[key].sha)) throw invalidResponse(message);
  return value[key].sha;
}

function directSha(value: unknown, message: string): string {
  if (!isRecord(value) || !isCommitSha(value.sha)) throw invalidResponse(message);
  return value.sha;
}

function isCommitSha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40,64}$/iu.test(value);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.codePointAt(0) ?? 0);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isGitLfsPointer(value: string): boolean {
  return /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:[a-f0-9]{64}\r?\nsize \d+(?:\r?\n)?$/iu.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export interface GitHubAppConfig {
  readonly appId: string;
  readonly privateKey: string;
  readonly apiBase?: string;
}

export interface GitHubRepositorySelection {
  readonly installationId: number;
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

export type GitHubClientErrorCode =
  | "configuration"
  | "authentication"
  | "forbidden"
  | "not-found"
  | "remote-changed"
  | "branch-protected"
  | "invalid-response"
  | "bounds";

export class GitHubClientError extends Error {
  readonly code: GitHubClientErrorCode;
  readonly status: number | null;

  constructor(code: GitHubClientErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "GitHubClientError";
    this.code = code;
    this.status = status;
  }
}

type FetchExternal = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const maximumMarkdownFiles = 512;
const maximumMarkdownBytes = 2 * 1024 * 1024;
const maximumJsonBytes = 8 * 1024 * 1024;
const githubApiVersion = "2022-11-28";

export class GitHubAppClient {
  readonly #config: GitHubAppConfig;
  readonly #fetch: FetchExternal;

  constructor(config: GitHubAppConfig, fetchExternal: FetchExternal = (input, init) => fetch(input, init)) {
    this.#config = validateConfig(config);
    this.#fetch = fetchExternal;
  }

  async readMarkdownSnapshot(selection: GitHubRepositorySelection): Promise<GitHubRepositorySnapshot> {
    const normalized = validateSelection(selection);
    const token = await this.#installationToken(normalized.installationId);
    const repository = await this.#request(token, `/repos/${segment(normalized.owner)}/${segment(normalized.repository)}`);
    if (!isRecord(repository) || !isPositiveInteger(repository.id)) throw invalidResponse("GitHub repository metadata is invalid");
    const ref = await this.#request(
      token,
      `/repos/${segment(normalized.owner)}/${segment(normalized.repository)}/git/ref/heads/${pathSegment(normalized.branch)}`,
    );
    const commitSha = gitObjectSha(ref, "GitHub branch response is invalid");
    const commit = await this.#request(
      token,
      `/repos/${segment(normalized.owner)}/${segment(normalized.repository)}/git/commits/${segment(commitSha)}`,
    );
    const treeSha = nestedSha(commit, "tree", "GitHub commit response is invalid");
    if (!isRecord(commit) || typeof commit.message !== "string" || commit.message.length > 10_000) {
      throw invalidResponse("GitHub commit response is invalid");
    }
    const tree = await this.#request(
      token,
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
          content: await this.#blobText(token, normalized.owner, normalized.repository, blob.sha, blob.size),
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
    const token = await this.#installationToken(normalized.installationId);
    const repositoryPath = `/repos/${segment(normalized.owner)}/${segment(normalized.repository)}`;
    const refPath = `${repositoryPath}/git/ref/heads/${pathSegment(normalized.branch)}`;
    const currentHead = gitObjectSha(await this.#request(token, refPath), "GitHub branch response is invalid");
    if (currentHead !== expectedHead) throw new GitHubClientError("remote-changed", "The GitHub branch changed after preview");
    const commit = await this.#request(token, `${repositoryPath}/git/commits/${segment(currentHead)}`);
    const baseTree = nestedSha(commit, "tree", "GitHub commit response is invalid");
    const entries = await Promise.all(
      changes.map(async (change) => ({
        path: joinRoot(normalized.rootPath, change.path),
        mode: "100644",
        type: "blob",
        sha: change.content === null ? null : await this.#createBlob(token, repositoryPath, change.content),
      })),
    );
    const tree = await this.#request(token, `${repositoryPath}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTree, tree: entries }),
    });
    const treeSha = directSha(tree, "GitHub tree creation response is invalid");
    const created = await this.#request(token, `${repositoryPath}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message: message.trim(), tree: treeSha, parents: [currentHead] }),
    });
    const commitSha = directSha(created, "GitHub commit creation response is invalid");
    try {
      await this.#request(token, `${repositoryPath}/git/refs/heads/${pathSegment(normalized.branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commitSha, force: false }),
      });
    } catch (error) {
      if (error instanceof GitHubClientError && error.status === 422) {
        const observedHead = gitObjectSha(await this.#request(token, refPath), "GitHub branch response is invalid");
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

  async #createBlob(token: string, repositoryPath: string, content: string): Promise<string> {
    const blob = await this.#request(token, `${repositoryPath}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    return directSha(blob, "GitHub blob creation response is invalid");
  }

  async #blobText(token: string, owner: string, repository: string, sha: string, expectedSize: number): Promise<string> {
    const value = await this.#request(token, `/repos/${segment(owner)}/${segment(repository)}/git/blobs/${segment(sha)}`);
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

  async #installationToken(installationId: number): Promise<string> {
    if (!isPositiveInteger(installationId)) throw new GitHubClientError("bounds", "GitHub installation id is invalid");
    const jwt = await createGitHubAppJwt(this.#config.appId, this.#config.privateKey);
    const value = await this.#request(jwt, `/app/installations/${installationId}/access_tokens`, { method: "POST" });
    if (!isRecord(value) || typeof value.token !== "string" || value.token.length < 20) {
      throw new GitHubClientError("authentication", "GitHub installation token response is invalid");
    }
    return value.token;
  }

  async #request(token: string, path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.#fetch(`${this.#config.apiBase ?? "https://api.github.com"}${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "Kirjolab-GitHub-App",
        "x-github-api-version": githubApiVersion,
        ...headersRecord(init.headers),
      },
    });
    const body = await readBoundedText(response, maximumJsonBytes);
    if (!response.ok) throw githubResponseError(response.status, body);
    if (!body) return {};
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw invalidResponse("GitHub returned invalid JSON");
    }
  }
}

export async function createGitHubAppJwt(appId: string, privateKey: string, now = Date.now()): Promise<string> {
  if (!/^\d{1,20}$/u.test(appId.trim()) || !privateKey.trim()) {
    throw new GitHubClientError("configuration", "GitHub App credentials are not configured");
  }
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const seconds = Math.floor(now / 1_000);
  const payload = encodeJson({ iat: seconds - 60, exp: seconds + 540, iss: appId.trim() });
  const input = `${header}.${payload}`;
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("pkcs8", pemPrivateKey(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
      "sign",
    ]);
  } catch {
    throw new GitHubClientError("configuration", "GitHub App private key is invalid");
  }
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  return `${input}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export function normalizeGitHubRoot(value: string): string | null {
  const trimmed = value.trim().replace(/^\/+|\/+$/gu, "");
  if (!trimmed) return "";
  return normalizeRelativePath(trimmed);
}

function validateConfig(config: GitHubAppConfig): GitHubAppConfig {
  if (!config.appId.trim() || !config.privateKey.trim()) {
    throw new GitHubClientError("configuration", "GitHub App credentials are not configured");
  }
  const apiBase = config.apiBase?.replace(/\/+$/u, "");
  if (apiBase && !/^https?:\/\//u.test(apiBase)) throw new GitHubClientError("configuration", "GitHub API base URL is invalid");
  return { appId: config.appId.trim(), privateKey: config.privateKey, ...(apiBase ? { apiBase } : {}) };
}

function validateSelection(selection: GitHubRepositorySelection): GitHubRepositorySelection {
  const rootPath = normalizeGitHubRoot(selection.rootPath);
  if (
    !isPositiveInteger(selection.installationId) ||
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

function invalidResponse(message: string): GitHubClientError {
  return new GitHubClientError("invalid-response", message);
}

function githubResponseError(status: number, body: string): GitHubClientError {
  let message = "GitHub request failed";
  try {
    const value: unknown = JSON.parse(body);
    if (isRecord(value) && typeof value.message === "string" && value.message.length <= 500) message = value.message;
  } catch {
    // Keep the bounded generic message for non-JSON error bodies.
  }
  const code: GitHubClientErrorCode =
    status === 401 ? "authentication" : status === 403 ? "forbidden" : status === 404 ? "not-found" : "invalid-response";
  return new GitHubClientError(code, message, status);
}

async function readBoundedText(response: Response, maximumBytes: number): Promise<string> {
  const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > maximumBytes) throw new GitHubClientError("bounds", "GitHub response exceeds bounds");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new GitHubClientError("bounds", "GitHub response exceeds bounds");
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function pemPrivateKey(value: string): ArrayBuffer {
  const normalized = value.includes("\n") ? value : value.replaceAll("\\n", "\n");
  const pkcs8 = /-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/u.exec(normalized)?.[1];
  if (pkcs8) return exactArrayBuffer(decodeBase64(pkcs8.replaceAll(/\s/gu, "")));
  const pkcs1 = /-----BEGIN RSA PRIVATE KEY-----([\s\S]+?)-----END RSA PRIVATE KEY-----/u.exec(normalized)?.[1];
  if (!pkcs1) throw new Error("Unsupported private key PEM");
  return exactArrayBuffer(wrapPkcs1AsPkcs8(decodeBase64(pkcs1.replaceAll(/\s/gu, ""))));
}

function exactArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function wrapPkcs1AsPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const rsaAlgorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  return derSequence(concatenate(version, rsaAlgorithm, derValue(0x04, pkcs1)));
}

function derSequence(value: Uint8Array): Uint8Array {
  return derValue(0x30, value);
}

function derValue(tag: number, value: Uint8Array): Uint8Array {
  return concatenate(new Uint8Array([tag]), derLength(value.byteLength), value);
}

function derLength(length: number): Uint8Array {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  for (let remaining = length; remaining > 0; remaining = Math.floor(remaining / 256)) bytes.unshift(remaining % 256);
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function concatenate(...values: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(values.reduce((total, value) => total + value.byteLength, 0));
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.byteLength;
  }
  return result;
}

function encodeJson(value: Readonly<Record<string, string | number>>): string {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeBase64Url(value: Uint8Array): string {
  return encodeBase64(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.codePointAt(0) ?? 0);
}

function headersRecord(value: HeadersInit | undefined): Record<string, string> {
  if (!value) return {};
  return Object.fromEntries(new Headers(value).entries());
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

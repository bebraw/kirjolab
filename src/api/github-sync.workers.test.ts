import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import type { GitHubCommitChange, GitHubRepositorySelection, GitHubRepositorySnapshot } from "../integrations/github-app";
import type { AuthIdentity } from "../security/auth";
import { handleGitHubImportApi, handleGitHubWorkspaceSyncApi, type GitHubSyncRemoteClient } from "./github-sync";

const identity = {
  subject: "local:test",
  email: "local@kirjolab.invalid",
  ownerKey: "github-api-test",
  mode: "local",
} satisfies AuthIdentity;

describe("GitHub sync API in the Workers runtime", () => {
  it("imports an exact preview and publishes a reviewed direct commit", async () => {
    const client = new FakeGitHubClient(snapshot("a".repeat(40), "Imported head"));
    const previewResponse = await handleGitHubImportApi(
      jsonRequest("http://example.com/api/github/import-previews", {
        installationId: 7,
        owner: "bebraw",
        repository: "scalability_book",
        branch: "main",
        rootPath: "book",
      }),
      env,
      identity,
      client,
      authorizeSelection,
    );
    expect(previewResponse.status).toBe(201);
    const preview = await responseRecord(previewResponse);
    expect(preview.entryPath).toBe("00_introduction.md");
    expect(preview).not.toHaveProperty("files.0.content");

    const importResponse = await handleGitHubImportApi(
      jsonRequest("http://example.com/api/github/imports", { previewId: preview.id, title: "Scalability book" }),
      env,
      identity,
      client,
      authorizeSelection,
    );
    expect(importResponse.status).toBe(201);
    const imported = await responseRecord(importResponse);
    const workspace = imported.workspace as { id: string };
    const room = env.DOCUMENT_ROOMS.getByName(workspace.id);
    const initial = await room.getSnapshot(workspace.id);
    expect(initial.files.map((file) => file.path)).toEqual(["00_introduction.md", "chapters/scale.md"]);
    expect(initial.files.find((file) => file.id === initial.entryFileId)?.path).toBe("00_introduction.md");
    expect(await room.getGitHubSyncState()).toMatchObject({ repositoryId: 99, rootPath: "book", synchronizedRevision: 0 });

    const entry = initial.files.find((file) => file.id === initial.entryFileId)!;
    const edited = await room.replaceProjectFileContent(workspace.id, entry.id, "# Revised introduction\n", initial.revision);
    expect(edited.ok).toBe(true);
    const publishPreviewResponse = await handleGitHubWorkspaceSyncApi(
      jsonRequest("http://example.com/api/workspaces/project/github-sync/publish-previews", { commitMessage: "Revise introduction" }),
      env,
      identity,
      room,
      "/github-sync/publish-previews",
      client,
      authorizeSelection,
    );
    expect(publishPreviewResponse.status).toBe(201);
    const publishPreview = await responseRecord(publishPreviewResponse);
    expect(publishPreview.plan).toMatchObject({
      blocking: [],
      changes: [{ path: "00_introduction.md", content: "# Revised introduction\n" }],
    });

    const publishResponse = await handleGitHubWorkspaceSyncApi(
      jsonRequest("http://example.com/api/workspaces/project/github-sync/publishes", { previewId: publishPreview.id }),
      env,
      identity,
      room,
      "/github-sync/publishes",
      client,
      authorizeSelection,
    );
    expect(publishResponse.status).toBe(200);
    await expect(publishResponse.json()).resolves.toMatchObject({ commitSha: "c".repeat(40), reconciled: false });
    expect(client.createCommitMock).toHaveBeenCalledOnce();
    expect(client.createCommitMock.mock.calls[0]?.[2]).toContain(`Kirjolab-Operation: ${String(publishPreview.id)}`);
    expect(await room.getGitHubSyncState()).toMatchObject({ commitSha: "c".repeat(40), synchronizedRevision: 1 });
  });

  it("rejects a confirmation after the remote head changes", async () => {
    const client = new FakeGitHubClient(snapshot("d".repeat(40), "Before"));
    const staleIdentity = { ...identity, ownerKey: `stale-${crypto.randomUUID()}` };
    const previewResponse = await handleGitHubImportApi(
      jsonRequest("http://example.com/api/github/import-previews", {
        installationId: 8,
        owner: "owner",
        repository: "repository",
        branch: "main",
        rootPath: "book",
        entryPath: "chapters/scale.md",
      }),
      env,
      staleIdentity,
      client,
      authorizeSelection,
    );
    const preview = await responseRecord(previewResponse);
    client.current = snapshot("e".repeat(40), "After");
    const response = await handleGitHubImportApi(
      jsonRequest("http://example.com/api/github/imports", { previewId: preview.id, title: "Stale import" }),
      env,
      staleIdentity,
      client,
      authorizeSelection,
    );
    expect(response.status).toBe(409);
  });

  it("logs unexpected failures without request or credential data", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client: GitHubSyncRemoteClient = {
      async readMarkdownSnapshot(): Promise<GitHubRepositorySnapshot> {
        throw new TypeError("Durable Object preview failed");
      },
      async createCommit(): Promise<string> {
        throw new Error("Not used");
      },
    };

    try {
      const response = await handleGitHubImportApi(
        jsonRequest("http://example.com/api/github/import-previews", {
          installationId: 7,
          owner: "private-owner",
          repository: "private-repository",
          branch: "main",
          rootPath: "book",
        }),
        env,
        identity,
        client,
        authorizeSelection,
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "GitHub sync failed" });
      expect(errorLog).toHaveBeenCalledOnce();
      const logged = String(errorLog.mock.calls[0]?.[0]);
      expect(JSON.parse(logged)).toMatchObject({
        event: "github-sync-unexpected-error",
        error: { name: "TypeError", message: "Durable Object preview failed" },
      });
      expect(logged).not.toContain("private-owner");
      expect(logged).not.toContain("private-repository");
    } finally {
      errorLog.mockRestore();
    }
  });
});

class FakeGitHubClient implements GitHubSyncRemoteClient {
  current: GitHubRepositorySnapshot;
  readonly createCommitMock = vi.fn(
    async (_selection: GitHubRepositorySelection, expectedHead: string, message: string, changes: readonly GitHubCommitChange[]) => {
      expect(expectedHead).toBe(this.current.commitSha);
      const byPath = new Map(this.current.files.map((file) => [file.path, file]));
      for (const change of changes) {
        if (change.content === null) byPath.delete(change.path);
        else byPath.set(change.path, { path: change.path, blobSha: "f".repeat(40), content: change.content });
      }
      this.current = { ...this.current, commitSha: "c".repeat(40), commitMessage: message, files: [...byPath.values()] };
      return this.current.commitSha;
    },
  );

  constructor(value: GitHubRepositorySnapshot) {
    this.current = value;
  }

  async readMarkdownSnapshot(_selection: GitHubRepositorySelection): Promise<GitHubRepositorySnapshot> {
    return this.current;
  }

  async createCommit(
    selection: GitHubRepositorySelection,
    expectedHead: string,
    message: string,
    changes: readonly GitHubCommitChange[],
  ): Promise<string> {
    return await this.createCommitMock(selection, expectedHead, message, changes);
  }
}

function snapshot(commitSha: string, commitMessage: string): GitHubRepositorySnapshot {
  return {
    repositoryId: 99,
    owner: "bebraw",
    repository: "scalability_book",
    branch: "main",
    rootPath: "book",
    commitSha,
    commitMessage,
    files: [
      { path: "00_introduction.md", blobSha: "1".repeat(40), content: "# Introduction\n" },
      { path: "chapters/scale.md", blobSha: "2".repeat(40), content: "# Scale\n" },
    ],
    skipped: [{ path: "demo.js", reason: "unsupported-type" }],
  };
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function responseRecord(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null) throw new Error("Expected JSON object response");
  return value as Record<string, unknown>;
}

async function authorizeSelection(
  _identity: AuthIdentity,
  _env: Env,
  selection: GitHubRepositorySelection,
): Promise<GitHubRepositorySelection> {
  return { ...selection, repositoryId: 99 };
}

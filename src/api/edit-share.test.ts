import { describe, expect, it, vi } from "vitest";
import type { WorkspaceSnapshot } from "../domain/workspace";
import type { ResolvedEditShare } from "../durable-objects/workspace-access";
import { handleEditShareRequest, type EditShareEnv } from "./edit-share";

const locator = "11111111-1111-4111-8111-111111111111";
const token = "a".repeat(43);
const fileId = "22222222-2222-4222-8222-222222222222";
const editPath = `/edit/${locator}.${token}`;
const snapshot: WorkspaceSnapshot = {
  id: "workspace-1",
  title: "Shared draft",
  entryFileId: fileId,
  files: [
    {
      id: fileId,
      path: "main.md",
      mediaType: "text/markdown",
      content: "# Shared draft\n",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    },
  ],
  composition: { content: "# Shared draft\n", sourceMap: [], diagnostics: [], dependencies: {} },
  source: "# Shared draft\n",
  bibliography: "",
  revision: 4,
  publicationProfile: { citationStyle: "apa", locale: "en-US", submissionTemplate: "article", paperSize: "a4" },
  pdfs: [],
  publications: [],
  projectReferences: [],
  researchShares: [],
  publicationPdfLinks: [],
  annotations: [],
  links: [],
  claims: [],
  claimEvidenceLinks: [],
  claimLinks: [],
  comments: [],
  candidates: [],
};

describe("edit share API", () => {
  it("ignores unrelated routes and requires bindings for an edit route", async () => {
    await expect(handleEditShareRequest(new Request("http://example.com/workspaces/demo"))).resolves.toBeNull();
    const response = await handleEditShareRequest(new Request(`http://example.com${editPath}`));
    expect(response?.status).toBe(503);
  });

  it("hides invalid capabilities behind not-found responses", async () => {
    const env = editEnv({ valid: false, target: null });
    const page = await handleEditShareRequest(new Request(`http://example.com${editPath}`), env);
    expect(page?.status).toBe(404);
    expect(await page?.text()).toContain("Not Found");

    const mutation = await handleEditShareRequest(jsonRequest(`${editPath}/files/${fileId}`, { content: "denied", revision: 4 }), env);
    expect(mutation?.status).toBe(404);
    await expect(mutation?.json()).resolves.toEqual({ error: "Edit link not found" });
  });

  it("renders only the scoped editor, snapshot, and PDF", async () => {
    const env = editEnv();
    const page = await handleEditShareRequest(new Request(`http://example.com${editPath}`), env);
    expect(page?.status).toBe(200);
    expect(page?.headers.get("cross-origin-embedder-policy")).toBeNull();
    expect(await page?.text()).toContain('id="edit-source"');

    const snapshotResponse = await handleEditShareRequest(new Request(`http://example.com${editPath}/snapshot`), env);
    expect(snapshotResponse?.headers.get("cache-control")).toBe("no-store");
    await expect(snapshotResponse?.json()).resolves.toEqual({
      title: snapshot.title,
      revision: snapshot.revision,
      entryFileId: snapshot.entryFileId,
      files: [{ id: fileId, path: "main.md", content: "# Shared draft\n" }],
    });

    const pdf = await handleEditShareRequest(new Request(`http://example.com${editPath}/document.pdf`), env);
    expect(pdf?.headers.get("content-type")).toBe("application/pdf");
    expect(new TextDecoder().decode((await pdf?.arrayBuffer())?.slice(0, 4))).toBe("%PDF");

    const unsupported = await handleEditShareRequest(new Request(`http://example.com${editPath}`, { method: "POST" }), env);
    expect(unsupported?.status).toBe(404);
  });

  it("applies bounded same-origin edits at the expected revision", async () => {
    const replacement = vi.fn(async () => ({ ...snapshot, revision: 5 }));
    const env = editEnv(undefined, replacement);
    const denied = await handleEditShareRequest(
      jsonRequest(`${editPath}/files/${fileId}`, { content: "hostile", revision: 4 }, "https://attacker.example"),
      env,
    );
    expect(denied?.status).toBe(403);

    const saved = await handleEditShareRequest(jsonRequest(`${editPath}/files/${fileId}`, { content: "# Revised\n", revision: 4 }), env);
    expect(saved?.status).toBe(200);
    expect(replacement).toHaveBeenCalledWith("workspace-1", fileId, "# Revised\n", 4);
    await expect(saved?.json()).resolves.toMatchObject({ revision: 5 });
  });

  it("rejects malformed, oversized, stale, and missing-file edits", async () => {
    const env = editEnv();
    const malformed = await handleEditShareRequest(
      new Request(`http://example.com${editPath}/files/${fileId}`, {
        method: "PATCH",
        headers: { origin: "http://example.com", "content-type": "application/json" },
        body: "{",
      }),
      env,
    );
    expect(malformed?.status).toBe(400);

    const oversized = await handleEditShareRequest(
      new Request(`http://example.com${editPath}/files/${fileId}`, {
        method: "PATCH",
        headers: { origin: "http://example.com", "content-length": "8100001" },
        body: "{}",
      }),
      env,
    );
    expect(oversized?.status).toBe(413);

    const invalid = await handleEditShareRequest(jsonRequest(`${editPath}/files/${fileId}`, { content: "missing revision" }), env);
    expect(invalid?.status).toBe(400);

    for (const [message, status] of [
      ["Project changed since this edit loaded", 409],
      ["Project file not found", 404],
    ] as const) {
      const failing = editEnv(undefined, async () => {
        throw new Error(message);
      });
      const response = await handleEditShareRequest(
        jsonRequest(`${editPath}/files/${fileId}`, { content: "# Edit\n", revision: 4 }),
        failing,
      );
      expect(response?.status).toBe(status);
      await expect(response?.json()).resolves.toEqual({ error: message });
    }
  });
});

function editEnv(
  resolved: ResolvedEditShare = { valid: true, target: { storageKey: "storage-1", workspaceId: "workspace-1" } },
  replaceProjectFileContent: (
    workspaceId: string,
    requestedFileId: string,
    content: string,
    revision: number,
  ) => Promise<WorkspaceSnapshot> = async () => ({ ...snapshot, revision: 5 }),
): EditShareEnv {
  return {
    WORKSPACE_ACCESS: { getByName: () => ({ resolveEditShare: async () => resolved }) },
    DOCUMENT_ROOMS: {
      getByName: () => ({ getSnapshot: async () => snapshot, replaceProjectFileContent }),
    },
  };
}

function jsonRequest(path: string, body: object, origin = "http://example.com"): Request {
  return new Request(`http://example.com${path}`, {
    method: "PATCH",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

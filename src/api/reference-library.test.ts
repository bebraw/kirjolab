import { describe, expect, it, vi } from "vitest";
import type { BibliographicRecord, ReferenceLibrarySnapshot } from "../domain/reference-library";
import type { AuthIdentity } from "../security/auth";
import { handleReferenceLibraryApi } from "./reference-library";

const identity: AuthIdentity = { subject: "owner", email: "owner@example.test", ownerKey: "owner-key", mode: "local" };
const now = "2026-07-11T10:00:00.000Z";
const reference: BibliographicRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "manual",
  title: "Private Guide",
  authors: [],
  year: "",
  venue: "",
  doi: "",
  url: "",
  abstract: "",
  provenance: {},
  archivedAt: null,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
};
const snapshot: ReferenceLibrarySnapshot = {
  references: [reference],
  artifacts: [],
  notes: [],
  highlights: [],
  tags: {},
  reading: [],
};

describe("reference library API", () => {
  it("returns only the selected owner library and supports archived navigation", async () => {
    const fixture = apiFixture();
    const response = await handleReferenceLibraryApi(
      new Request("https://example.test/api/library?archived=include"),
      fixture.env,
      identity,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(snapshot);
    expect(fixture.getByName).toHaveBeenCalledWith("owner-key");
    expect(fixture.library.getSnapshot).toHaveBeenCalledWith(true);
  });

  it("validates and imports bounded BibTeX with the authenticated actor", async () => {
    const fixture = apiFixture();
    const invalid = await handleReferenceLibraryApi(jsonRequest("/api/library/import", { bibtex: "" }), fixture.env, identity);
    expect(invalid.status).toBe(400);
    const imported = await handleReferenceLibraryApi(
      jsonRequest("/api/library/import", { bibtex: "@manual{guide,title={Private Guide}}" }),
      fixture.env,
      identity,
    );
    expect(imported.status).toBe(201);
    expect(fixture.library.importBibTeX).toHaveBeenCalledWith("@manual{guide,title={Private Guide}}", identity.email);
  });

  it("routes private metadata, annotation, archive, and deletion operations", async () => {
    const fixture = apiFixture();
    const id = reference.id;
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}/tags`, { tags: ["methods"] }, "PUT"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(
      (await handleReferenceLibraryApi(jsonRequest(`/api/library/references/${id}/notes`, { body: "Private note" }), fixture.env, identity))
        .status,
    ).toBe(201);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}/highlights`, {
            artifactId: "artifact",
            page: 2,
            quote: "Evidence",
            comment: "Private",
          }),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}/reading`, { status: "reading", rating: 4 }, "PUT"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(
      (await handleReferenceLibraryApi(jsonRequest(`/api/library/references/${id}`, { archived: true }, "PATCH"), fixture.env, identity))
        .status,
    ).toBe(200);
    expect(
      (
        await handleReferenceLibraryApi(
          new Request(`https://example.test/api/library/references/${id}/deletion-impact`),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}`, { expectedProjectIds: ["project"] }, "DELETE"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(fixture.library.setTags).toHaveBeenCalledWith(id, ["methods"]);
    expect(fixture.library.createNote).toHaveBeenCalledWith(id, "Private note");
    expect(fixture.library.createHighlight).toHaveBeenCalledWith(id, "artifact", 2, "Evidence", "Private");
    expect(fixture.library.setReadingState).toHaveBeenCalledWith(id, "reading", 4);
    expect(fixture.library.archiveReference).toHaveBeenCalledWith(id, true);
    expect(fixture.library.permanentlyDeleteReference).toHaveBeenCalledWith(id, ["project"]);
  });

  it("identifies PDFs, records rights, and maps domain errors without leaking cacheable responses", async () => {
    const fixture = apiFixture();
    const artifactId = "22222222-2222-4222-8222-222222222222";
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/pdfs/${artifactId}/identify`, { referenceId: reference.id }),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/pdfs/${artifactId}/rights`, { rights: "shareable" }, "PUT"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    fixture.library.archiveReference.mockRejectedValueOnce(new Error("Reference not found"));
    const missing = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}`, { archived: true }, "PATCH"),
      fixture.env,
      identity,
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
  });
});

function apiFixture() {
  const artifact = {
    id: "22222222-2222-4222-8222-222222222222",
    referenceId: reference.id,
    name: "guide.pdf",
    contentType: "application/pdf",
    size: 100,
    objectKey: "libraries/owner/guide.pdf",
    fingerprint: "r2-etag:guide",
    rights: "private",
    createdAt: now,
  } as const;
  const library = {
    getSnapshot: vi.fn(async () => snapshot),
    importBibTeX: vi.fn(async () => [{ reference, suggestedAlias: "guide", created: true }]),
    registerPdf: vi.fn(async () => artifact),
    identifyPdf: vi.fn(async () => artifact),
    setArtifactRights: vi.fn(async () => ({ ...artifact, rights: "shareable" as const })),
    archiveReference: vi.fn(async () => ({ ...reference, archivedAt: now })),
    setTags: vi.fn(async (_referenceId: string, tags: readonly string[]) => tags),
    createNote: vi.fn(async (referenceId: string, body: string) => ({ id: "note", referenceId, body, createdAt: now, updatedAt: now })),
    createHighlight: vi.fn(async (referenceId: string, artifactId: string, page: number, quote: string, comment: string) => ({
      id: "highlight",
      referenceId,
      artifactId,
      page,
      quote,
      comment,
      createdAt: now,
      updatedAt: now,
    })),
    setReadingState: vi.fn(async (referenceId: string, status: "unread" | "reading" | "read", rating: number | null) => ({
      referenceId,
      status,
      rating,
      updatedAt: now,
    })),
    getDeletionImpact: vi.fn(async () => ({
      referenceId: reference.id,
      projectIds: ["project"],
      artifactCount: 0,
      noteCount: 0,
      highlightCount: 0,
    })),
    permanentlyDeleteReference: vi.fn(async () => ({ ...reference, deletedAt: now })),
  };
  const getByName = vi.fn(() => library);
  return {
    library,
    getByName,
    env: {
      REFERENCE_LIBRARIES: { getByName },
      PAPERS: {
        put: async (): Promise<never> => {
          throw new Error("Unexpected R2 put");
        },
        get: async (): Promise<never> => {
          throw new Error("Unexpected R2 get");
        },
        delete: async (): Promise<never> => {
          throw new Error("Unexpected R2 delete");
        },
      },
    },
  };
}

function jsonRequest(path: string, body: object, method = "POST"): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

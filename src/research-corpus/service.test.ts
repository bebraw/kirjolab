import { describe, expect, it, vi } from "vitest";
import type { ArtifactAnalysis, LibraryPdfArtifact, ReferenceLibrarySnapshot } from "../domain/reference-library";
import {
  CorpusInvalidCursorError,
  CorpusNotFoundError,
  CorpusNotReadyError,
  ResearchCorpusService,
  type CorpusServicePorts,
} from "./service";

const createdAt = "2026-08-24T08:00:00.000Z";
const referenceId = "11111111-1111-4111-8111-111111111111";
const firstArtifact = artifact("22222222-2222-4222-8222-222222222222", "paper-a.pdf", "r2/private/a.pdf");
const secondArtifact = artifact("33333333-3333-4333-8333-333333333333", "paper-b.pdf", "r2/private/b.pdf");

describe("ResearchCorpusService", () => {
  it("projects bounded artifact pages without private storage locators", async () => {
    const { service } = fixture();

    const firstPage = await service.listArtifacts({ limit: 1 });
    if (!firstPage.next) throw new Error("Expected another artifact page");
    const secondPage = await service.listArtifacts({ limit: 1, after: firstPage.next });

    expect(firstPage).toEqual({
      artifacts: [
        expect.objectContaining({
          id: firstArtifact.id,
          name: "paper-a.pdf",
          source: expect.objectContaining({ id: referenceId, title: "Bounded research" }),
        }),
      ],
      next: firstArtifact.id,
    });
    expect(secondPage.artifacts).toHaveLength(1);
    expect(JSON.stringify(firstPage)).not.toContain("r2/private");
    expect(JSON.stringify(firstPage)).not.toContain("owner-key");
  });

  it("rejects unknown cursors instead of silently returning a misleading page", async () => {
    const { service } = fixture();

    await expect(service.listArtifacts({ after: crypto.randomUUID() })).rejects.toBeInstanceOf(CorpusInvalidCursorError);
  });

  it("looks up an owner-scoped artifact and never returns its object key", async () => {
    const { service } = fixture();

    const result = await service.getArtifact(firstArtifact.id);

    expect(result).toEqual(expect.objectContaining({ id: firstArtifact.id, fingerprint: firstArtifact.fingerprint }));
    expect(result).not.toHaveProperty("objectKey");
    await expect(service.getArtifact(crypto.randomUUID())).rejects.toBeInstanceOf(CorpusNotFoundError);
  });

  it("ingests a PDF through the authority and projects only the safe artifact contract", async () => {
    const { service, ports } = fixture();
    const body = new Blob(["%PDF"]).stream();

    const result = await service.ingestPdf({ name: "draft.pdf", size: 4, body });

    expect(ports.intake.ingest).toHaveBeenCalledWith({ name: "draft.pdf", size: 4, body });
    expect(result).toEqual({
      artifact: expect.objectContaining({ id: firstArtifact.id, name: "paper-a.pdf" }),
      created: true,
    });
    expect(JSON.stringify(result)).not.toContain(firstArtifact.objectKey);
  });

  it("keeps extraction requests idempotent and retries failures only explicitly", async () => {
    const ready = analysis("ready");
    const failed = analysis("failed");
    const { service, ports } = fixture({ currentAnalysis: ready });

    await expect(service.startExtraction(firstArtifact.id, "pdf-text")).resolves.toEqual(expect.objectContaining({ status: "ready" }));
    expect(ports.extractions.start).not.toHaveBeenCalled();

    ports.extractions.get = vi.fn(async () => failed);
    await expect(service.startExtraction(firstArtifact.id, "pdf-text")).resolves.toEqual(expect.objectContaining({ status: "failed" }));
    expect(ports.extractions.start).not.toHaveBeenCalled();

    await service.startExtraction(firstArtifact.id, "pdf-text", true);
    expect(ports.extractions.start).toHaveBeenCalledWith(firstArtifact, "pdf-text", true);
  });

  it("returns one ready text page with extraction provenance", async () => {
    const { service } = fixture({ currentAnalysis: analysis("ready") });

    await expect(service.readPdfTextPage(firstArtifact.id, 2)).resolves.toEqual({
      artifactId: firstArtifact.id,
      fingerprint: firstArtifact.fingerprint,
      page: 2,
      text: "Second page",
      source: "ocr",
      pagesScanned: 2,
      pagesTotal: 2,
      truncated: false,
    });
  });

  it("distinguishes incomplete extraction from missing jobs and pages", async () => {
    const pending = fixture({ currentAnalysis: analysis("running") }).service;
    const absent = fixture({ currentAnalysis: null }).service;
    const ready = fixture({ currentAnalysis: analysis("ready") }).service;

    await expect(pending.readPdfTextPage(firstArtifact.id, 1)).rejects.toBeInstanceOf(CorpusNotReadyError);
    await expect(absent.readPdfTextPage(firstArtifact.id, 1)).rejects.toBeInstanceOf(CorpusNotFoundError);
    await expect(ready.readPdfTextPage(firstArtifact.id, 3)).rejects.toBeInstanceOf(CorpusNotFoundError);
  });

  it("resolves original bytes only after owner-scoped artifact lookup", async () => {
    const { service, ports } = fixture();
    const request = new Request(`https://corpus.example/v1/artifacts/${firstArtifact.id}/representations/original`);

    const response = await service.openOriginal(request, firstArtifact.id);

    expect(await response.text()).toBe("pdf-bytes");
    expect(ports.originals.open).toHaveBeenCalledWith(request, firstArtifact);
  });
});

function fixture(options: { readonly currentAnalysis?: ArtifactAnalysis | null } = {}) {
  const currentAnalysis = options.currentAnalysis === undefined ? analysis("queued") : options.currentAnalysis;
  const ports: CorpusServicePorts = {
    catalog: {
      snapshot: vi.fn(async () => snapshot()),
    },
    intake: {
      ingest: vi.fn(async () => ({ reference: snapshot().references[0]!, artifact: firstArtifact, created: true })),
    },
    extractions: {
      get: vi.fn(async () => currentAnalysis),
      start: vi.fn(async (_artifact, kind) => analysis("queued", kind)),
    },
    originals: {
      open: vi.fn(async () => new Response("pdf-bytes", { headers: { "content-type": "application/pdf" } })),
    },
  };
  return { service: new ResearchCorpusService(ports), ports };
}

function snapshot(): ReferenceLibrarySnapshot {
  return {
    references: [
      {
        id: referenceId,
        referenceKey: "bounded2026research",
        type: "article",
        title: "Bounded research",
        authors: ["Ada Example"],
        year: "2026",
        venue: "Journal of Boundaries",
        doi: "10.1000/bounded",
        url: "https://example.test/research",
        abstract: "Reusable evidence.",
        provenance: {},
        archivedAt: null,
        deletedAt: null,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    referenceKeyStates: { [referenceId]: "final" },
    artifacts: [firstArtifact, secondArtifact],
    webSources: [],
    webSnapshots: [],
    notes: [],
    highlights: [],
    tags: {},
    collections: {},
    reading: [],
  };
}

function artifact(id: string, name: string, objectKey: string): LibraryPdfArtifact {
  return {
    id,
    referenceId,
    name,
    contentType: "application/pdf",
    size: 42,
    objectKey,
    fingerprint: `sha256:${id}`,
    rights: "private",
    createdAt,
  };
}

function analysis(status: ArtifactAnalysis["status"], kind: ArtifactAnalysis["kind"] = "pdf-text"): ArtifactAnalysis {
  return {
    artifactId: firstArtifact.id,
    fingerprint: firstArtifact.fingerprint,
    kind,
    status,
    result:
      status === "ready" && kind === "pdf-text"
        ? {
            pages: [
              { page: 1, text: "First page", source: "native" },
              { page: 2, text: "Second page", source: "ocr" },
            ],
            pagesScanned: 2,
            pagesTotal: 2,
            ocrPages: 1,
            truncated: false,
          }
        : null,
    error: status === "failed" ? "failed" : "",
    requestedAt: createdAt,
    startedAt: status === "queued" ? null : createdAt,
    completedAt: status === "ready" || status === "failed" ? createdAt : null,
  };
}

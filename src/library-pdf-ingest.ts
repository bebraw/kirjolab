import { enqueueArtifactAnalysis, type ArtifactAnalysisJobLibrary, type ArtifactAnalysisJobQueue } from "./artifact-analysis-job";
import type { LibraryPdfArtifact, PdfDraftResult } from "./domain/reference-library";

export interface LibraryPdfIngestInput {
  readonly actor: string;
  readonly body: ReadableStream<Uint8Array>;
  readonly name: string;
  readonly ownerKey: string;
  readonly size: number;
}

export interface LibraryPdfIngestAuthority extends ArtifactAnalysisJobLibrary {
  createPdfDraft(artifact: LibraryPdfArtifact, actor: string): Promise<PdfDraftResult>;
}

export interface LibraryPdfIngestStorage {
  put(
    key: string,
    value: ReadableStream<Uint8Array>,
    options: { readonly httpMetadata: { readonly contentType: "application/pdf" } },
  ): Promise<{ readonly etag: string }>;
  delete(key: string): Promise<unknown>;
}

interface FixedLengthStreamLike {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

export interface LibraryPdfIngestDependencies {
  readonly authority: LibraryPdfIngestAuthority;
  readonly queue?: ArtifactAnalysisJobQueue;
  readonly storage: LibraryPdfIngestStorage;
  readonly createFixedLengthStream?: (size: number) => FixedLengthStreamLike;
  readonly now?: () => Date;
  readonly randomUUID?: () => string;
}

export async function ingestLibraryPdf(input: LibraryPdfIngestInput, dependencies: LibraryPdfIngestDependencies): Promise<PdfDraftResult> {
  const id = dependencies.randomUUID ? dependencies.randomUUID() : crypto.randomUUID();
  const objectKey = `libraries/${input.ownerKey}/${id}.pdf`;
  const stream = (dependencies.createFixedLengthStream ?? ((size) => new FixedLengthStream(size)))(input.size);
  const upload = dependencies.storage.put(objectKey, stream.readable, { httpMetadata: { contentType: "application/pdf" } });
  const pipeline = input.body.pipeTo(stream.writable);
  const [stored] = await Promise.all([upload, pipeline]);
  const artifact: LibraryPdfArtifact = {
    id,
    referenceId: null,
    name: input.name,
    contentType: "application/pdf",
    size: input.size,
    objectKey,
    fingerprint: `r2-etag:${stored.etag.replaceAll('"', "")}`,
    rights: "private",
    createdAt: (dependencies.now ?? (() => new Date()))().toISOString(),
  };
  let draft: PdfDraftResult;
  try {
    draft = await dependencies.authority.createPdfDraft(artifact, input.actor);
  } catch (error) {
    await dependencies.storage.delete(objectKey);
    throw error;
  }
  if (!draft.created) await dependencies.storage.delete(objectKey);
  await Promise.all([
    enqueueArtifactAnalysis(input.ownerKey, draft.artifact.id, "pdf-highlights", dependencies.queue, dependencies.authority),
    enqueueArtifactAnalysis(input.ownerKey, draft.artifact.id, "pdf-references", dependencies.queue, dependencies.authority),
    enqueueArtifactAnalysis(input.ownerKey, draft.artifact.id, "pdf-text", dependencies.queue, dependencies.authority),
  ]);
  return draft;
}

export function normalizePdfFilename(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new SyntaxError("PDF file name is invalid");
  }
  const sanitized = decoded.replaceAll(/[\r\n"/\\]/gu, "-").trim();
  return sanitized.toLowerCase().endsWith(".pdf") ? sanitized : `${sanitized || "paper"}.pdf`;
}

import { enqueueArtifactAnalysis, type ArtifactAnalysisJobLibrary, type ArtifactAnalysisJobQueue } from "./artifact-analysis-job";
import type { LibraryPdfArtifact, PdfDraftResult } from "./domain/reference-library";
import { readExactPdfBytes, reservePdfBlob, storePdfBlob, type PdfBlobAuthorityNamespace, type PdfBlobStorage } from "./pdf-blob";

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

export interface LibraryPdfIngestDependencies {
  readonly authority: LibraryPdfIngestAuthority;
  readonly queue?: ArtifactAnalysisJobQueue;
  readonly storage: PdfBlobStorage;
  readonly blobAuthority?: PdfBlobAuthorityNamespace;
  readonly now?: () => Date;
  readonly randomUUID?: () => string;
}

export async function ingestLibraryPdf(input: LibraryPdfIngestInput, dependencies: LibraryPdfIngestDependencies): Promise<PdfDraftResult> {
  const id = dependencies.randomUUID ? dependencies.randomUUID() : crypto.randomUUID();
  const bytes = await readExactPdfBytes(input.body, input.size);
  const reservation = dependencies.blobAuthority
    ? await reservePdfBlob(dependencies.blobAuthority, bytes, `library:${input.ownerKey}:${id}`)
    : undefined;
  const blob = reservation?.blob ?? (await storePdfBlob(dependencies.storage, bytes));
  const artifact: LibraryPdfArtifact = {
    id,
    referenceId: null,
    name: input.name,
    contentType: "application/pdf",
    size: input.size,
    objectKey: blob.objectKey,
    fingerprint: blob.fingerprint,
    rights: "private",
    createdAt: (dependencies.now ?? (() => new Date()))().toISOString(),
  };
  const draft = await dependencies.authority.createPdfDraft(artifact, input.actor);
  if (draft.created) await reservation?.commit();
  else await reservation?.release();
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

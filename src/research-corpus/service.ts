import {
  isPdfTextAnalysisResult,
  type ArtifactAnalysis,
  type ArtifactAnalysisKind,
  type BibliographicRecord,
  type LibraryPdfArtifact,
  type LibraryPdfArtifactItem,
  type LibraryPdfArtifactPage,
  type MetadataFieldProvenance,
  type MetadataProvenanceMethod,
  type PdfDraftResult,
  type ReferenceMetadataField,
} from "../domain/reference-library";

const defaultPageSize = 50;
const maximumPageSize = 100;

export interface CorpusSource {
  readonly id: string;
  readonly referenceKey: string;
  readonly type: BibliographicRecord["type"];
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: string;
  readonly venue: string;
  readonly doi: string;
  readonly url: string;
  readonly abstract: string;
  readonly provenance: BibliographicRecord["provenance"];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CorpusArtifact {
  readonly id: string;
  readonly referenceId: string | null;
  readonly name: string;
  readonly contentType: "application/pdf";
  readonly size: number;
  readonly fingerprint: string;
  readonly rights: LibraryPdfArtifact["rights"];
  readonly createdAt: string;
  readonly source: CorpusSource | null;
}

export interface CorpusArtifactPage {
  readonly artifacts: readonly CorpusArtifact[];
  readonly next: string | null;
}

export interface CorpusPdfUpload {
  readonly body: ReadableStream<Uint8Array>;
  readonly name: string;
  readonly size: number;
}

export interface CorpusPdfIngestion {
  readonly artifact: CorpusArtifact;
  readonly created: boolean;
}

export interface CorpusExtraction {
  readonly artifactId: string;
  readonly fingerprint: string;
  readonly kind: ArtifactAnalysisKind;
  readonly status: ArtifactAnalysis["status"];
  readonly error: string;
  readonly requestedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

export interface CorpusPdfTextPage {
  readonly artifactId: string;
  readonly fingerprint: string;
  readonly page: number;
  readonly text: string;
  readonly source: "native" | "ocr";
  readonly pagesScanned: number;
  readonly pagesTotal: number;
  readonly truncated: boolean;
}

export interface CorpusCatalogPort {
  page(after: string | null, limit: number): Promise<LibraryPdfArtifactPage | null>;
  find(artifactId: string): Promise<LibraryPdfArtifactItem | null>;
}

export interface CorpusIntakePort {
  ingest(input: CorpusPdfUpload): Promise<PdfDraftResult>;
}

export interface CorpusExtractionPort {
  get(artifactId: string, kind: ArtifactAnalysisKind): Promise<ArtifactAnalysis | null>;
  start(artifact: LibraryPdfArtifact, kind: ArtifactAnalysisKind, force: boolean): Promise<ArtifactAnalysis>;
}

export interface CorpusOriginalPort {
  open(request: Request, artifact: LibraryPdfArtifact): Promise<Response | null>;
}

export interface CorpusServicePorts {
  readonly catalog: CorpusCatalogPort;
  readonly intake: CorpusIntakePort;
  readonly extractions: CorpusExtractionPort;
  readonly originals: CorpusOriginalPort;
}

export interface CorpusApplication {
  listArtifacts(options?: { readonly after?: string; readonly limit?: number }): Promise<CorpusArtifactPage>;
  ingestPdf(input: CorpusPdfUpload): Promise<CorpusPdfIngestion>;
  getArtifact(artifactId: string): Promise<CorpusArtifact>;
  getExtraction(artifactId: string, kind: ArtifactAnalysisKind): Promise<CorpusExtraction | null>;
  startExtraction(artifactId: string, kind: ArtifactAnalysisKind, retryFailed?: boolean): Promise<CorpusExtraction>;
  readPdfTextPage(artifactId: string, page: number): Promise<CorpusPdfTextPage>;
  openOriginal(request: Request, artifactId: string): Promise<Response>;
}

export class CorpusNotFoundError extends Error {}
export class CorpusNotReadyError extends Error {}
export class CorpusInvalidCursorError extends Error {}
export class CorpusInvalidInputError extends Error {}

export class ResearchCorpusService implements CorpusApplication {
  readonly #ports: CorpusServicePorts;

  constructor(ports: CorpusServicePorts) {
    this.#ports = ports;
  }

  async listArtifacts(options: { readonly after?: string; readonly limit?: number } = {}): Promise<CorpusArtifactPage> {
    const limit = options.limit ?? defaultPageSize;
    if (!Number.isInteger(limit) || limit < 1 || limit > maximumPageSize) {
      throw new CorpusInvalidInputError(`Artifact page size must be between 1 and ${maximumPageSize}`);
    }
    const page = await this.#ports.catalog.page(options.after ?? null, limit);
    if (!page) throw new CorpusInvalidCursorError("Artifact cursor is invalid");
    return {
      artifacts: page.items.map(({ artifact, reference }) => projectArtifact(artifact, reference)),
      next: page.next,
    };
  }

  async getArtifact(artifactId: string): Promise<CorpusArtifact> {
    const { artifact, reference } = await this.#findArtifact(artifactId);
    return projectArtifact(artifact, reference);
  }

  async ingestPdf(input: CorpusPdfUpload): Promise<CorpusPdfIngestion> {
    const result = await this.#ports.intake.ingest(input);
    return { artifact: projectArtifact(result.artifact, result.reference), created: result.created };
  }

  async getExtraction(artifactId: string, kind: ArtifactAnalysisKind): Promise<CorpusExtraction | null> {
    const { artifact } = await this.#findArtifact(artifactId);
    const analysis = await this.#ports.extractions.get(artifactId, kind);
    return analysis && analysis.fingerprint === artifact.fingerprint ? projectExtraction(analysis) : null;
  }

  async startExtraction(artifactId: string, kind: ArtifactAnalysisKind, retryFailed = false): Promise<CorpusExtraction> {
    const { artifact } = await this.#findArtifact(artifactId);
    const current = await this.#ports.extractions.get(artifactId, kind);
    const currentMatches = current?.fingerprint === artifact.fingerprint;
    if (currentMatches && current.status !== "failed") return projectExtraction(current);
    if (currentMatches && !retryFailed) return projectExtraction(current);
    return projectExtraction(await this.#ports.extractions.start(artifact, kind, currentMatches && retryFailed));
  }

  async readPdfTextPage(artifactId: string, page: number): Promise<CorpusPdfTextPage> {
    if (!Number.isInteger(page) || page < 1 || page > 200) throw new CorpusNotFoundError("PDF text page not found");
    const { artifact } = await this.#findArtifact(artifactId);
    const analysis = await this.#ports.extractions.get(artifactId, "pdf-text");
    if (!analysis || analysis.fingerprint !== artifact.fingerprint) throw new CorpusNotFoundError("PDF text extraction not found");
    if (analysis.status !== "ready") throw new CorpusNotReadyError("PDF text extraction is not ready");
    if (!isPdfTextAnalysisResult(analysis.result)) throw new CorpusNotFoundError("PDF text extraction result not found");
    const resultPage = analysis.result.pages.find((candidate) => candidate.page === page);
    if (!resultPage) throw new CorpusNotFoundError("PDF text page not found");
    return {
      artifactId,
      fingerprint: artifact.fingerprint,
      page: resultPage.page,
      text: resultPage.text,
      source: resultPage.source,
      pagesScanned: analysis.result.pagesScanned,
      pagesTotal: analysis.result.pagesTotal,
      truncated: analysis.result.truncated,
    };
  }

  async openOriginal(request: Request, artifactId: string): Promise<Response> {
    const { artifact } = await this.#findArtifact(artifactId);
    const response = await this.#ports.originals.open(request, artifact);
    if (!response) throw new CorpusNotFoundError("Original artifact representation not found");
    return response;
  }

  async #findArtifact(artifactId: string): Promise<LibraryPdfArtifactItem> {
    const item = await this.#ports.catalog.find(artifactId);
    if (!item) throw new CorpusNotFoundError("Artifact not found");
    return item;
  }
}

function projectArtifact(artifact: LibraryPdfArtifact, reference: BibliographicRecord | null): CorpusArtifact {
  return {
    id: artifact.id,
    referenceId: artifact.referenceId,
    name: artifact.name,
    contentType: artifact.contentType,
    size: artifact.size,
    fingerprint: artifact.fingerprint,
    rights: artifact.rights,
    createdAt: artifact.createdAt,
    source: reference ? projectSource(reference) : null,
  };
}

function projectSource(reference: BibliographicRecord): CorpusSource {
  return {
    id: reference.id,
    referenceKey: reference.referenceKey,
    type: reference.type,
    title: reference.title,
    authors: [...reference.authors],
    year: reference.year,
    venue: reference.venue,
    doi: reference.doi,
    url: reference.url,
    abstract: reference.abstract,
    provenance: projectProvenance(reference.provenance),
    createdAt: reference.createdAt,
    updatedAt: reference.updatedAt,
  };
}

function projectExtraction(analysis: ArtifactAnalysis): CorpusExtraction {
  return {
    artifactId: analysis.artifactId,
    fingerprint: analysis.fingerprint,
    kind: analysis.kind,
    status: analysis.status,
    error: analysis.status === "failed" ? "Artifact extraction failed" : "",
    requestedAt: analysis.requestedAt,
    startedAt: analysis.startedAt,
    completedAt: analysis.completedAt,
  };
}

const referenceMetadataFields: readonly ReferenceMetadataField[] = ["type", "title", "authors", "year", "venue", "doi", "url", "abstract"];
const metadataProvenanceMethods = new Set<string>([
  "bibtex",
  "openalex",
  "crossref",
  "datacite",
  "semantic-scholar",
  "filename",
  "manual",
  "pdf-metadata",
  "pdf-reference",
  "web",
  "migration",
]);

function projectProvenance(
  provenance: BibliographicRecord["provenance"],
): Partial<Record<ReferenceMetadataField, MetadataFieldProvenance>> {
  const projected: Partial<Record<ReferenceMetadataField, MetadataFieldProvenance>> = {};
  for (const field of referenceMetadataFields) {
    const value = provenance[field];
    if (!isMetadataFieldProvenance(value)) continue;
    projected[field] = { method: value.method, capturedAt: value.capturedAt, actor: value.actor };
  }
  return projected;
}

function isMetadataFieldProvenance(value: unknown): value is MetadataFieldProvenance {
  return (
    typeof value === "object" &&
    value !== null &&
    "method" in value &&
    isMetadataProvenanceMethod(value.method) &&
    "capturedAt" in value &&
    typeof value.capturedAt === "string" &&
    "actor" in value &&
    typeof value.actor === "string"
  );
}

function isMetadataProvenanceMethod(value: unknown): value is MetadataProvenanceMethod {
  return typeof value === "string" && metadataProvenanceMethods.has(value);
}

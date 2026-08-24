import { enqueueArtifactAnalysis, type ArtifactAnalysisJobLibrary } from "../artifact-analysis-job";
import { downloadR2Object } from "../api/r2-download";
import {
  isArtifactAnalysis,
  isLibraryPdfArtifactItem,
  isLibraryPdfArtifactPage,
  type ArtifactAnalysis,
  type ArtifactAnalysisKind,
} from "../domain/reference-library";
import { ingestLibraryPdf, type LibraryPdfIngestAuthority } from "../library-pdf-ingest";
import { ResearchCorpusService } from "./service";

export interface CorpusLibraryAuthority extends ArtifactAnalysisJobLibrary, LibraryPdfIngestAuthority {
  getCorpusPdfArtifactPage(after: string | null, limit: number): Promise<unknown>;
  getPdfArtifact(artifactId: string): Promise<unknown>;
  getArtifactAnalysis(artifactId: string, kind: ArtifactAnalysisKind): Promise<unknown>;
}

export interface CorpusCloudflareEnvironment {
  readonly REFERENCE_LIBRARIES: { getByName(ownerKey: string): CorpusLibraryAuthority };
  readonly ARTIFACT_ANALYSIS_QUEUE: Pick<ResearchCorpusBindings["ARTIFACT_ANALYSIS_QUEUE"], "send">;
  readonly PAPERS: Pick<ResearchCorpusBindings["PAPERS"], "delete" | "get" | "put">;
}

export function createCloudflareCorpusService(ownerKey: string, actor: string, env: CorpusCloudflareEnvironment): ResearchCorpusService {
  const library = env.REFERENCE_LIBRARIES.getByName(ownerKey);
  return new ResearchCorpusService({
    catalog: {
      page: async (after, limit) => {
        const page = await library.getCorpusPdfArtifactPage(after, limit);
        if (page !== null && (!isLibraryPdfArtifactPage(page) || page.items.length > limit)) {
          throw new Error("Research Corpus authority returned an invalid artifact page");
        }
        return page;
      },
      find: async (artifactId) => {
        const item = await library.getPdfArtifact(artifactId);
        if (item !== null && !isLibraryPdfArtifactItem(item)) {
          throw new Error("Research Corpus authority returned an invalid artifact record");
        }
        return item;
      },
    },
    intake: {
      ingest: async (input) =>
        await ingestLibraryPdf(
          { actor, body: input.body, name: input.name, ownerKey, size: input.size },
          {
            authority: library,
            queue: env.ARTIFACT_ANALYSIS_QUEUE,
            storage: env.PAPERS,
          },
        ),
    },
    extractions: {
      get: async (artifactId, kind) => validatedAnalysis(await library.getArtifactAnalysis(artifactId, kind)),
      start: async (artifact, kind, force) =>
        await enqueueArtifactAnalysis(ownerKey, artifact.id, kind, env.ARTIFACT_ANALYSIS_QUEUE, library, force),
    },
    originals: {
      open: async (request, artifact) =>
        await downloadR2Object(request, env.PAPERS, artifact.objectKey, {
          cacheControl: "private, no-store",
          contentDisposition: "inline",
        }),
    },
  });
}

function validatedAnalysis(value: unknown): ArtifactAnalysis | null {
  if (value === null) return null;
  if (!isArtifactAnalysis(value)) throw new Error("Research Corpus authority returned invalid extraction state");
  return value;
}

import { enqueueArtifactAnalysis, type ArtifactAnalysisJobLibrary, type ArtifactAnalysisJobQueue } from "../artifact-analysis-job";
import { downloadR2Object } from "../api/r2-download";
import {
  isArtifactAnalysis,
  isReferenceLibrarySnapshot,
  type ArtifactAnalysis,
  type ArtifactAnalysisKind,
} from "../domain/reference-library";
import { ResearchCorpusService } from "./service";

export interface CorpusLibraryAuthority extends ArtifactAnalysisJobLibrary {
  getSnapshot(includeArchived?: boolean): Promise<unknown>;
  getArtifactAnalysis(artifactId: string, kind: ArtifactAnalysisKind): Promise<unknown>;
}

export interface CorpusCloudflareEnvironment {
  readonly REFERENCE_LIBRARIES: { getByName(ownerKey: string): CorpusLibraryAuthority };
  readonly ARTIFACT_ANALYSIS_QUEUE?: ArtifactAnalysisJobQueue;
  readonly PAPERS: Pick<R2Bucket, "get">;
}

export function createCloudflareCorpusService(ownerKey: string, env: CorpusCloudflareEnvironment): ResearchCorpusService {
  const library = env.REFERENCE_LIBRARIES.getByName(ownerKey);
  return new ResearchCorpusService({
    catalog: {
      snapshot: async () => {
        const snapshot = await library.getSnapshot(true);
        if (!isReferenceLibrarySnapshot(snapshot)) throw new Error("Research Corpus authority returned an invalid snapshot");
        return snapshot;
      },
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

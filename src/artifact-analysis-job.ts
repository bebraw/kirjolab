import type { ArtifactAnalysis, ArtifactAnalysisJob, ArtifactAnalysisKind } from "./domain/reference-library";

export interface ArtifactAnalysisJobLibrary {
  queueArtifactAnalysis(artifactId: string, kind: ArtifactAnalysisKind, requestedAt: string, force?: boolean): Promise<ArtifactAnalysis>;
  failArtifactAnalysis(
    artifactId: string,
    kind: ArtifactAnalysisKind,
    fingerprint: string,
    requestedAt: string,
    error: string,
  ): Promise<boolean>;
}

export interface ArtifactAnalysisJobQueue {
  send(job: ArtifactAnalysisJob, options: { readonly contentType: "json" }): Promise<unknown>;
}

export async function enqueueArtifactAnalysis(
  ownerKey: string,
  artifactId: string,
  kind: ArtifactAnalysisKind,
  queue: ArtifactAnalysisJobQueue | undefined,
  library: ArtifactAnalysisJobLibrary,
  force = false,
  now: () => string = () => new Date().toISOString(),
): Promise<ArtifactAnalysis> {
  const requestedAt = now();
  if (!queue) return unavailableAnalysis(artifactId, kind, requestedAt);

  const analysis = await library.queueArtifactAnalysis(artifactId, kind, requestedAt, force);
  if (analysis.status !== "queued") return analysis;
  const job: ArtifactAnalysisJob = {
    version: 1,
    ownerKey,
    artifactId,
    fingerprint: analysis.fingerprint,
    kind,
    requestedAt: analysis.requestedAt,
  };
  try {
    await queue.send(job, { contentType: "json" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Artifact analysis could not be queued";
    await library.failArtifactAnalysis(artifactId, kind, analysis.fingerprint, analysis.requestedAt, message);
    return { ...analysis, status: "failed", error: message.slice(0, 1_000), completedAt: now() };
  }
  return analysis;
}

function unavailableAnalysis(artifactId: string, kind: ArtifactAnalysisKind, requestedAt: string): ArtifactAnalysis {
  return {
    artifactId,
    fingerprint: "",
    kind,
    status: "failed",
    result: null,
    error: "Artifact analysis queue is unavailable",
    requestedAt,
    startedAt: null,
    completedAt: requestedAt,
  };
}

import type {
  ArtifactAnalysis,
  ArtifactAnalysisJob,
  ArtifactAnalysisKind,
  ArtifactAnalysisQueueReservation,
} from "./domain/reference-library";

export interface ArtifactAnalysisJobLibrary {
  reserveArtifactAnalysisQueuePublication(
    artifactId: string,
    kind: ArtifactAnalysisKind,
    requestedAt: string,
    force?: boolean,
  ): Promise<ArtifactAnalysisQueueReservation>;
  confirmArtifactAnalysisQueuePublication(
    artifactId: string,
    kind: ArtifactAnalysisKind,
    fingerprint: string,
    requestedAt: string,
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

  const reservation = await library.reserveArtifactAnalysisQueuePublication(artifactId, kind, requestedAt, force);
  const { analysis } = reservation;
  if (!reservation.shouldPublish) return analysis;
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
    await library.confirmArtifactAnalysisQueuePublication(artifactId, kind, analysis.fingerprint, analysis.requestedAt);
  } catch {
    return analysis;
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

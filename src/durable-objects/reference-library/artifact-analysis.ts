import {
  isPdfHighlightAnalysisResult,
  isPdfReferenceAnalysisResult,
  isPdfTextAnalysisResult,
  type ArtifactAnalysis,
  type ArtifactAnalysisKind,
  type ArtifactAnalysisQueueReservation,
  type ArtifactAnalysisResult,
} from "../../domain/reference-library/artifact-analysis";

interface ArtifactFingerprintRow extends Record<string, SqlStorageValue> {
  readonly fingerprint: string;
}

interface ArtifactAnalysisRow extends Record<string, SqlStorageValue> {
  readonly artifact_id: string;
  readonly fingerprint: string;
  readonly kind: string;
  readonly status: string;
  readonly result_json: string;
  readonly error: string;
  readonly requested_at: string;
  readonly started_at: string | null;
  readonly completed_at: string | null;
}

export class ArtifactAnalysisService {
  constructor(private readonly sql: SqlStorage) {}

  get(artifactId: string, kind: ArtifactAnalysisKind): ArtifactAnalysis | null {
    const row = this.#row(artifactId, kind);
    return row ? artifactAnalysisFromRow(row) : null;
  }

  queue(artifactId: string, kind: ArtifactAnalysisKind, requestedAt: string, force = false): ArtifactAnalysisQueueReservation {
    const artifact = this.sql.exec<ArtifactFingerprintRow>("SELECT fingerprint FROM artifacts WHERE id = ?", artifactId).toArray()[0];
    if (!artifact) throw new Error("PDF artifact not found");
    const existing = this.#row(artifactId, kind);
    if (
      !force &&
      existing?.fingerprint === artifact.fingerprint &&
      (existing.status === "queued" || existing.status === "running" || existing.status === "ready")
    ) {
      return { analysis: artifactAnalysisFromRow(existing), shouldPublish: false };
    }
    this.sql.exec(
      `INSERT INTO artifact_analyses
         (artifact_id, fingerprint, kind, status, result_json, error, requested_at, started_at, completed_at)
       VALUES (?, ?, ?, 'queued', '', '', ?, NULL, NULL)
       ON CONFLICT (artifact_id, kind) DO UPDATE SET
         fingerprint = excluded.fingerprint,
         status = 'queued',
         result_json = '',
         error = '',
         requested_at = excluded.requested_at,
         started_at = NULL,
         completed_at = NULL`,
      artifactId,
      artifact.fingerprint,
      kind,
      requestedAt,
    );
    return { analysis: artifactAnalysisFromRow(this.#row(artifactId, kind)!), shouldPublish: true };
  }

  start(artifactId: string, kind: ArtifactAnalysisKind, fingerprint: string, requestedAt: string): boolean {
    const row = this.#row(artifactId, kind);
    if (!row || row.fingerprint !== fingerprint || row.requested_at !== requestedAt || row.status === "running" || row.status === "ready") {
      return false;
    }
    this.sql.exec(
      "UPDATE artifact_analyses SET status = 'running', error = '', started_at = ?, completed_at = NULL WHERE artifact_id = ? AND kind = ?",
      new Date().toISOString(),
      artifactId,
      kind,
    );
    return true;
  }

  complete(
    artifactId: string,
    kind: ArtifactAnalysisKind,
    fingerprint: string,
    requestedAt: string,
    result: ArtifactAnalysisResult,
  ): boolean {
    if (
      (kind === "pdf-highlights" && !isPdfHighlightAnalysisResult(result)) ||
      (kind === "pdf-references" && !isPdfReferenceAnalysisResult(result))
    ) {
      throw new Error("Artifact analysis result is invalid");
    }
    const row = this.#row(artifactId, kind);
    if (!row || row.fingerprint !== fingerprint || row.requested_at !== requestedAt) return false;
    this.sql.exec(
      `UPDATE artifact_analyses
       SET status = 'ready', result_json = ?, error = '', completed_at = ?
       WHERE artifact_id = ? AND kind = ?`,
      JSON.stringify(result),
      new Date().toISOString(),
      artifactId,
      kind,
    );
    return true;
  }

  fail(artifactId: string, kind: ArtifactAnalysisKind, fingerprint: string, requestedAt: string, error: string): boolean {
    const row = this.#row(artifactId, kind);
    if (!row || row.fingerprint !== fingerprint || row.requested_at !== requestedAt) return false;
    this.sql.exec(
      `UPDATE artifact_analyses
       SET status = 'failed', result_json = '', error = ?, completed_at = ?
       WHERE artifact_id = ? AND kind = ?`,
      error.trim().slice(0, 1_000) || "Artifact analysis failed",
      new Date().toISOString(),
      artifactId,
      kind,
    );
    return true;
  }

  #row(artifactId: string, kind: ArtifactAnalysisKind): ArtifactAnalysisRow | null {
    return (
      this.sql
        .exec<ArtifactAnalysisRow>("SELECT * FROM artifact_analyses WHERE artifact_id = ? AND kind = ?", artifactId, kind)
        .toArray()[0] ?? null
    );
  }
}

function artifactAnalysisFromRow(row: ArtifactAnalysisRow): ArtifactAnalysis {
  const kind = artifactAnalysisKind(row.kind);
  return {
    artifactId: row.artifact_id,
    fingerprint: row.fingerprint,
    kind,
    status: artifactAnalysisStatus(row.status),
    result: artifactAnalysisResult(row.result_json, kind),
    error: row.error,
    requestedAt: row.requested_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function artifactAnalysisKind(value: string): ArtifactAnalysisKind {
  if (value === "pdf-highlights" || value === "pdf-references" || value === "pdf-text") return value;
  throw new Error("Stored artifact analysis kind is invalid");
}

function artifactAnalysisStatus(value: string): ArtifactAnalysis["status"] {
  if (value === "queued" || value === "running" || value === "ready" || value === "failed") return value;
  throw new Error("Stored artifact analysis status is invalid");
}

function artifactAnalysisResult(resultJson: string, kind: ArtifactAnalysisKind): ArtifactAnalysisResult | null {
  if (!resultJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultJson);
  } catch {
    throw new Error("Stored artifact analysis result is invalid");
  }
  if (kind === "pdf-highlights" && isPdfHighlightAnalysisResult(parsed)) return parsed;
  if (kind === "pdf-references" && isPdfReferenceAnalysisResult(parsed)) return parsed;
  if (kind === "pdf-text" && isPdfTextAnalysisResult(parsed)) return parsed;
  throw new Error("Stored artifact analysis result is invalid");
}

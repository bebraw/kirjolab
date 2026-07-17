import { DurableObject } from "cloudflare:workers";
import {
  defaultReviewProtocol,
  materializeProtocolRevision,
  parseReviewProtocolContent,
  type ReviewProfile,
  type ReviewProtocolContent,
  type ReviewProtocolRevision,
  type ReviewStudySnapshot,
} from "../domain/review-study";
import {
  findReviewDuplicateMatches,
  previewReviewBibTeX,
  type ReviewDuplicateCandidate,
  type ReviewDuplicateMatch,
  type ReviewImportRecord,
  type ReviewImportedOccurrence,
  type ReviewRecord,
  type ReviewSearchRun,
  type ReviewSearchSnapshot,
} from "../domain/review-search";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";

const migrations = [
  {
    version: 1,
    name: "store-review-protocol-revisions",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE review_meta (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          revision INTEGER NOT NULL CHECK (revision >= 0)
        );
        INSERT INTO review_meta (singleton, revision) VALUES (1, 0);
        CREATE TABLE protocol_revisions (
          revision INTEGER PRIMARY KEY CHECK (revision > 0),
          status TEXT NOT NULL CHECK (status IN ('draft', 'frozen')),
          payload_json TEXT NOT NULL,
          rationale TEXT NOT NULL,
          created_at TEXT NOT NULL,
          created_by TEXT NOT NULL
        );
      `);
      return undefined;
    },
  },
  {
    version: 2,
    name: "store-search-runs-and-reviewed-duplicates",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE search_runs (
          id TEXT PRIMARY KEY,
          protocol_revision INTEGER NOT NULL,
          source_id TEXT NOT NULL,
          source_name TEXT NOT NULL,
          query TEXT NOT NULL,
          searched_at TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          imported_by TEXT NOT NULL,
          digest TEXT NOT NULL,
          detected_entries INTEGER NOT NULL,
          skipped_entries INTEGER NOT NULL,
          occurrence_count INTEGER NOT NULL
        );
        CREATE TABLE review_records (
          id TEXT PRIMARY KEY,
          state TEXT NOT NULL CHECK (state IN ('active', 'merged')),
          merged_into TEXT,
          metadata_json TEXT NOT NULL
        );
        CREATE TABLE imported_occurrences (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES search_runs(id),
          record_id TEXT NOT NULL REFERENCES review_records(id),
          citation_key TEXT NOT NULL,
          imported_json TEXT NOT NULL
        );
        CREATE TABLE duplicate_candidates (
          id TEXT PRIMARY KEY,
          left_id TEXT NOT NULL REFERENCES review_records(id),
          right_id TEXT NOT NULL REFERENCES review_records(id),
          signals_json TEXT NOT NULL,
          confidence TEXT NOT NULL CHECK (confidence IN ('exact', 'probable')),
          status TEXT NOT NULL CHECK (status IN ('pending', 'merged', 'distinct', 'superseded')),
          resolved_at TEXT,
          resolved_by TEXT,
          UNIQUE(left_id, right_id)
        );
        CREATE INDEX imported_occurrences_run_idx ON imported_occurrences(run_id);
        CREATE INDEX imported_occurrences_record_idx ON imported_occurrences(record_id);
      `);
      return undefined;
    },
  },
] as const satisfies readonly SQLiteMigration[];

interface MetaRow extends Record<string, SqlStorageValue> {
  revision: number;
}

interface ProtocolRow extends Record<string, SqlStorageValue> {
  revision: number;
  status: "draft" | "frozen";
  payload_json: string;
  rationale: string;
  created_at: string;
  created_by: string;
}

interface SearchRunRow extends Record<string, SqlStorageValue> {
  id: string;
  protocol_revision: number;
  source_id: string;
  source_name: string;
  query: string;
  searched_at: string;
  imported_at: string;
  imported_by: string;
  digest: string;
  detected_entries: number;
  skipped_entries: number;
  occurrence_count: number;
}

interface ReviewRecordRow extends Record<string, SqlStorageValue> {
  id: string;
  state: "active" | "merged";
  merged_into: string | null;
  metadata_json: string;
}

interface OccurrenceRow extends Record<string, SqlStorageValue> {
  id: string;
  run_id: string;
  record_id: string;
  citation_key: string;
  imported_json: string;
}

interface DuplicateCandidateRow extends Record<string, SqlStorageValue> {
  id: string;
  left_id: string;
  right_id: string;
  signals_json: string;
  confidence: "exact" | "probable";
  status: "pending" | "merged" | "distinct" | "superseded";
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface ReplaceReviewProtocolInput {
  readonly expectedRevision: number;
  readonly content: ReviewProtocolContent;
  readonly rationale?: string;
  readonly actor: string;
}

export interface AmendReviewProtocolInput extends ReplaceReviewProtocolInput {
  readonly rationale: string;
}

export interface ConfirmReviewSearchRunInput {
  readonly expectedRevision: number;
  readonly sourceId: string;
  readonly query: string;
  readonly searchedAt: string;
  readonly bibtex: string;
  readonly digest: string;
  readonly actor: string;
}

export class ReviewStudy extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      runSQLiteMigrations(this.ctx.storage, migrations);
    });
  }

  getSnapshot(profile: ReviewProfile = "slr", actor = "system"): ReviewStudySnapshot {
    const rows = this.protocolRows();
    if (rows.length === 0) {
      this.appendProtocol(defaultReviewProtocol(profile), "draft", "Review study created", actor);
      return this.getSnapshot(profile, actor);
    }
    const history = rows.map(protocolFromRow);
    return { revision: this.currentRevision(), protocol: history.at(-1)!, protocolHistory: history };
  }

  replaceProtocol(input: ReplaceReviewProtocolInput): ReviewStudySnapshot {
    const current = this.getSnapshot();
    this.assertRevision(input.expectedRevision, current.revision);
    if (current.protocol.status === "frozen") throw new Error("Frozen protocol must be amended with a rationale");
    parseReviewProtocolContent(input.content);
    this.appendProtocol(input.content, "draft", input.rationale ?? "Protocol edited", input.actor);
    return this.getSnapshot();
  }

  freezeProtocol(expectedRevision: number, actor: string): ReviewStudySnapshot {
    const current = this.getSnapshot();
    this.assertRevision(expectedRevision, current.revision);
    if (current.protocol.status === "frozen") return current;
    this.appendProtocol(current.protocol, "frozen", "Protocol frozen before search", actor);
    return this.getSnapshot();
  }

  amendProtocol(input: AmendReviewProtocolInput): ReviewStudySnapshot {
    const current = this.getSnapshot();
    this.assertRevision(input.expectedRevision, current.revision);
    if (current.protocol.status !== "frozen") throw new Error("Only a frozen protocol requires an amendment");
    if (!input.rationale.trim()) throw new Error("Protocol amendment rationale is required");
    parseReviewProtocolContent(input.content);
    this.appendProtocol(input.content, "frozen", input.rationale, input.actor);
    return this.getSnapshot();
  }

  getSearchSnapshot(): ReviewSearchSnapshot {
    const runs = this.ctx.storage.sql
      .exec<SearchRunRow>("SELECT * FROM search_runs ORDER BY imported_at ASC, id ASC")
      .toArray()
      .map(runFromRow);
    const occurrences = this.ctx.storage.sql
      .exec<OccurrenceRow>("SELECT * FROM imported_occurrences ORDER BY run_id ASC, id ASC")
      .toArray()
      .map(occurrenceFromRow);
    const records = this.ctx.storage.sql.exec<ReviewRecordRow>("SELECT * FROM review_records ORDER BY id ASC").toArray().map(recordFromRow);
    const duplicateCandidates = this.ctx.storage.sql
      .exec<DuplicateCandidateRow>("SELECT * FROM duplicate_candidates ORDER BY status DESC, confidence ASC, id ASC")
      .toArray()
      .map(candidateFromRow);
    const activeRecords = records.filter((record) => record.state === "active").length;
    return {
      revision: this.currentRevision(),
      runs,
      occurrences,
      records,
      duplicateCandidates,
      counts: { identified: occurrences.length, unique: activeRecords, duplicatesRemoved: occurrences.length - activeRecords },
    };
  }

  async confirmSearchRun(input: ConfirmReviewSearchRunInput): Promise<ReviewSearchSnapshot> {
    const current = this.getSnapshot();
    this.assertRevision(input.expectedRevision, current.revision);
    if (current.protocol.status !== "frozen") throw new Error("Freeze the review protocol before importing a search run");
    const source = current.protocol.sources.find((candidate) => candidate.id === input.sourceId);
    if (!source) throw new Error("Review search source is not in the current protocol");
    const query = input.query.trim();
    if (!query || query.length > 20_000) throw new Error("Review search query is invalid");
    const searchedAt = validTimestamp(input.searchedAt, "Review search date");
    const preview = await previewReviewBibTeX(input.bibtex);
    if (preview.digest !== input.digest) throw new Error("Review import changed after preview");
    const now = new Date().toISOString();
    const runId = crypto.randomUUID();
    const createdRecords = preview.records.map((metadata) => ({ id: crypto.randomUUID(), metadata }));
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO search_runs (id, protocol_revision, source_id, source_name, query, searched_at, imported_at, imported_by, digest, detected_entries, skipped_entries, occurrence_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        runId,
        current.protocol.revision,
        source.id,
        source.name,
        query,
        searchedAt,
        now,
        input.actor,
        preview.digest,
        preview.detectedEntries,
        preview.skippedEntries,
        preview.records.length,
      );
      for (const record of createdRecords) {
        this.ctx.storage.sql.exec(
          "INSERT INTO review_records (id, state, merged_into, metadata_json) VALUES (?, 'active', NULL, ?)",
          record.id,
          JSON.stringify(record.metadata),
        );
        this.ctx.storage.sql.exec(
          "INSERT INTO imported_occurrences (id, run_id, record_id, citation_key, imported_json) VALUES (?, ?, ?, ?, ?)",
          crypto.randomUUID(),
          runId,
          record.id,
          record.metadata.citationKey,
          JSON.stringify(record.metadata),
        );
      }
      const allRecords = this.ctx.storage.sql
        .exec<ReviewRecordRow>("SELECT * FROM review_records WHERE state = 'active'")
        .toArray()
        .map(recordFromRow);
      for (const match of findReviewDuplicateMatches(allRecords.map((record) => ({ id: record.id, ...record.metadata })))) {
        this.insertDuplicateCandidate(match);
      }
      this.advanceRevision();
    });
    return this.getSearchSnapshot();
  }

  resolveDuplicate(
    expectedRevision: number,
    candidateId: string,
    action: "merge" | "distinct",
    canonicalRecordId: string | null,
    actor: string,
  ): ReviewSearchSnapshot {
    this.assertRevision(expectedRevision, this.currentRevision());
    const candidateRow = this.ctx.storage.sql
      .exec<DuplicateCandidateRow>("SELECT * FROM duplicate_candidates WHERE id = ?", candidateId)
      .toArray()[0];
    if (!candidateRow || candidateRow.status !== "pending") throw new Error("Review duplicate candidate is unavailable");
    const now = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      if (action === "merge") {
        if (canonicalRecordId !== candidateRow.left_id && canonicalRecordId !== candidateRow.right_id) {
          throw new Error("Canonical review record is invalid");
        }
        const duplicateId = canonicalRecordId === candidateRow.left_id ? candidateRow.right_id : candidateRow.left_id;
        this.ctx.storage.sql.exec("UPDATE imported_occurrences SET record_id = ? WHERE record_id = ?", canonicalRecordId, duplicateId);
        this.ctx.storage.sql.exec(
          "UPDATE review_records SET state = 'merged', merged_into = ? WHERE id = ?",
          canonicalRecordId,
          duplicateId,
        );
        this.ctx.storage.sql.exec(
          "UPDATE duplicate_candidates SET status = 'superseded', resolved_at = ?, resolved_by = ? WHERE id <> ? AND status = 'pending' AND (left_id = ? OR right_id = ?)",
          now,
          actor,
          candidateId,
          duplicateId,
          duplicateId,
        );
      }
      this.ctx.storage.sql.exec(
        "UPDATE duplicate_candidates SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?",
        action === "merge" ? "merged" : "distinct",
        now,
        actor,
        candidateId,
      );
      this.advanceRevision();
    });
    return this.getSearchSnapshot();
  }

  private appendProtocol(content: ReviewProtocolContent, status: "draft" | "frozen", rationale: string, actor: string): void {
    const revision = this.currentRevision() + 1;
    const protocol = materializeProtocolRevision(content, revision, status, rationale, actor);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO protocol_revisions (revision, status, payload_json, rationale, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        protocol.revision,
        protocol.status,
        JSON.stringify(protocolContent(protocol)),
        protocol.rationale,
        protocol.createdAt,
        protocol.createdBy,
      );
      this.ctx.storage.sql.exec("UPDATE review_meta SET revision = ? WHERE singleton = 1", revision);
    });
  }

  private currentRevision(): number {
    return this.ctx.storage.sql.exec<MetaRow>("SELECT revision FROM review_meta WHERE singleton = 1").one().revision;
  }

  private protocolRows(): ProtocolRow[] {
    return this.ctx.storage.sql.exec<ProtocolRow>("SELECT * FROM protocol_revisions ORDER BY revision ASC").toArray();
  }

  private assertRevision(expected: number, actual: number): void {
    if (!Number.isSafeInteger(expected) || expected !== actual)
      throw new Error(`Review revision conflict: expected ${expected}, current ${actual}`);
  }

  private advanceRevision(): void {
    this.ctx.storage.sql.exec("UPDATE review_meta SET revision = revision + 1 WHERE singleton = 1");
  }

  private insertDuplicateCandidate(match: ReviewDuplicateMatch): void {
    const [leftId, rightId] = [match.leftId, match.rightId].sort();
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO duplicate_candidates (id, left_id, right_id, signals_json, confidence, status, resolved_at, resolved_by) VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL)",
      crypto.randomUUID(),
      leftId,
      rightId,
      JSON.stringify(match.signals),
      match.confidence,
    );
  }
}

function protocolFromRow(row: ProtocolRow): ReviewProtocolRevision {
  const content: unknown = JSON.parse(row.payload_json);
  return materializeProtocolRevision(
    parseReviewProtocolContent(content),
    row.revision,
    row.status,
    row.rationale,
    row.created_by,
    row.created_at,
  );
}

function protocolContent(protocol: ReviewProtocolRevision): ReviewProtocolContent {
  return {
    profile: protocol.profile,
    objective: protocol.objective,
    picoc: protocol.picoc,
    researchQuestions: protocol.researchQuestions,
    conceptGroups: protocol.conceptGroups,
    sources: protocol.sources,
    knownRelevantStudies: protocol.knownRelevantStudies,
  };
}

function runFromRow(row: SearchRunRow): ReviewSearchRun {
  return {
    id: row.id,
    protocolRevision: row.protocol_revision,
    sourceId: row.source_id,
    sourceName: row.source_name,
    query: row.query,
    searchedAt: row.searched_at,
    importedAt: row.imported_at,
    importedBy: row.imported_by,
    digest: row.digest,
    detectedEntries: row.detected_entries,
    skippedEntries: row.skipped_entries,
    occurrenceCount: row.occurrence_count,
  };
}

function occurrenceFromRow(row: OccurrenceRow): ReviewImportedOccurrence {
  return {
    id: row.id,
    runId: row.run_id,
    recordId: row.record_id,
    citationKey: row.citation_key,
    imported: importRecord(row.imported_json),
  };
}

function recordFromRow(row: ReviewRecordRow): ReviewRecord {
  return { id: row.id, state: row.state, mergedInto: row.merged_into, metadata: importRecord(row.metadata_json) };
}

function candidateFromRow(row: DuplicateCandidateRow): ReviewDuplicateCandidate {
  const signals: unknown = JSON.parse(row.signals_json);
  if (
    !Array.isArray(signals) ||
    !signals.every((signal) => signal === "doi" || signal === "title-author-year" || signal === "title-year")
  ) {
    throw new Error("Stored duplicate signals are invalid");
  }
  return {
    id: row.id,
    leftId: row.left_id,
    rightId: row.right_id,
    signals,
    confidence: row.confidence,
    status: row.status,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  };
}

function importRecord(value: string): ReviewImportRecord {
  const parsed: unknown = JSON.parse(value);
  if (!isReviewImportRecord(parsed)) throw new Error("Stored review import record is invalid");
  return parsed;
}

function isReviewImportRecord(value: unknown): value is ReviewImportRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "citationKey" in value &&
    typeof value.citationKey === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "authors" in value &&
    Array.isArray(value.authors) &&
    value.authors.every((author) => typeof author === "string") &&
    "year" in value &&
    typeof value.year === "string" &&
    "doi" in value &&
    typeof value.doi === "string" &&
    "warnings" in value &&
    Array.isArray(value.warnings)
  );
}

function validTimestamp(value: string, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid`);
  return new Date(value).toISOString();
}

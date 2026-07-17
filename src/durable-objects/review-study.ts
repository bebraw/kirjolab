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
import {
  fullTextScreeningAllowed,
  screeningStageState,
  type ReviewScreeningSnapshot,
  type ScreeningAdjudication,
  type ScreeningDecision,
  type ScreeningDecisionValue,
  type ScreeningRecordState,
  type ScreeningStage,
} from "../domain/review-screening";
import {
  parseEvidencePointer,
  summarizeEvidenceRecord,
  validateExtractionValue,
  type ExtractedDataValue,
  type ExtractionValue,
  type QualityAssessmentValue,
  type ReviewEvidencePointer,
  type ReviewEvidenceSnapshot,
} from "../domain/review-evidence";
import { buildReviewSynthesis, type ReviewSynthesis } from "../domain/review-synthesis";
import {
  parseExtractionModelResult,
  parseScreeningModelResult,
  type ExtractionModelResult,
  type ReviewModelCandidate,
  type ReviewModelOperation,
  type ReviewModelSnapshot,
} from "../domain/review-model";
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
  {
    version: 3,
    name: "store-append-only-screening-decisions",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE screening_decisions (
          id TEXT PRIMARY KEY,
          record_id TEXT NOT NULL REFERENCES review_records(id),
          stage TEXT NOT NULL CHECK (stage IN ('title-abstract', 'full-text')),
          reviewer TEXT NOT NULL,
          decision TEXT NOT NULL CHECK (decision IN ('include', 'exclude', 'uncertain')),
          reason TEXT NOT NULL,
          criterion TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE screening_adjudications (
          id TEXT PRIMARY KEY,
          record_id TEXT NOT NULL REFERENCES review_records(id),
          stage TEXT NOT NULL CHECK (stage IN ('title-abstract', 'full-text')),
          outcome TEXT NOT NULL CHECK (outcome IN ('include', 'exclude')),
          reason TEXT NOT NULL,
          adjudicator TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX screening_decisions_record_stage_idx ON screening_decisions(record_id, stage, created_at);
        CREATE INDEX screening_adjudications_record_stage_idx ON screening_adjudications(record_id, stage, created_at);
      `);
      return undefined;
    },
  },
  {
    version: 4,
    name: "store-evidence-linked-appraisal-and-extraction",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE quality_assessment_values (
          id TEXT PRIMARY KEY,
          record_id TEXT NOT NULL REFERENCES review_records(id),
          question_id TEXT NOT NULL,
          answer_id TEXT NOT NULL,
          evidence_json TEXT NOT NULL,
          reviewer TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE extracted_data_values (
          id TEXT PRIMARY KEY,
          record_id TEXT NOT NULL REFERENCES review_records(id),
          field_id TEXT NOT NULL,
          value_json TEXT NOT NULL,
          missing_reason TEXT,
          evidence_json TEXT,
          reviewer TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX quality_values_record_idx ON quality_assessment_values(record_id, question_id, created_at);
        CREATE INDEX extraction_values_record_idx ON extracted_data_values(record_id, field_id, created_at);
      `);
      return undefined;
    },
  },
  {
    version: 5,
    name: "store-review-model-candidates",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE review_model_candidates (
          id TEXT PRIMARY KEY,
          operation TEXT NOT NULL CHECK (operation IN ('screen-record', 'extract-field')),
          record_id TEXT NOT NULL REFERENCES review_records(id),
          stage TEXT CHECK (stage IN ('title-abstract', 'full-text')),
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          prompt_template_version TEXT NOT NULL,
          source_scope_json TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          created_by TEXT NOT NULL,
          disposition TEXT NOT NULL CHECK (disposition IN ('pending', 'accepted', 'rejected')),
          disposed_at TEXT,
          disposed_by TEXT
        );
        CREATE INDEX review_model_candidates_record_idx ON review_model_candidates(record_id, created_at);
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

interface ScreeningDecisionRow extends Record<string, SqlStorageValue> {
  id: string;
  record_id: string;
  stage: ScreeningStage;
  reviewer: string;
  decision: ScreeningDecisionValue;
  reason: string;
  criterion: string;
  created_at: string;
}

interface ScreeningAdjudicationRow extends Record<string, SqlStorageValue> {
  id: string;
  record_id: string;
  stage: ScreeningStage;
  outcome: "include" | "exclude";
  reason: string;
  adjudicator: string;
  created_at: string;
}

interface QualityValueRow extends Record<string, SqlStorageValue> {
  id: string;
  record_id: string;
  question_id: string;
  answer_id: string;
  evidence_json: string;
  reviewer: string;
  created_at: string;
}

interface ExtractionValueRow extends Record<string, SqlStorageValue> {
  id: string;
  record_id: string;
  field_id: string;
  value_json: string;
  missing_reason: string | null;
  evidence_json: string | null;
  reviewer: string;
  created_at: string;
}

interface ModelCandidateRow extends Record<string, SqlStorageValue> {
  id: string;
  operation: ReviewModelOperation;
  record_id: string;
  stage: ScreeningStage | null;
  provider: string;
  model: string;
  prompt_template_version: string;
  source_scope_json: string;
  result_json: string;
  created_at: string;
  created_by: string;
  disposition: "pending" | "accepted" | "rejected";
  disposed_at: string | null;
  disposed_by: string | null;
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

export interface CreateReviewModelCandidateInput {
  readonly expectedRevision: number;
  readonly operation: ReviewModelOperation;
  readonly recordId: string;
  readonly stage: ScreeningStage | null;
  readonly provider: string;
  readonly model: string;
  readonly promptTemplateVersion: string;
  readonly sourceScope: readonly string[];
  readonly result: unknown;
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
    const screeningCount = this.ctx.storage.sql
      .exec<{
        count: number;
      }>(
        "SELECT COUNT(*) AS count FROM screening_decisions WHERE record_id = ? OR record_id = ?",
        candidateRow.left_id,
        candidateRow.right_id,
      )
      .one().count;
    if (screeningCount > 0) throw new Error("Resolve duplicate candidates before screening their records");
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

  getScreeningSnapshot(actor: string): ReviewScreeningSnapshot {
    const protocol = this.getSnapshot().protocol;
    const decisions = this.ctx.storage.sql
      .exec<ScreeningDecisionRow>("SELECT * FROM screening_decisions ORDER BY created_at ASC, id ASC")
      .toArray()
      .map(decisionFromRow);
    const adjudications = this.ctx.storage.sql
      .exec<ScreeningAdjudicationRow>("SELECT * FROM screening_adjudications ORDER BY created_at ASC, id ASC")
      .toArray()
      .map(adjudicationFromRow);
    const records = this.ctx.storage.sql
      .exec<ReviewRecordRow>("SELECT * FROM review_records WHERE state = 'active' ORDER BY id ASC")
      .toArray()
      .map(recordFromRow)
      .map((record) =>
        screeningRecord(record, decisions, adjudications, protocol.screening.reviewersPerStage, protocol.screening.blinded, actor),
      );
    return {
      revision: this.currentRevision(),
      reviewersPerStage: protocol.screening.reviewersPerStage,
      blinded: protocol.screening.blinded,
      records,
      counts: screeningCounts(records),
    };
  }

  submitScreeningDecision(
    expectedRevision: number,
    recordId: string,
    stage: ScreeningStage,
    decision: ScreeningDecisionValue,
    reason: string,
    criterion: string,
    actor: string,
  ): ReviewScreeningSnapshot {
    this.assertRevision(expectedRevision, this.currentRevision());
    const record = this.ctx.storage.sql
      .exec<ReviewRecordRow>("SELECT * FROM review_records WHERE id = ? AND state = 'active'", recordId)
      .toArray()[0];
    if (!record) throw new Error("Review screening record is unavailable");
    if (stage !== "title-abstract" && stage !== "full-text") throw new Error("Review screening stage is invalid");
    if (decision !== "include" && decision !== "exclude" && decision !== "uncertain")
      throw new Error("Review screening decision is invalid");
    const reasonValue = boundedScreeningText(reason, "Screening reason", 2_000, decision !== "exclude");
    const criterionValue = boundedScreeningText(criterion, "Screening criterion", 1_000, true);
    if (stage === "full-text") {
      const state = this.getScreeningSnapshot(actor).records.find((candidate) => candidate.record.id === recordId);
      if (!state || !fullTextScreeningAllowed(state)) throw new Error("Full-text screening requires title-and-abstract inclusion");
    }
    const priorCount = this.ctx.storage.sql
      .exec<{
        count: number;
      }>("SELECT COUNT(*) AS count FROM screening_decisions WHERE record_id = ? AND stage = ? AND reviewer = ?", recordId, stage, actor)
      .one().count;
    if (priorCount >= 20) throw new Error("Screening decision revision limit reached");
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO screening_decisions (id, record_id, stage, reviewer, decision, reason, criterion, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(),
        recordId,
        stage,
        actor,
        decision,
        reasonValue,
        criterionValue,
        new Date().toISOString(),
      );
      this.advanceRevision();
    });
    return this.getScreeningSnapshot(actor);
  }

  adjudicateScreening(
    expectedRevision: number,
    recordId: string,
    stage: ScreeningStage,
    outcome: "include" | "exclude",
    reason: string,
    actor: string,
  ): ReviewScreeningSnapshot {
    this.assertRevision(expectedRevision, this.currentRevision());
    const state = this.getScreeningSnapshot(actor).records.find((candidate) => candidate.record.id === recordId);
    const stageState = stage === "title-abstract" ? state?.titleAbstract : state?.fullText;
    if (!stageState || stageState.outcome !== "conflict") throw new Error("Only a screening conflict can be adjudicated");
    if (outcome !== "include" && outcome !== "exclude") throw new Error("Screening adjudication outcome is invalid");
    const reasonValue = boundedScreeningText(reason, "Adjudication reason", 2_000, false);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO screening_adjudications (id, record_id, stage, outcome, reason, adjudicator, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(),
        recordId,
        stage,
        outcome,
        reasonValue,
        actor,
        new Date().toISOString(),
      );
      this.advanceRevision();
    });
    return this.getScreeningSnapshot(actor);
  }

  getEvidenceSnapshot(actor: string): ReviewEvidenceSnapshot {
    const protocol = this.getSnapshot().protocol;
    const includedIds = new Set(
      this.getScreeningSnapshot(actor)
        .records.filter((record) => record.fullText.outcome === "include")
        .map((record) => record.record.id),
    );
    const records = this.ctx.storage.sql
      .exec<ReviewRecordRow>("SELECT * FROM review_records WHERE state = 'active' ORDER BY id ASC")
      .toArray()
      .map(recordFromRow)
      .filter((record) => includedIds.has(record.id));
    const qualityValues = this.ctx.storage.sql
      .exec<QualityValueRow>("SELECT * FROM quality_assessment_values ORDER BY created_at ASC, id ASC")
      .toArray()
      .map(qualityValueFromRow);
    const extractionValues = this.ctx.storage.sql
      .exec<ExtractionValueRow>("SELECT * FROM extracted_data_values ORDER BY created_at ASC, id ASC")
      .toArray()
      .map(extractionValueFromRow);
    return {
      revision: this.currentRevision(),
      protocolRevision: protocol.revision,
      protocol: { qualityAssessment: protocol.qualityAssessment, extractionFields: protocol.extractionFields },
      records: records.map((record) =>
        summarizeEvidenceRecord(
          record,
          protocol,
          qualityValues.filter((value) => value.recordId === record.id),
          extractionValues.filter((value) => value.recordId === record.id),
        ),
      ),
    };
  }

  submitQualityAssessment(
    expectedRevision: number,
    recordId: string,
    questionId: string,
    answerId: string,
    evidence: ReviewEvidencePointer,
    actor: string,
  ): ReviewEvidenceSnapshot {
    this.assertRevision(expectedRevision, this.currentRevision());
    const protocol = this.getSnapshot().protocol;
    if (!protocol.qualityAssessment.questions.some((question) => question.id === questionId))
      throw new Error("Quality question is unavailable");
    if (!protocol.qualityAssessment.answers.some((answer) => answer.id === answerId)) throw new Error("Quality answer is unavailable");
    this.assertEvidenceRecord(recordId, actor);
    const pointer = parseEvidencePointer(evidence, true)!;
    this.assertEvidenceRevisionLimit("quality_assessment_values", "question_id", recordId, questionId, actor);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO quality_assessment_values (id, record_id, question_id, answer_id, evidence_json, reviewer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(),
        recordId,
        questionId,
        answerId,
        JSON.stringify(pointer),
        actor,
        new Date().toISOString(),
      );
      this.advanceRevision();
    });
    return this.getEvidenceSnapshot(actor);
  }

  submitExtractionValue(
    expectedRevision: number,
    recordId: string,
    fieldId: string,
    value: ExtractionValue,
    missingReason: string | null,
    evidence: ReviewEvidencePointer | null,
    actor: string,
  ): ReviewEvidenceSnapshot {
    this.assertRevision(expectedRevision, this.currentRevision());
    const protocol = this.getSnapshot().protocol;
    const field = protocol.extractionFields.find((candidate) => candidate.id === fieldId);
    if (!field) throw new Error("Extraction field is unavailable");
    this.assertEvidenceRecord(recordId, actor);
    const validated = validateExtractionValue(field, value, missingReason);
    const pointer = parseEvidencePointer(evidence, validated.value !== null);
    this.assertEvidenceRevisionLimit("extracted_data_values", "field_id", recordId, fieldId, actor);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO extracted_data_values (id, record_id, field_id, value_json, missing_reason, evidence_json, reviewer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(),
        recordId,
        fieldId,
        JSON.stringify(validated.value),
        validated.missingReason,
        pointer ? JSON.stringify(pointer) : null,
        actor,
        new Date().toISOString(),
      );
      this.advanceRevision();
    });
    return this.getEvidenceSnapshot(actor);
  }

  getModelSnapshot(actor: string): ReviewModelSnapshot {
    const protocol = this.getSnapshot().protocol;
    const rows = this.ctx.storage.sql
      .exec<ModelCandidateRow>("SELECT * FROM review_model_candidates ORDER BY created_at ASC, id ASC")
      .toArray();
    return {
      revision: this.currentRevision(),
      candidates: rows
        .map((row) => modelCandidateFromRow(row, protocol))
        .filter((candidate) => {
          if (candidate.disposition !== "pending" || protocol.modelAssistance.mode !== "human-first") return true;
          if (candidate.operation === "screen-record") {
            return (
              this.ctx.storage.sql
                .exec<{
                  count: number;
                }>(
                  "SELECT COUNT(*) AS count FROM screening_decisions WHERE record_id = ? AND stage = ? AND reviewer = ?",
                  candidate.recordId,
                  candidate.stage,
                  actor,
                )
                .one().count > 0
            );
          }
          const result = candidate.result as import("../domain/review-model").ExtractionModelResult;
          return (
            this.ctx.storage.sql
              .exec<{
                count: number;
              }>(
                "SELECT COUNT(*) AS count FROM extracted_data_values WHERE record_id = ? AND field_id = ? AND reviewer = ?",
                candidate.recordId,
                result.fieldId,
                actor,
              )
              .one().count > 0
          );
        }),
    };
  }

  createModelCandidate(input: CreateReviewModelCandidateInput): ReviewModelSnapshot {
    this.assertRevision(input.expectedRevision, this.currentRevision());
    const protocol = this.getSnapshot().protocol;
    if (protocol.modelAssistance.mode === "off") throw new Error("Enable model assistance in the protocol first");
    const recordRow = this.ctx.storage.sql
      .exec<ReviewRecordRow>("SELECT * FROM review_records WHERE id = ? AND state = 'active'", input.recordId)
      .toArray()[0];
    if (!recordRow) throw new Error("Model candidate review record is unavailable");
    const provider = boundedScreeningText(input.provider, "Model provider", 256, false);
    const model = boundedScreeningText(input.model, "Model", 256, false);
    const promptTemplateVersion = boundedScreeningText(input.promptTemplateVersion, "Prompt template version", 128, false);
    if (!Array.isArray(input.sourceScope) || input.sourceScope.length === 0 || input.sourceScope.length > 16) {
      throw new Error("Model source scope is invalid");
    }
    const sourceScope = input.sourceScope.map((value) => boundedScreeningText(value, "Model source scope", 128, false));
    let result: ReturnType<typeof parseScreeningModelResult> | ReturnType<typeof parseExtractionModelResult>;
    if (input.operation === "screen-record") {
      if (input.stage !== "title-abstract") throw new Error("Current screening assistance is title-and-abstract only");
      result = parseScreeningModelResult(input.result);
      const record = recordFromRow(recordRow);
      if (!record.metadata.title.includes(result.evidence) && !record.metadata.abstract.includes(result.evidence)) {
        throw new Error("Screening candidate evidence must quote the supplied title or abstract exactly");
      }
      const criteria = [...protocol.inclusionCriteria, ...protocol.exclusionCriteria];
      if (result.criterion && !criteria.includes(result.criterion)) throw new Error("Screening candidate criterion is unavailable");
    } else if (input.operation === "extract-field") {
      if (input.stage !== null) throw new Error("Extraction candidates do not use a screening stage");
      this.assertEvidenceRecord(input.recordId, input.actor);
      const fieldId = isRecordValue(input.result) && typeof input.result.fieldId === "string" ? input.result.fieldId : "";
      const field = protocol.extractionFields.find((candidate) => candidate.id === fieldId);
      if (!field) throw new Error("Extraction candidate field is unavailable");
      result = parseExtractionModelResult(input.result, field);
    } else {
      throw new Error("Model candidate operation is invalid");
    }
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO review_model_candidates (id, operation, record_id, stage, provider, model, prompt_template_version, source_scope_json, result_json, created_at, created_by, disposition, disposed_at, disposed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL)",
        crypto.randomUUID(),
        input.operation,
        input.recordId,
        input.stage,
        provider,
        model,
        promptTemplateVersion,
        JSON.stringify(sourceScope),
        JSON.stringify(result),
        new Date().toISOString(),
        input.actor,
      );
      this.advanceRevision();
    });
    return this.getModelSnapshot(input.actor);
  }

  resolveModelCandidate(
    expectedRevision: number,
    candidateId: string,
    disposition: "accepted" | "rejected",
    actor: string,
  ): ReviewModelSnapshot {
    this.assertRevision(expectedRevision, this.currentRevision());
    const row = this.ctx.storage.sql
      .exec<ModelCandidateRow>("SELECT * FROM review_model_candidates WHERE id = ?", candidateId)
      .toArray()[0];
    if (!row || row.disposition !== "pending") throw new Error("Model candidate is unavailable");
    const protocol = this.getSnapshot().protocol;
    const candidate = modelCandidateFromRow(row, protocol);
    if (
      protocol.modelAssistance.mode === "human-first" &&
      !this.getModelSnapshot(actor).candidates.some((visible) => visible.id === candidate.id)
    ) {
      throw new Error("Human-first candidates require an initial human judgment before disposition");
    }
    const now = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "UPDATE review_model_candidates SET disposition = ?, disposed_at = ?, disposed_by = ? WHERE id = ?",
        disposition,
        now,
        actor,
        candidateId,
      );
      if (disposition === "accepted" && candidate.operation === "screen-record") {
        const result = candidate.result as import("../domain/review-model").ScreeningModelResult;
        this.ctx.storage.sql.exec(
          "INSERT INTO screening_decisions (id, record_id, stage, reviewer, decision, reason, criterion, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          crypto.randomUUID(),
          candidate.recordId,
          candidate.stage,
          actor,
          result.decision,
          `${result.rationale}\nEvidence: ${result.evidence}`,
          result.criterion,
          now,
        );
      }
      if (disposition === "accepted" && candidate.operation === "extract-field") {
        const result = candidate.result as import("../domain/review-model").ExtractionModelResult;
        this.assertEvidenceRecord(candidate.recordId, actor);
        this.ctx.storage.sql.exec(
          "INSERT INTO extracted_data_values (id, record_id, field_id, value_json, missing_reason, evidence_json, reviewer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          crypto.randomUUID(),
          candidate.recordId,
          result.fieldId,
          JSON.stringify(result.value),
          result.missingReason,
          result.evidence ? JSON.stringify(result.evidence) : null,
          actor,
          now,
        );
      }
      this.advanceRevision();
    });
    return this.getModelSnapshot(actor);
  }

  getSynthesis(actor: string): ReviewSynthesis {
    return buildReviewSynthesis(
      this.getSnapshot(),
      this.getSearchSnapshot(),
      this.getScreeningSnapshot(actor),
      this.getEvidenceSnapshot(actor),
    );
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

  private assertEvidenceRecord(recordId: string, actor: string): void {
    const included = this.getScreeningSnapshot(actor).records.some(
      (record) => record.record.id === recordId && record.fullText.outcome === "include",
    );
    if (!included) throw new Error("Appraisal and extraction require full-text inclusion");
  }

  private assertEvidenceRevisionLimit(table: string, fieldColumn: string, recordId: string, fieldId: string, actor: string): void {
    const allowed = new Set(["quality_assessment_values:question_id", "extracted_data_values:field_id"]);
    if (!allowed.has(`${table}:${fieldColumn}`)) throw new Error("Evidence revision query is invalid");
    const count = this.ctx.storage.sql
      .exec<{
        count: number;
      }>(`SELECT COUNT(*) AS count FROM ${table} WHERE record_id = ? AND ${fieldColumn} = ? AND reviewer = ?`, recordId, fieldId, actor)
      .one().count;
    if (count >= 20) throw new Error("Evidence value revision limit reached");
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
    inclusionCriteria: protocol.inclusionCriteria,
    exclusionCriteria: protocol.exclusionCriteria,
    screening: protocol.screening,
    modelAssistance: protocol.modelAssistance,
    qualityAssessment: protocol.qualityAssessment,
    extractionFields: protocol.extractionFields,
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

function modelCandidateFromRow(row: ModelCandidateRow, protocol: ReviewProtocolRevision): ReviewModelCandidate {
  const sourceScope: unknown = JSON.parse(row.source_scope_json);
  if (!Array.isArray(sourceScope) || !sourceScope.every((value) => typeof value === "string")) {
    throw new Error("Stored model source scope is invalid");
  }
  const resultValue: unknown = JSON.parse(row.result_json);
  const result = row.operation === "screen-record" ? parseScreeningModelResult(resultValue) : storedExtractionResult(resultValue, protocol);
  return {
    id: row.id,
    operation: row.operation,
    recordId: row.record_id,
    stage: row.stage,
    provider: row.provider,
    model: row.model,
    promptTemplateVersion: row.prompt_template_version,
    sourceScope,
    result,
    createdAt: row.created_at,
    createdBy: row.created_by,
    disposition: row.disposition,
    disposedAt: row.disposed_at,
    disposedBy: row.disposed_by,
  };
}

function storedExtractionResult(value: unknown, protocol: ReviewProtocolRevision): ExtractionModelResult {
  if (!isRecordValue(value) || typeof value.fieldId !== "string") throw new Error("Stored extraction model candidate is invalid");
  const field = protocol.extractionFields.find((candidate) => candidate.id === value.fieldId);
  if (field) return parseExtractionModelResult(value, field);
  if (
    (value.value !== null && typeof value.value !== "string" && typeof value.value !== "number" && typeof value.value !== "boolean") ||
    (value.missingReason !== null && typeof value.missingReason !== "string") ||
    typeof value.rationale !== "string"
  ) {
    throw new Error("Stored extraction model candidate is invalid");
  }
  return {
    fieldId: value.fieldId,
    value: value.value,
    missingReason: value.missingReason,
    evidence: value.evidence === null ? null : parseEvidencePointer(value.evidence, false),
    rationale: value.rationale,
  };
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function decisionFromRow(row: ScreeningDecisionRow): ScreeningDecision {
  return {
    id: row.id,
    recordId: row.record_id,
    stage: row.stage,
    reviewer: row.reviewer,
    decision: row.decision,
    reason: row.reason,
    criterion: row.criterion,
    createdAt: row.created_at,
  };
}

function adjudicationFromRow(row: ScreeningAdjudicationRow): ScreeningAdjudication {
  return {
    id: row.id,
    recordId: row.record_id,
    stage: row.stage,
    outcome: row.outcome,
    reason: row.reason,
    adjudicator: row.adjudicator,
    createdAt: row.created_at,
  };
}

function screeningRecord(
  record: ReviewRecord,
  decisions: readonly ScreeningDecision[],
  adjudications: readonly ScreeningAdjudication[],
  reviewersPerStage: 1 | 2,
  blinded: boolean,
  actor: string,
): ScreeningRecordState {
  const stateFor = (stage: ScreeningStage) => {
    const stageDecisions = decisions.filter((decision) => decision.recordId === record.id && decision.stage === stage);
    const reviewers = new Set(stageDecisions.map((decision) => decision.reviewer.toLocaleLowerCase()));
    const visibleDecisions =
      blinded && reviewers.size < reviewersPerStage ? stageDecisions.filter((decision) => decision.reviewer === actor) : stageDecisions;
    const adjudication = adjudications.filter((item) => item.recordId === record.id && item.stage === stage).at(-1) ?? null;
    const derived = screeningStageState(stageDecisions, adjudication, reviewersPerStage);
    return { ...derived, decisions: visibleDecisions };
  };
  return { record, titleAbstract: stateFor("title-abstract"), fullText: stateFor("full-text") };
}

function screeningCounts(records: readonly ScreeningRecordState[]): ReviewScreeningSnapshot["counts"] {
  return {
    titleAbstractPending: records.filter((record) => record.titleAbstract.outcome === "pending").length,
    titleAbstractIncluded: records.filter((record) => record.titleAbstract.outcome === "include").length,
    fullTextPending: records.filter((record) => record.titleAbstract.outcome === "include" && record.fullText.outcome === "pending").length,
    fullTextIncluded: records.filter((record) => record.fullText.outcome === "include").length,
    conflicts: records.filter((record) => record.titleAbstract.outcome === "conflict" || record.fullText.outcome === "conflict").length,
  };
}

function boundedScreeningText(value: string, label: string, maximum: number, allowEmpty: boolean): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > maximum) throw new Error(`${label} is invalid`);
  return normalized;
}

function qualityValueFromRow(row: QualityValueRow): QualityAssessmentValue {
  return {
    id: row.id,
    recordId: row.record_id,
    questionId: row.question_id,
    answerId: row.answer_id,
    evidence: parseEvidencePointer(JSON.parse(row.evidence_json), true)!,
    reviewer: row.reviewer,
    createdAt: row.created_at,
  };
}

function extractionValueFromRow(row: ExtractionValueRow): ExtractedDataValue {
  const value: unknown = JSON.parse(row.value_json);
  if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    throw new Error("Stored extraction value is invalid");
  }
  return {
    id: row.id,
    recordId: row.record_id,
    fieldId: row.field_id,
    value,
    missingReason: row.missing_reason,
    evidence: row.evidence_json ? parseEvidencePointer(JSON.parse(row.evidence_json), true) : null,
    reviewer: row.reviewer,
    createdAt: row.created_at,
  };
}

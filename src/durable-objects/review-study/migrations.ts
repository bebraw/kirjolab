import { isRecord as isRecordValue } from "../../domain/unknown-value";
import { parseReviewProtocolContent, type ReviewEligibilityCriterion, type ReviewProtocolContent } from "../../domain/review/review-study";
import { reviewDuplicateKeys } from "../../domain/review/review-search";
import { type ScreeningDecisionValue, type ScreeningStage } from "../../domain/review/review-screening";
import { parseEvidencePointer } from "../../domain/review/review-evidence";
import { parseScreeningModelResult, type ReviewModelOperation } from "../../domain/review/review-model";
import type { SQLiteMigration, SQLiteMigrationSql } from "../migrations";
import { parseStoredReviewImportRecord } from "./records";

export const reviewStudyMigrations = [
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
  {
    version: 6,
    name: "allow-rationales-for-negative-appraisal",
    apply(sql): undefined {
      sql.exec("ALTER TABLE quality_assessment_values ADD COLUMN rationale TEXT NOT NULL DEFAULT '';");
      return undefined;
    },
  },
  {
    version: 7,
    name: "make-review-revisions-reconstructible",
    apply(sql): undefined {
      sql.exec(`
        ALTER TABLE review_meta ADD COLUMN history_floor_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE search_runs ADD COLUMN created_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_records ADD COLUMN created_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_records ADD COLUMN merged_revision INTEGER;
        ALTER TABLE imported_occurrences ADD COLUMN created_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE duplicate_candidates ADD COLUMN created_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE duplicate_candidates ADD COLUMN resolved_revision INTEGER;
        ALTER TABLE screening_decisions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE screening_adjudications ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE quality_assessment_values ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE extracted_data_values ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_model_candidates ADD COLUMN created_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_model_candidates ADD COLUMN disposed_revision INTEGER;

        UPDATE review_meta SET history_floor_revision = revision WHERE singleton = 1;
        UPDATE search_runs SET created_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE review_records SET created_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE review_records
          SET merged_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1)
          WHERE state = 'merged';
        UPDATE imported_occurrences SET created_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE duplicate_candidates SET created_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE duplicate_candidates
          SET resolved_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1)
          WHERE status <> 'pending';
        UPDATE screening_decisions SET revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE screening_adjudications SET revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE quality_assessment_values SET revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE extracted_data_values SET revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE review_model_candidates SET created_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1);
        UPDATE review_model_candidates
          SET disposed_revision = (SELECT history_floor_revision FROM review_meta WHERE singleton = 1)
          WHERE disposition <> 'pending';

        CREATE INDEX search_runs_revision_idx ON search_runs(created_revision);
        CREATE INDEX review_records_revision_idx ON review_records(created_revision, merged_revision);
        CREATE INDEX imported_occurrences_revision_idx ON imported_occurrences(created_revision);
        CREATE INDEX duplicate_candidates_revision_idx ON duplicate_candidates(created_revision, resolved_revision);
        CREATE INDEX screening_decisions_revision_idx ON screening_decisions(revision);
        CREATE INDEX screening_adjudications_revision_idx ON screening_adjudications(revision);
        CREATE INDEX quality_values_revision_idx ON quality_assessment_values(revision);
        CREATE INDEX extraction_values_revision_idx ON extracted_data_values(revision);
        CREATE INDEX review_model_candidates_revision_idx ON review_model_candidates(created_revision, disposed_revision);
      `);
      return undefined;
    },
  },
  {
    version: 8,
    name: "retain-review-import-provenance-and-capacity",
    apply(sql): undefined {
      sql.exec(`
        ALTER TABLE review_meta ADD COLUMN search_run_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_meta ADD COLUMN import_batch_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_meta ADD COLUMN occurrence_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE review_meta ADD COLUMN record_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE search_runs ADD COLUMN reported_result_count INTEGER NOT NULL DEFAULT 0;

        CREATE TABLE review_import_batches (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES search_runs(id),
          format TEXT NOT NULL CHECK (format = 'bibtex'),
          filename TEXT NOT NULL,
          media_type TEXT NOT NULL CHECK (media_type = 'application/x-bibtex'),
          byte_count INTEGER NOT NULL CHECK (byte_count >= 0),
          digest TEXT NOT NULL,
          parser_version TEXT NOT NULL,
          reported_result_count INTEGER NOT NULL CHECK (reported_result_count >= 0),
          created_revision INTEGER NOT NULL
        );
        ALTER TABLE imported_occurrences ADD COLUMN batch_id TEXT REFERENCES review_import_batches(id);
        CREATE INDEX review_import_batches_run_idx ON review_import_batches(run_id, created_revision);
        CREATE INDEX imported_occurrences_batch_idx ON imported_occurrences(batch_id, created_revision);

        CREATE TABLE review_record_duplicate_keys (
          record_id TEXT PRIMARY KEY REFERENCES review_records(id),
          doi_key TEXT NOT NULL,
          title_author_year_key TEXT NOT NULL,
          title_year_key TEXT NOT NULL,
          created_revision INTEGER NOT NULL
        );
        CREATE INDEX review_record_doi_key_idx ON review_record_duplicate_keys(doi_key, created_revision, record_id);
        CREATE INDEX review_record_title_author_year_key_idx
          ON review_record_duplicate_keys(title_author_year_key, created_revision, record_id);
        CREATE INDEX review_record_title_year_key_idx
          ON review_record_duplicate_keys(title_year_key, created_revision, record_id);
      `);

      const legacyRuns = sql
        .exec<{
          id: string;
          digest: string;
          detected_entries: number;
          created_revision: number;
        }>("SELECT id, digest, detected_entries, created_revision FROM search_runs ORDER BY id ASC")
        .toArray();
      for (const run of legacyRuns) {
        const batchId = `legacy-${run.id}`;
        sql.exec(
          "INSERT INTO review_import_batches (id, run_id, format, filename, media_type, byte_count, digest, parser_version, reported_result_count, created_revision) VALUES (?, ?, 'bibtex', 'unrecorded-pre-v8.bib', 'application/x-bibtex', 0, ?, 'legacy-unrecorded', ?, ?)",
          batchId,
          run.id,
          run.digest,
          run.detected_entries,
          run.created_revision,
        );
        sql.exec("UPDATE search_runs SET reported_result_count = ? WHERE id = ?", run.detected_entries, run.id);
        sql.exec("UPDATE imported_occurrences SET batch_id = ? WHERE run_id = ?", batchId, run.id);
      }

      const legacyRecords = sql
        .exec<{
          id: string;
          metadata_json: string;
          created_revision: number;
        }>("SELECT id, metadata_json, created_revision FROM review_records ORDER BY id ASC")
        .toArray();
      for (const row of legacyRecords) {
        const keys = reviewDuplicateKeys(parseStoredReviewImportRecord(row.metadata_json));
        sql.exec(
          "INSERT INTO review_record_duplicate_keys (record_id, doi_key, title_author_year_key, title_year_key, created_revision) VALUES (?, ?, ?, ?, ?)",
          row.id,
          keys.doi,
          keys.titleAuthorYear,
          keys.titleYear,
          row.created_revision,
        );
      }

      sql.exec(`
        UPDATE review_meta SET
          search_run_count = (SELECT COUNT(*) FROM search_runs),
          import_batch_count = (SELECT COUNT(*) FROM review_import_batches),
          occurrence_count = (SELECT COUNT(*) FROM imported_occurrences),
          record_count = (SELECT COUNT(*) FROM review_records)
        WHERE singleton = 1;
      `);
      return undefined;
    },
  },
  {
    version: 9,
    name: "pin-review-workflow-to-protocol-revisions",
    apply(sql): undefined {
      sql.exec(`
        ALTER TABLE review_meta ADD COLUMN import_byte_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE screening_decisions ADD COLUMN protocol_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE screening_decisions ADD COLUMN criterion_id TEXT;
        ALTER TABLE screening_decisions ADD COLUMN criterion_text TEXT NOT NULL DEFAULT '';
        ALTER TABLE screening_adjudications ADD COLUMN protocol_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE screening_adjudications ADD COLUMN criterion_id TEXT;
        ALTER TABLE screening_adjudications ADD COLUMN criterion_text TEXT NOT NULL DEFAULT '';
        ALTER TABLE quality_assessment_values ADD COLUMN protocol_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE quality_assessment_values ADD COLUMN criterion_id TEXT;
        ALTER TABLE quality_assessment_values ADD COLUMN criterion_text TEXT NOT NULL DEFAULT '';
        ALTER TABLE extracted_data_values ADD COLUMN protocol_revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE extracted_data_values ADD COLUMN criterion_id TEXT;
        ALTER TABLE extracted_data_values ADD COLUMN criterion_text TEXT NOT NULL DEFAULT '';

        CREATE TABLE final_inclusion_decisions (
          id TEXT PRIMARY KEY,
          record_id TEXT NOT NULL REFERENCES review_records(id),
          protocol_revision INTEGER NOT NULL CHECK (protocol_revision > 0),
          outcome TEXT NOT NULL CHECK (outcome IN ('include', 'exclude')),
          reason TEXT NOT NULL,
          criterion_id TEXT,
          criterion_text TEXT NOT NULL,
          reviewer TEXT NOT NULL,
          created_at TEXT NOT NULL,
          revision INTEGER NOT NULL
        );
        CREATE INDEX final_inclusion_record_revision_idx
          ON final_inclusion_decisions(record_id, revision, id);

        CREATE TABLE review_reassessment_obligations (
          id TEXT PRIMARY KEY,
          amendment_protocol_revision INTEGER NOT NULL CHECK (amendment_protocol_revision > 0),
          stage TEXT NOT NULL CHECK (stage IN ('search', 'deduplication', 'title-abstract', 'full-text', 'appraisal', 'extraction', 'synthesis', 'reporting')),
          record_id TEXT REFERENCES review_records(id),
          created_revision INTEGER NOT NULL,
          completed_revision INTEGER,
          completed_at TEXT,
          completed_by TEXT,
          completion_rationale TEXT
        );
        CREATE INDEX review_reassessment_revision_idx
          ON review_reassessment_obligations(created_revision, completed_revision, id);
        CREATE INDEX review_reassessment_protocol_idx
          ON review_reassessment_obligations(amendment_protocol_revision, stage, record_id);

        CREATE TABLE review_findings (
          id TEXT PRIMARY KEY,
          review_revision INTEGER NOT NULL CHECK (review_revision > 0),
          protocol_revision INTEGER NOT NULL CHECK (protocol_revision > 0),
          research_question_id TEXT NOT NULL,
          statement TEXT NOT NULL,
          interpretation TEXT NOT NULL,
          extraction_value_ids_json TEXT NOT NULL,
          appraisal_value_ids_json TEXT NOT NULL,
          evidence_json TEXT NOT NULL,
          supersedes_id TEXT REFERENCES review_findings(id),
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX review_findings_revision_idx ON review_findings(review_revision, id);
        CREATE INDEX review_findings_rq_idx ON review_findings(research_question_id, review_revision, id);
        CREATE UNIQUE INDEX review_findings_supersedes_idx ON review_findings(supersedes_id) WHERE supersedes_id IS NOT NULL;

        CREATE INDEX screening_decisions_protocol_idx
          ON screening_decisions(protocol_revision, criterion_id, revision);
        CREATE INDEX screening_adjudications_protocol_idx
          ON screening_adjudications(protocol_revision, criterion_id, revision);
        CREATE INDEX quality_values_protocol_idx
          ON quality_assessment_values(protocol_revision, criterion_id, revision);
        CREATE INDEX extraction_values_protocol_idx
          ON extracted_data_values(protocol_revision, criterion_id, revision);
      `);

      backfillPinnedReviewWorkflow(sql);
      return undefined;
    },
  },
] as const satisfies readonly SQLiteMigration[];

interface MigrationProtocolState {
  readonly revision: number;
  readonly content: ReviewProtocolContent;
}

interface MigrationProtocolRow extends Record<string, SqlStorageValue> {
  revision: number;
  payload_json: string;
}

interface MigrationScreeningDecisionRow extends Record<string, SqlStorageValue> {
  id: string;
  stage: ScreeningStage;
  decision: ScreeningDecisionValue;
  criterion: string;
  revision: number;
}

interface MigrationScreeningAdjudicationRow extends Record<string, SqlStorageValue> {
  id: string;
  record_id: string;
  stage: ScreeningStage;
  outcome: "include" | "exclude";
  revision: number;
}

interface MigrationPinnedCriterionRow extends Record<string, SqlStorageValue> {
  criterion_id: string | null;
  criterion_text: string;
}

interface MigrationEvidenceValueRow extends Record<string, SqlStorageValue> {
  id: string;
  criterion_id: string;
  evidence_json: string | null;
  revision: number;
}

interface MigrationModelCandidateRow extends Record<string, SqlStorageValue> {
  id: string;
  operation: ReviewModelOperation;
  stage: ScreeningStage | null;
  result_json: string;
  created_revision: number;
}

function backfillPinnedReviewWorkflow(sql: SQLiteMigrationSql): void {
  sql.exec(`
    UPDATE review_meta SET import_byte_count = COALESCE((SELECT SUM(byte_count) FROM review_import_batches), 0)
    WHERE singleton = 1;
  `);
  const protocols = normalizeProtocols(sql);
  pinScreeningDecisions(sql, protocols);
  pinScreeningAdjudications(sql, protocols);
  normalizeQualityValues(sql, protocols);
  normalizeExtractionValues(sql, protocols);
  normalizeModelCandidates(sql, protocols);
}

function normalizeProtocols(sql: SQLiteMigrationSql): MigrationProtocolState[] {
  return sql
    .exec<MigrationProtocolRow>("SELECT revision, payload_json FROM protocol_revisions ORDER BY revision ASC")
    .toArray()
    .map((row) => {
      const content = parseReviewProtocolContent(JSON.parse(row.payload_json));
      sql.exec("UPDATE protocol_revisions SET payload_json = ? WHERE revision = ?", JSON.stringify(content), row.revision);
      return { revision: row.revision, content } satisfies MigrationProtocolState;
    });
}

function pinScreeningDecisions(sql: SQLiteMigrationSql, protocols: readonly MigrationProtocolState[]): void {
  const decisions = sql
    .exec<MigrationScreeningDecisionRow>(
      "SELECT id, stage, decision, criterion, revision FROM screening_decisions ORDER BY revision ASC, id ASC",
    )
    .toArray();
  for (const row of decisions) {
    const protocol = migrationProtocolAtRevision(protocols, row.revision);
    const criterion = protocol ? migrationCriterion(protocol.content.eligibilityCriteria, row.criterion, row.stage, row.decision) : null;
    sql.exec(
      "UPDATE screening_decisions SET protocol_revision = ?, criterion_id = ?, criterion_text = ? WHERE id = ?",
      protocol?.revision ?? 0,
      criterion?.id ?? null,
      criterion?.text ?? row.criterion,
      row.id,
    );
  }
}

function pinScreeningAdjudications(sql: SQLiteMigrationSql, protocols: readonly MigrationProtocolState[]): void {
  const adjudications = sql
    .exec<MigrationScreeningAdjudicationRow>(
      "SELECT id, record_id, stage, outcome, revision FROM screening_adjudications ORDER BY revision ASC, id ASC",
    )
    .toArray();
  for (const row of adjudications) {
    const protocol = migrationProtocolAtRevision(protocols, row.revision);
    const matchingDecision = sql
      .exec<MigrationPinnedCriterionRow>(
        "SELECT criterion_id, criterion_text FROM screening_decisions WHERE record_id = ? AND stage = ? AND decision = ? AND revision <= ? ORDER BY revision DESC, id DESC LIMIT 1",
        row.record_id,
        row.stage,
        row.outcome,
        row.revision,
      )
      .toArray()[0];
    sql.exec(
      "UPDATE screening_adjudications SET protocol_revision = ?, criterion_id = ?, criterion_text = ? WHERE id = ?",
      protocol?.revision ?? 0,
      matchingDecision?.criterion_id ?? null,
      matchingDecision?.criterion_text ?? "",
      row.id,
    );
  }
}

function normalizeQualityValues(sql: SQLiteMigrationSql, protocols: readonly MigrationProtocolState[]): void {
  const qualityValues = sql
    .exec<MigrationEvidenceValueRow>(
      "SELECT id, question_id AS criterion_id, evidence_json, revision FROM quality_assessment_values ORDER BY revision ASC, id ASC",
    )
    .toArray();
  for (const row of qualityValues) {
    const protocol = migrationProtocolAtRevision(protocols, row.revision);
    const question = protocol?.content.qualityAssessment.questions.find((candidate) => candidate.id === row.criterion_id);
    const evidence = parseEvidencePointer(JSON.parse(row.evidence_json ?? "null"), false, true);
    sql.exec(
      "UPDATE quality_assessment_values SET protocol_revision = ?, criterion_id = ?, criterion_text = ?, evidence_json = ? WHERE id = ?",
      protocol?.revision ?? 0,
      row.criterion_id,
      question?.text ?? row.criterion_id,
      JSON.stringify(evidence),
      row.id,
    );
  }
}

function normalizeExtractionValues(sql: SQLiteMigrationSql, protocols: readonly MigrationProtocolState[]): void {
  const extractionValues = sql
    .exec<MigrationEvidenceValueRow>(
      "SELECT id, field_id AS criterion_id, evidence_json, revision FROM extracted_data_values ORDER BY revision ASC, id ASC",
    )
    .toArray();
  for (const row of extractionValues) {
    const protocol = migrationProtocolAtRevision(protocols, row.revision);
    const field = protocol?.content.extractionFields.find((candidate) => candidate.id === row.criterion_id);
    const evidence = row.evidence_json ? parseEvidencePointer(JSON.parse(row.evidence_json), false, true) : null;
    sql.exec(
      "UPDATE extracted_data_values SET protocol_revision = ?, criterion_id = ?, criterion_text = ?, evidence_json = ? WHERE id = ?",
      protocol?.revision ?? 0,
      row.criterion_id,
      field?.label ?? row.criterion_id,
      evidence ? JSON.stringify(evidence) : null,
      row.id,
    );
  }
}

function normalizeModelCandidates(sql: SQLiteMigrationSql, protocols: readonly MigrationProtocolState[]): void {
  const modelCandidates = sql
    .exec<MigrationModelCandidateRow>(
      "SELECT id, operation, stage, result_json, created_revision FROM review_model_candidates ORDER BY created_revision ASC, id ASC",
    )
    .toArray();
  for (const row of modelCandidates) {
    const result: unknown = JSON.parse(row.result_json);
    if (!isRecordValue(result)) continue;
    if (row.operation === "screen-record" && row.stage !== null) {
      const parsed = parseScreeningModelResult(result);
      const protocol = migrationProtocolAtRevision(protocols, row.created_revision);
      const criterion = protocol
        ? migrationCriterion(protocol.content.eligibilityCriteria, parsed.criterion, row.stage, parsed.decision)
        : null;
      if (criterion)
        sql.exec(
          "UPDATE review_model_candidates SET result_json = ? WHERE id = ?",
          JSON.stringify({ ...parsed, criterion: criterion.id }),
          row.id,
        );
    } else if (row.operation === "extract-field" && result.evidence !== null && result.evidence !== undefined) {
      const evidence = parseEvidencePointer(result.evidence, false, true);
      sql.exec("UPDATE review_model_candidates SET result_json = ? WHERE id = ?", JSON.stringify({ ...result, evidence }), row.id);
    }
  }
}

function migrationProtocolAtRevision(protocols: readonly MigrationProtocolState[], revision: number): MigrationProtocolState | undefined {
  let selected: MigrationProtocolState | undefined;
  for (const protocol of protocols) {
    if (protocol.revision > revision) break;
    selected = protocol;
  }
  return selected;
}

function migrationCriterion(
  criteria: readonly ReviewEligibilityCriterion[],
  legacyValue: string,
  stage: ScreeningStage,
  decision: ScreeningDecisionValue,
): ReviewEligibilityCriterion | undefined {
  const applicable = criteria.filter(
    (criterion) => criterion.applicableStages.includes(stage) && (decision === "uncertain" || criterion.kind === decision),
  );
  return applicable.find((criterion) => criterion.id === legacyValue) ?? applicable.find((criterion) => criterion.text === legacyValue);
}

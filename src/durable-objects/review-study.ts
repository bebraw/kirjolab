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

export interface ReplaceReviewProtocolInput {
  readonly expectedRevision: number;
  readonly content: ReviewProtocolContent;
  readonly rationale?: string;
  readonly actor: string;
}

export interface AmendReviewProtocolInput extends ReplaceReviewProtocolInput {
  readonly rationale: string;
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

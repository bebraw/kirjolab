import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";
import {
  defaultBibliography,
  defaultSource,
  type ApplyCandidateResult,
  type AnnotationResource,
  type CreateAnnotationInput,
  type CreateCandidateInput,
  type CreatePassageLinkInput,
  type ModelCandidate,
  type PassageLink,
  type PdfResource,
  type WorkspaceSnapshot,
} from "../domain/workspace";

interface WorkspaceRow extends Record<string, SqlStorageValue> {
  title: string;
  y_state: ArrayBuffer;
  source: string;
  bibliography: string;
  revision: number;
}

interface PdfRow extends Record<string, SqlStorageValue> {
  id: string;
  name: string;
  content_type: string;
  size: number;
  object_key: string;
  fingerprint: string;
  created_at: string;
}

interface AnnotationRow extends Record<string, SqlStorageValue> {
  id: string;
  pdf_id: string;
  page: number;
  quote: string;
  prefix: string;
  suffix: string;
  comment: string;
  rects_json: string;
  created_at: string;
}

interface LinkRow extends Record<string, SqlStorageValue> {
  id: string;
  annotation_id: string;
  start_offset: number;
  end_offset: number;
  excerpt: string;
  created_at: string;
}

interface CandidateRow extends Record<string, SqlStorageValue> {
  id: string;
  provider: string;
  model: string;
  source_revision: number;
  source_ids: string;
  proposed_source: string;
  status: string;
  created_at: string;
}

export class DocumentRoom extends DurableObject<Env> {
  readonly #document = new Y.Doc();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.#migrate();
      this.#loadDocument();
    });
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "WebSocket upgrade required" }, { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.send(Y.encodeStateAsUpdate(this.#document));
    this.#broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === "string") {
      this.#broadcast(message, socket);
      return;
    }

    if (message.byteLength > 2_000_000) {
      socket.close(1009, "Document update exceeds 2 MB");
      return;
    }

    Y.applyUpdate(this.#document, new Uint8Array(message), "remote");
    const revision = this.#persistDocument();
    this.#broadcast(message, socket);
    this.#broadcast(JSON.stringify({ type: "revision", revision }));
  }

  override webSocketClose(_socket: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    this.#broadcastPresence();
  }

  getSnapshot(workspaceId: string): WorkspaceSnapshot {
    const workspace = this.#workspaceRow();
    return {
      id: workspaceId,
      title: workspace.title,
      source: workspace.source,
      bibliography: workspace.bibliography,
      revision: workspace.revision,
      pdfs: this.#pdfs(),
      annotations: this.#annotations(),
      links: this.#links(),
      candidates: this.#candidates(),
    };
  }

  registerPdf(pdf: PdfResource): PdfResource {
    this.ctx.storage.sql.exec(
      "INSERT INTO pdfs (id, name, content_type, size, object_key, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      pdf.id,
      pdf.name,
      pdf.contentType,
      pdf.size,
      pdf.objectKey,
      pdf.fingerprint,
      pdf.createdAt,
    );
    return pdf;
  }

  createAnnotation(input: CreateAnnotationInput): AnnotationResource {
    const pdf = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM pdfs WHERE id = ?", input.pdfId).one();
    if (pdf.count === 0) throw new Error("PDF not found");

    const annotation: AnnotationResource = { id: crypto.randomUUID(), ...input, createdAt: new Date().toISOString() };
    this.ctx.storage.sql.exec(
      "INSERT INTO annotations (id, pdf_id, page, quote, prefix, suffix, comment, rects_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      annotation.id,
      annotation.pdfId,
      annotation.page,
      annotation.quote,
      annotation.prefix,
      annotation.suffix,
      annotation.comment,
      JSON.stringify(annotation.rects),
      annotation.createdAt,
    );
    return annotation;
  }

  createPassageLink(input: CreatePassageLinkInput): PassageLink {
    const workspace = this.#workspaceRow();
    const annotation = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM annotations WHERE id = ?", input.annotationId)
      .one();
    if (annotation.count === 0) throw new Error("Annotation not found");
    if (input.end > workspace.source.length || workspace.source.slice(input.start, input.end) !== input.excerpt) {
      throw new Error("Document selection is stale");
    }

    const link: PassageLink = { id: crypto.randomUUID(), ...input, createdAt: new Date().toISOString() };
    this.ctx.storage.sql.exec(
      "INSERT INTO passage_links (id, annotation_id, start_offset, end_offset, excerpt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      link.id,
      link.annotationId,
      link.start,
      link.end,
      link.excerpt,
      link.createdAt,
    );
    return link;
  }

  createCandidate(input: CreateCandidateInput): ModelCandidate {
    const candidate: ModelCandidate = {
      id: crypto.randomUUID(),
      provider: input.provider,
      model: input.model,
      operation: "revise-selection",
      sourceRevision: input.sourceRevision,
      sourceIds: input.sourceIds,
      proposedSource: input.proposedSource,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    this.ctx.storage.sql.exec(
      "INSERT INTO candidates (id, provider, model, source_revision, source_ids, proposed_source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      candidate.id,
      candidate.provider,
      candidate.model,
      candidate.sourceRevision,
      JSON.stringify(candidate.sourceIds),
      candidate.proposedSource,
      candidate.status,
      candidate.createdAt,
    );
    return candidate;
  }

  applyCandidate(candidateId: string): ApplyCandidateResult {
    const candidate = this.#candidate(candidateId);
    const workspace = this.#workspaceRow();
    if (candidate.status !== "pending") return { ok: false, error: "Candidate is no longer pending" };
    if (candidate.sourceRevision !== workspace.revision) return { ok: false, error: "Candidate is stale; generate a new revision" };

    const source = this.#document.getText("source");
    this.#document.transact(() => {
      source.delete(0, source.length);
      source.insert(0, candidate.proposedSource);
    }, "candidate");
    this.ctx.storage.sql.exec("UPDATE candidates SET status = 'accepted' WHERE id = ?", candidateId);
    const revision = this.#persistDocument();
    this.#broadcast(Y.encodeStateAsUpdate(this.#document));
    this.#broadcast(JSON.stringify({ type: "revision", revision }));
    return { ok: true, snapshot: this.getSnapshot("demo") };
  }

  rejectCandidate(candidateId: string): ModelCandidate {
    const candidate = this.#candidate(candidateId);
    if (candidate.status !== "pending") throw new Error("Candidate is no longer pending");
    this.ctx.storage.sql.exec("UPDATE candidates SET status = 'rejected' WHERE id = ?", candidateId);
    return { ...candidate, status: "rejected" };
  }

  getPortableDocument(): { source: string; bibliography: string } {
    const workspace = this.#workspaceRow();
    return { source: workspace.source, bibliography: workspace.bibliography };
  }

  #migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS workspace (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        title TEXT NOT NULL,
        y_state BLOB NOT NULL,
        source TEXT NOT NULL,
        bibliography TEXT NOT NULL,
        revision INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pdfs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        object_key TEXT NOT NULL UNIQUE,
        fingerprint TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS annotations (
        id TEXT PRIMARY KEY,
        pdf_id TEXT NOT NULL REFERENCES pdfs(id),
        page INTEGER NOT NULL CHECK (page > 0),
        quote TEXT NOT NULL,
        prefix TEXT NOT NULL,
        suffix TEXT NOT NULL,
        comment TEXT NOT NULL,
        rects_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS passage_links (
        id TEXT PRIMARY KEY,
        annotation_id TEXT NOT NULL REFERENCES annotations(id),
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        excerpt TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS candidates (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        source_revision INTEGER NOT NULL,
        source_ids TEXT NOT NULL,
        proposed_source TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
        created_at TEXT NOT NULL
      );
    `);
    const pdfColumns = this.ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(pdfs)").toArray();
    if (!pdfColumns.some((column) => column.name === "fingerprint")) {
      this.ctx.storage.sql.exec("ALTER TABLE pdfs ADD COLUMN fingerprint TEXT NOT NULL DEFAULT ''");
    }
    const annotationColumns = this.ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(annotations)").toArray();
    if (!annotationColumns.some((column) => column.name === "rects_json")) {
      this.ctx.storage.sql.exec("ALTER TABLE annotations ADD COLUMN rects_json TEXT NOT NULL DEFAULT '[]'");
    }
  }

  #loadDocument(): void {
    const rows = this.ctx.storage.sql.exec<WorkspaceRow>("SELECT * FROM workspace WHERE id = 1").toArray();
    const existing = rows[0];
    if (existing) {
      Y.applyUpdate(this.#document, new Uint8Array(existing.y_state), "storage");
      return;
    }

    this.#document.getText("source").insert(0, defaultSource);
    this.#document.getText("bibliography").insert(0, defaultBibliography);
    const state = Y.encodeStateAsUpdate(this.#document);
    this.ctx.storage.sql.exec(
      "INSERT INTO workspace (id, title, y_state, source, bibliography, revision) VALUES (1, ?, ?, ?, ?, 0)",
      "Evidence becomes prose",
      state.buffer,
      defaultSource,
      defaultBibliography,
    );
  }

  #persistDocument(): number {
    const previous = this.#workspaceRow();
    const revision = previous.revision + 1;
    const state = Y.encodeStateAsUpdate(this.#document);
    this.ctx.storage.sql.exec(
      "UPDATE workspace SET y_state = ?, source = ?, bibliography = ?, revision = ? WHERE id = 1",
      state.buffer,
      this.#document.getText("source").toString(),
      this.#document.getText("bibliography").toString(),
      revision,
    );
    return revision;
  }

  #workspaceRow(): WorkspaceRow {
    return this.ctx.storage.sql.exec<WorkspaceRow>("SELECT * FROM workspace WHERE id = 1").one();
  }

  #pdfs(): PdfResource[] {
    return this.ctx.storage.sql
      .exec<PdfRow>("SELECT * FROM pdfs ORDER BY created_at DESC")
      .toArray()
      .map((row) => ({
        id: row.id,
        name: row.name,
        contentType: "application/pdf",
        size: row.size,
        objectKey: row.object_key,
        fingerprint: row.fingerprint,
        createdAt: row.created_at,
      }));
  }

  #annotations(): AnnotationResource[] {
    return this.ctx.storage.sql
      .exec<AnnotationRow>("SELECT * FROM annotations ORDER BY created_at DESC")
      .toArray()
      .map((row) => ({
        id: row.id,
        pdfId: row.pdf_id,
        page: row.page,
        quote: row.quote,
        prefix: row.prefix,
        suffix: row.suffix,
        comment: row.comment,
        rects: parseSelectionRects(row.rects_json),
        createdAt: row.created_at,
      }));
  }

  #links(): PassageLink[] {
    return this.ctx.storage.sql
      .exec<LinkRow>("SELECT * FROM passage_links ORDER BY created_at DESC")
      .toArray()
      .map((row) => ({
        id: row.id,
        annotationId: row.annotation_id,
        start: row.start_offset,
        end: row.end_offset,
        excerpt: row.excerpt,
        createdAt: row.created_at,
      }));
  }

  #candidates(): ModelCandidate[] {
    return this.ctx.storage.sql
      .exec<CandidateRow>("SELECT * FROM candidates ORDER BY created_at DESC LIMIT 20")
      .toArray()
      .map(candidateFromRow);
  }

  #candidate(candidateId: string): ModelCandidate {
    const rows = this.ctx.storage.sql.exec<CandidateRow>("SELECT * FROM candidates WHERE id = ?", candidateId).toArray();
    const row = rows[0];
    if (!row) throw new Error("Candidate not found");
    return candidateFromRow(row);
  }

  #broadcast(message: string | ArrayBuffer | ArrayBufferView, except?: WebSocket): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== except && socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  }

  #broadcastPresence(): void {
    this.#broadcast(JSON.stringify({ type: "presence", collaborators: this.ctx.getWebSockets().length }));
  }
}

function candidateFromRow(row: CandidateRow): ModelCandidate {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    operation: "revise-selection",
    sourceRevision: row.source_revision,
    sourceIds: parseStringArray(row.source_ids),
    proposedSource: row.proposed_source,
    status: row.status === "accepted" || row.status === "rejected" ? row.status : "pending",
    createdAt: row.created_at,
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseSelectionRects(value: string): AnnotationResource["rects"] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AnnotationResource["rects"][number] =>
        typeof item === "object" &&
        item !== null &&
        "x" in item &&
        "y" in item &&
        "width" in item &&
        "height" in item &&
        [item.x, item.y, item.width, item.height].every((coordinate) => typeof coordinate === "number"),
    );
  } catch {
    return [];
  }
}

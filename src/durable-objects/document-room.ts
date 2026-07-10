import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";
import { mergeBibTeX, normalizeDoi, parseBibTeX, serializeBibTeX, type BibTeXEntry } from "../domain/bibliography";
import { applyYjsUpdateOnce, encodeServerCollaborationMessage } from "../domain/collaboration";
import {
  createManuscriptAnchor,
  resolveManuscriptAnchor,
  toManuscriptAnchorSelector,
  type StoredManuscriptAnchor,
} from "../domain/manuscript-anchor";
import { calculateTextSplice } from "../domain/text";
import {
  defaultBibliography,
  defaultSource,
  type ApplyCandidateResult,
  type AnnotationResource,
  type ClaimEvidenceInput,
  type ClaimEvidenceLink,
  type ClaimEvidenceRelation,
  type ClaimPassageLink,
  type ClaimResource,
  type CreateAnnotationInput,
  type CreateCandidateInput,
  type CreateClaimPassageLinkInput,
  type CreatePassageLinkInput,
  type ModelCandidate,
  type PassageLink,
  type PdfResource,
  type PublicationEnrichment,
  type PublicationResource,
  type UpsertClaimInput,
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
  anchor_version: number;
  relative_start: ArrayBuffer | null;
  relative_end: ArrayBuffer | null;
  quote_prefix: string;
  quote_suffix: string;
  anchored_revision: number | null;
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

interface PublicationRow extends Record<string, SqlStorageValue> {
  id: string;
  citation_key: string;
  entry_type: string;
  title: string;
  authors_json: string;
  publication_year: string;
  venue: string;
  doi: string;
  url: string;
  abstract: string;
  metadata_source: string;
  created_at: string;
  updated_at: string;
}

interface ClaimRow extends Record<string, SqlStorageValue> {
  id: string;
  text: string;
  note: string;
  created_at: string;
  updated_at: string;
}

interface ClaimEvidenceRow extends Record<string, SqlStorageValue> {
  id: string;
  claim_id: string;
  annotation_id: string;
  relation: string;
  created_at: string;
}

interface ClaimLinkRow extends Record<string, SqlStorageValue> {
  id: string;
  claim_id: string;
  start_offset: number;
  end_offset: number;
  excerpt: string;
  anchor_version: number;
  relative_start: ArrayBuffer | null;
  relative_end: ArrayBuffer | null;
  quote_prefix: string;
  quote_suffix: string;
  anchored_revision: number | null;
  created_at: string;
}

export class DocumentRoom extends DurableObject<Env> {
  #document = new Y.Doc();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.#migrate();
      this.#loadDocument();
      this.#backfillManuscriptAnchors();
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
    server.send(encodeServerCollaborationMessage({ type: "sync", protocol: 1, revision: this.#workspaceRow().revision }));
    this.#broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === "string") {
      socket.close(1003, "Client text frames are not supported");
      return;
    }

    if (message.byteLength > 2_000_000) {
      socket.close(1009, "Document update exceeds 2 MB");
      return;
    }

    const update = new Uint8Array(message);
    let applied: boolean;
    try {
      applied = applyYjsUpdateOnce(this.#document, update);
    } catch {
      socket.close(1007, "Invalid document update");
      return;
    }

    if (!applied) {
      socket.send(encodeServerCollaborationMessage({ type: "ack", revision: this.#workspaceRow().revision }));
      return;
    }

    const revision = this.#persistDocument();
    socket.send(encodeServerCollaborationMessage({ type: "ack", revision }));
    this.#broadcast(message, socket);
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision }), socket);
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
      publications: this.#publications(),
      annotations: this.#annotations(),
      links: this.#links(),
      claims: this.#claims(),
      claimEvidenceLinks: this.#claimEvidenceLinks(),
      claimLinks: this.#claimLinks(),
      candidates: this.#candidates(),
    };
  }

  initializeWorkspace(title: string): void {
    const workspace = this.#workspaceRow();
    if (workspace.revision !== 0 || workspace.title !== "Evidence becomes prose") return;
    this.ctx.storage.sql.exec("UPDATE workspace SET title = ? WHERE id = 1", title);
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
    this.#broadcastResources();
    return pdf;
  }

  importBibliography(workspaceId: string, bibtex: string): WorkspaceSnapshot {
    const imported = parseBibTeX(bibtex);
    if (imported.length === 0) throw new Error("No valid BibTeX entries found");
    const merged = mergeBibTeX(this.#workspaceRow().bibliography, bibtex);
    for (const entry of imported) this.#upsertPublication(entry);
    this.#replaceBibliography(merged.source, "bibliography-import");
    return this.getSnapshot(workspaceId);
  }

  getPublication(publicationId: string): PublicationResource {
    const row = this.ctx.storage.sql.exec<PublicationRow>("SELECT * FROM publications WHERE id = ?", publicationId).toArray()[0];
    if (!row) throw new Error("Publication not found");
    return publicationFromRow(row);
  }

  enrichPublication(workspaceId: string, publicationId: string, metadata: PublicationEnrichment): WorkspaceSnapshot {
    const publication = this.getPublication(publicationId);
    if (!publication.doi) throw new Error("Publication has no DOI");
    const updatedAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `UPDATE publications SET title = ?, authors_json = ?, publication_year = ?, venue = ?, doi = ?, url = ?, abstract = ?,
       metadata_source = 'crossref', updated_at = ? WHERE id = ?`,
      metadata.title,
      JSON.stringify(metadata.authors),
      metadata.year,
      metadata.venue,
      normalizeDoi(metadata.doi),
      metadata.url,
      metadata.abstract,
      updatedAt,
      publicationId,
    );
    const entries = parseBibTeX(this.#workspaceRow().bibliography);
    const entry = entries.find((candidate) => candidate.citationKey === publication.citationKey);
    if (entry) {
      entry.fields = {
        ...entry.fields,
        title: metadata.title,
        author: metadata.authors.join(" and "),
        year: metadata.year,
        journal: metadata.venue,
        doi: normalizeDoi(metadata.doi),
        url: metadata.url,
        ...(metadata.abstract ? { abstract: metadata.abstract } : {}),
      };
      this.#replaceBibliography(serializeBibTeX(entries), "crossref-enrichment");
    } else {
      this.#broadcastResources();
    }
    return this.getSnapshot(workspaceId);
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
    this.#broadcastResources();
    return annotation;
  }

  createPassageLink(input: CreatePassageLinkInput): PassageLink {
    const workspace = this.#workspaceRow();
    const source = this.#document.getText("source").toString();
    const annotation = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM annotations WHERE id = ?", input.annotationId)
      .one();
    if (annotation.count === 0) throw new Error("Annotation not found");
    if (input.sourceRevision !== workspace.revision) throw new Error("Document selection is stale");
    if (source !== workspace.source || input.end > source.length || source.slice(input.start, input.end) !== input.excerpt) {
      throw new Error("Document selection is stale");
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const anchor = createManuscriptAnchor(this.#document, input.start, input.end, workspace.revision);
    this.ctx.storage.sql.exec(
      `INSERT INTO passage_links
       (id, annotation_id, start_offset, end_offset, excerpt, anchor_version, relative_start, relative_end,
        quote_prefix, quote_suffix, anchored_revision, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      id,
      input.annotationId,
      input.start,
      input.end,
      input.excerpt,
      anchor.relativeStart,
      anchor.relativeEnd,
      anchor.prefix,
      anchor.suffix,
      anchor.anchoredRevision,
      createdAt,
    );
    this.#broadcastResources();
    return {
      id,
      annotationId: input.annotationId,
      anchor: toManuscriptAnchorSelector(anchor),
      resolution: resolveManuscriptAnchor(this.#document, anchor),
      createdAt,
    };
  }

  createClaim(input: UpsertClaimInput): ClaimResource {
    this.#assertEvidenceAnnotations(input.evidence);
    const now = new Date().toISOString();
    const claim: ClaimResource = {
      id: crypto.randomUUID(),
      text: input.text.trim(),
      note: input.note.trim(),
      createdAt: now,
      updatedAt: now,
    };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO claims (id, text, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        claim.id,
        claim.text,
        claim.note,
        claim.createdAt,
        claim.updatedAt,
      );
      this.#insertClaimEvidence(claim.id, input.evidence, now);
    });
    this.#broadcastResources();
    return claim;
  }

  updateClaim(claimId: string, input: UpsertClaimInput): ClaimResource {
    const existing = this.#claim(claimId);
    this.#assertEvidenceAnnotations(input.evidence);
    const updatedAt = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "UPDATE claims SET text = ?, note = ?, updated_at = ? WHERE id = ?",
        input.text.trim(),
        input.note.trim(),
        updatedAt,
        claimId,
      );
      this.ctx.storage.sql.exec("DELETE FROM claim_evidence_links WHERE claim_id = ?", claimId);
      this.#insertClaimEvidence(claimId, input.evidence, updatedAt);
    });
    this.#broadcastResources();
    return { ...existing, text: input.text.trim(), note: input.note.trim(), updatedAt };
  }

  deleteClaim(claimId: string): void {
    this.#claim(claimId);
    this.ctx.storage.sql.exec("DELETE FROM claims WHERE id = ?", claimId);
    this.#broadcastResources();
  }

  createClaimPassageLink(input: CreateClaimPassageLinkInput): ClaimPassageLink {
    const workspace = this.#workspaceRow();
    const source = this.#document.getText("source").toString();
    this.#claim(input.claimId);
    if (input.sourceRevision !== workspace.revision) throw new Error("Document selection is stale");
    if (source !== workspace.source || input.end > source.length || source.slice(input.start, input.end) !== input.excerpt) {
      throw new Error("Document selection is stale");
    }
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const anchor = createManuscriptAnchor(this.#document, input.start, input.end, workspace.revision);
    this.ctx.storage.sql.exec(
      `INSERT INTO claim_passage_links
       (id, claim_id, start_offset, end_offset, excerpt, anchor_version, relative_start, relative_end,
        quote_prefix, quote_suffix, anchored_revision, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      id,
      input.claimId,
      input.start,
      input.end,
      input.excerpt,
      anchor.relativeStart,
      anchor.relativeEnd,
      anchor.prefix,
      anchor.suffix,
      anchor.anchoredRevision,
      createdAt,
    );
    this.#broadcastResources();
    return {
      id,
      claimId: input.claimId,
      anchor: toManuscriptAnchorSelector(anchor),
      resolution: resolveManuscriptAnchor(this.#document, anchor),
      createdAt,
    };
  }

  createCandidate(input: CreateCandidateInput): ModelCandidate {
    if (input.sourceRevision !== this.#workspaceRow().revision) {
      throw new Error("Candidate source is stale; generate a new revision");
    }
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
    this.#broadcastResources();
    return candidate;
  }

  applyCandidate(workspaceId: string, candidateId: string): ApplyCandidateResult {
    const candidate = this.#candidate(candidateId);
    const workspace = this.#workspaceRow();
    if (candidate.status !== "pending") return { ok: false, error: "Candidate is no longer pending" };
    if (candidate.sourceRevision !== workspace.revision) return { ok: false, error: "Candidate is stale; generate a new revision" };

    const source = this.#document.getText("source");
    const splice = calculateTextSplice(source.toString(), candidate.proposedSource);
    if (splice) {
      this.#document.transact(() => {
        if (splice.deleteCount > 0) source.delete(splice.start, splice.deleteCount);
        if (splice.insert) source.insert(splice.start, splice.insert);
      }, "candidate");
    }
    let revision: number | undefined;
    if (splice) {
      const nextRevision = workspace.revision + 1;
      revision = nextRevision;
      try {
        const state = Y.encodeStateAsUpdate(this.#document);
        this.ctx.storage.transactionSync(() => {
          this.ctx.storage.sql.exec(
            "UPDATE workspace SET y_state = ?, source = ?, bibliography = ?, revision = ? WHERE id = 1",
            state.buffer,
            source.toString(),
            this.#document.getText("bibliography").toString(),
            nextRevision,
          );
          this.ctx.storage.sql.exec("UPDATE candidates SET status = 'accepted' WHERE id = ?", candidateId);
        });
      } catch (error) {
        this.#restoreDocument(workspace.y_state);
        throw error;
      }
    } else {
      this.ctx.storage.sql.exec("UPDATE candidates SET status = 'accepted' WHERE id = ?", candidateId);
    }
    if (revision !== undefined) {
      this.#broadcast(Y.encodeStateAsUpdate(this.#document));
      this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision }));
    }
    this.#broadcastResources();
    return { ok: true, snapshot: this.getSnapshot(workspaceId) };
  }

  rejectCandidate(candidateId: string): ModelCandidate {
    const candidate = this.#candidate(candidateId);
    if (candidate.status !== "pending") throw new Error("Candidate is no longer pending");
    this.ctx.storage.sql.exec("UPDATE candidates SET status = 'rejected' WHERE id = ?", candidateId);
    this.#broadcastResources();
    return { ...candidate, status: "rejected" };
  }

  getPortableDocument(): { source: string; bibliography: string } {
    const workspace = this.#workspaceRow();
    return { source: workspace.source, bibliography: workspace.bibliography };
  }

  #migrate(): void {
    this.ctx.storage.sql.exec(`
      PRAGMA foreign_keys = ON;
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
        anchor_version INTEGER NOT NULL DEFAULT 0,
        relative_start BLOB,
        relative_end BLOB,
        quote_prefix TEXT NOT NULL DEFAULT '',
        quote_suffix TEXT NOT NULL DEFAULT '',
        anchored_revision INTEGER,
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
      CREATE TABLE IF NOT EXISTS publications (
        id TEXT PRIMARY KEY,
        citation_key TEXT NOT NULL UNIQUE COLLATE NOCASE,
        entry_type TEXT NOT NULL,
        title TEXT NOT NULL,
        authors_json TEXT NOT NULL,
        publication_year TEXT NOT NULL,
        venue TEXT NOT NULL,
        doi TEXT NOT NULL,
        url TEXT NOT NULL,
        abstract TEXT NOT NULL,
        metadata_source TEXT NOT NULL CHECK (metadata_source IN ('bibtex', 'crossref')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS claims (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        note TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS claim_evidence_links (
        id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
        annotation_id TEXT NOT NULL REFERENCES annotations(id),
        relation TEXT NOT NULL CHECK (relation IN ('supports', 'contradicts', 'extends')),
        created_at TEXT NOT NULL,
        UNIQUE (claim_id, annotation_id)
      );
      CREATE TABLE IF NOT EXISTS claim_passage_links (
        id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        excerpt TEXT NOT NULL,
        anchor_version INTEGER NOT NULL DEFAULT 0,
        relative_start BLOB,
        relative_end BLOB,
        quote_prefix TEXT NOT NULL DEFAULT '',
        quote_suffix TEXT NOT NULL DEFAULT '',
        anchored_revision INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS publications_doi ON publications(doi) WHERE doi <> '';
      CREATE INDEX IF NOT EXISTS claim_evidence_annotation ON claim_evidence_links(annotation_id);
      CREATE INDEX IF NOT EXISTS claim_passage_claim ON claim_passage_links(claim_id);
    `);
    const pdfColumns = this.ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(pdfs)").toArray();
    if (!pdfColumns.some((column) => column.name === "fingerprint")) {
      this.ctx.storage.sql.exec("ALTER TABLE pdfs ADD COLUMN fingerprint TEXT NOT NULL DEFAULT ''");
    }
    const annotationColumns = this.ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(annotations)").toArray();
    if (!annotationColumns.some((column) => column.name === "rects_json")) {
      this.ctx.storage.sql.exec("ALTER TABLE annotations ADD COLUMN rects_json TEXT NOT NULL DEFAULT '[]'");
    }
    this.#addAnchorColumns("passage_links");
    this.#addAnchorColumns("claim_passage_links");
  }

  #addAnchorColumns(table: "passage_links" | "claim_passage_links"): void {
    const columns = this.ctx.storage.sql.exec<{ name: string }>(`PRAGMA table_info(${table})`).toArray();
    const additions = [
      ["anchor_version", "INTEGER NOT NULL DEFAULT 0"],
      ["relative_start", "BLOB"],
      ["relative_end", "BLOB"],
      ["quote_prefix", "TEXT NOT NULL DEFAULT ''"],
      ["quote_suffix", "TEXT NOT NULL DEFAULT ''"],
      ["anchored_revision", "INTEGER"],
    ] as const;
    for (const [name, definition] of additions) {
      if (!columns.some((column) => column.name === name)) {
        this.ctx.storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
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

  #restoreDocument(state: ArrayBuffer): void {
    this.#document.destroy();
    this.#document = new Y.Doc();
    Y.applyUpdate(this.#document, new Uint8Array(state), "storage");
  }

  #backfillManuscriptAnchors(): void {
    const workspace = this.#workspaceRow();
    this.#backfillAnchorTable("passage_links", workspace);
    this.#backfillAnchorTable("claim_passage_links", workspace);
  }

  #backfillAnchorTable(table: "passage_links" | "claim_passage_links", workspace: WorkspaceRow): void {
    const source = this.#document.getText("source").toString();
    const rows = this.ctx.storage.sql
      .exec<LinkRow | ClaimLinkRow>(`SELECT * FROM ${table} WHERE anchor_version <> 1 OR anchored_revision IS NULL`)
      .toArray();
    for (const row of rows) {
      const validRange =
        source === workspace.source &&
        row.start_offset >= 0 &&
        row.end_offset > row.start_offset &&
        row.end_offset <= source.length &&
        source.slice(row.start_offset, row.end_offset) === row.excerpt;
      const anchor: StoredManuscriptAnchor = validRange
        ? createManuscriptAnchor(this.#document, row.start_offset, row.end_offset, workspace.revision)
        : {
            version: 1,
            relativeStart: null,
            relativeEnd: null,
            exact: row.excerpt,
            prefix: "",
            suffix: "",
            originalRange: { start: row.start_offset, end: row.end_offset },
            anchoredRevision: workspace.revision,
          };
      this.ctx.storage.sql.exec(
        `UPDATE ${table}
         SET anchor_version = 1, relative_start = ?, relative_end = ?, quote_prefix = ?, quote_suffix = ?, anchored_revision = ?
         WHERE id = ?`,
        anchor.relativeStart,
        anchor.relativeEnd,
        anchor.prefix,
        anchor.suffix,
        anchor.anchoredRevision,
        row.id,
      );
    }
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

  #replaceBibliography(sourceValue: string, origin: string): void {
    const bibliography = this.#document.getText("bibliography");
    this.#document.transact(() => {
      bibliography.delete(0, bibliography.length);
      bibliography.insert(0, sourceValue);
    }, origin);
    const revision = this.#persistDocument();
    this.#broadcast(Y.encodeStateAsUpdate(this.#document));
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision }));
    this.#broadcastResources();
  }

  #upsertPublication(entry: BibTeXEntry): PublicationResource {
    const doi = normalizeDoi(entry.fields.doi ?? "");
    const byCitation = this.ctx.storage.sql
      .exec<PublicationRow>("SELECT * FROM publications WHERE citation_key = ? COLLATE NOCASE", entry.citationKey)
      .toArray()[0];
    const byDoi = doi
      ? this.ctx.storage.sql.exec<PublicationRow>("SELECT * FROM publications WHERE doi = ? LIMIT 1", doi).toArray()[0]
      : undefined;
    const existing = byCitation ?? byDoi;
    const now = new Date().toISOString();
    const values = publicationValues(entry);
    if (existing) {
      this.ctx.storage.sql.exec(
        `UPDATE publications SET citation_key = ?, entry_type = ?, title = ?, authors_json = ?, publication_year = ?, venue = ?,
         doi = ?, url = ?, abstract = ?, metadata_source = 'bibtex', updated_at = ? WHERE id = ?`,
        entry.citationKey,
        entry.type,
        values.title,
        JSON.stringify(values.authors),
        values.year,
        values.venue,
        values.doi,
        values.url,
        values.abstract,
        now,
        existing.id,
      );
      return this.getPublication(existing.id);
    }
    const id = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      `INSERT INTO publications
       (id, citation_key, entry_type, title, authors_json, publication_year, venue, doi, url, abstract, metadata_source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bibtex', ?, ?)`,
      id,
      entry.citationKey,
      entry.type,
      values.title,
      JSON.stringify(values.authors),
      values.year,
      values.venue,
      values.doi,
      values.url,
      values.abstract,
      now,
      now,
    );
    return this.getPublication(id);
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

  #publications(): PublicationResource[] {
    return this.ctx.storage.sql
      .exec<PublicationRow>("SELECT * FROM publications ORDER BY updated_at DESC, citation_key ASC LIMIT 500")
      .toArray()
      .map(publicationFromRow);
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
      .map((row) => passageLinkFromRow(this.#document, row));
  }

  #claims(): ClaimResource[] {
    return this.ctx.storage.sql.exec<ClaimRow>("SELECT * FROM claims ORDER BY updated_at DESC LIMIT 500").toArray().map(claimFromRow);
  }

  #claimEvidenceLinks(): ClaimEvidenceLink[] {
    return this.ctx.storage.sql
      .exec<ClaimEvidenceRow>("SELECT * FROM claim_evidence_links ORDER BY created_at DESC")
      .toArray()
      .map((row) => ({
        id: row.id,
        claimId: row.claim_id,
        annotationId: row.annotation_id,
        relation: claimEvidenceRelation(row.relation),
        createdAt: row.created_at,
      }));
  }

  #claimLinks(): ClaimPassageLink[] {
    return this.ctx.storage.sql
      .exec<ClaimLinkRow>("SELECT * FROM claim_passage_links ORDER BY created_at DESC")
      .toArray()
      .map((row) => claimPassageLinkFromRow(this.#document, row));
  }

  #claim(claimId: string): ClaimResource {
    const row = this.ctx.storage.sql.exec<ClaimRow>("SELECT * FROM claims WHERE id = ?", claimId).toArray()[0];
    if (!row) throw new Error("Claim not found");
    return claimFromRow(row);
  }

  #assertEvidenceAnnotations(evidence: ClaimEvidenceInput[]): void {
    for (const item of evidence) {
      const annotation = this.ctx.storage.sql
        .exec<{ count: number }>("SELECT COUNT(*) AS count FROM annotations WHERE id = ?", item.annotationId)
        .one();
      if (annotation.count === 0) throw new Error("Annotation not found");
    }
  }

  #insertClaimEvidence(claimId: string, evidence: ClaimEvidenceInput[], createdAt: string): void {
    for (const item of evidence) {
      this.ctx.storage.sql.exec(
        "INSERT INTO claim_evidence_links (id, claim_id, annotation_id, relation, created_at) VALUES (?, ?, ?, ?, ?)",
        crypto.randomUUID(),
        claimId,
        item.annotationId,
        item.relation,
        createdAt,
      );
    }
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
    this.#broadcast(encodeServerCollaborationMessage({ type: "presence", collaborators: this.ctx.getWebSockets().length }));
  }

  #broadcastResources(): void {
    this.#broadcast(encodeServerCollaborationMessage({ type: "resources" }));
  }
}

function passageLinkFromRow(document: Y.Doc, row: LinkRow): PassageLink {
  const anchor = manuscriptAnchorFromRow(row);
  return {
    id: row.id,
    annotationId: row.annotation_id,
    anchor: toManuscriptAnchorSelector(anchor),
    resolution: resolveManuscriptAnchor(document, anchor),
    createdAt: row.created_at,
  };
}

function claimPassageLinkFromRow(document: Y.Doc, row: ClaimLinkRow): ClaimPassageLink {
  const anchor = manuscriptAnchorFromRow(row);
  return {
    id: row.id,
    claimId: row.claim_id,
    anchor: toManuscriptAnchorSelector(anchor),
    resolution: resolveManuscriptAnchor(document, anchor),
    createdAt: row.created_at,
  };
}

function manuscriptAnchorFromRow(row: LinkRow | ClaimLinkRow): StoredManuscriptAnchor {
  return {
    version: 1,
    relativeStart: row.anchor_version === 1 ? row.relative_start : null,
    relativeEnd: row.anchor_version === 1 ? row.relative_end : null,
    exact: row.excerpt,
    prefix: row.quote_prefix,
    suffix: row.quote_suffix,
    originalRange: { start: row.start_offset, end: row.end_offset },
    anchoredRevision: row.anchored_revision ?? 0,
  };
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

function claimFromRow(row: ClaimRow): ClaimResource {
  return { id: row.id, text: row.text, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at };
}

function claimEvidenceRelation(value: string): ClaimEvidenceRelation {
  if (value === "contradicts" || value === "extends") return value;
  return "supports";
}

function publicationValues(entry: BibTeXEntry): Omit<PublicationEnrichment, "doi"> & { doi: string } {
  return {
    title: entry.fields.title ?? "Untitled publication",
    authors: (entry.fields.author ?? "")
      .split(/\s+and\s+/iu)
      .map((author) => author.trim())
      .filter(Boolean),
    year: entry.fields.year ?? "",
    venue: entry.fields.journal ?? entry.fields.booktitle ?? entry.fields.publisher ?? "",
    doi: normalizeDoi(entry.fields.doi ?? ""),
    url: entry.fields.url ?? "",
    abstract: entry.fields.abstract ?? "",
  };
}

function publicationFromRow(row: PublicationRow): PublicationResource {
  return {
    id: row.id,
    citationKey: row.citation_key,
    type: row.entry_type,
    title: row.title,
    authors: parseStringArray(row.authors_json),
    year: row.publication_year,
    venue: row.venue,
    doi: row.doi,
    url: row.url,
    abstract: row.abstract,
    metadataSource: row.metadata_source === "crossref" ? "crossref" : "bibtex",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

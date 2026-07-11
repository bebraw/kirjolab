import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";
import {
  bibTeXPublicationProjectionsEqual,
  mergeBibTeX,
  normalizeDoi,
  parseBibTeX,
  projectBibTeXPublication,
  serializeBibTeX,
  type BibTeXPublicationProjection,
} from "../domain/bibliography";
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
  type CreatePublicationPdfLinkInput,
  type ModelCandidate,
  type PassageLink,
  type PdfResource,
  type PublicationEnrichment,
  type PublicationPdfLink,
  type PublicationResource,
  type UpsertClaimInput,
  type WorkspaceSnapshot,
} from "../domain/workspace";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";

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

interface PublicationPdfLinkRow extends Record<string, SqlStorageValue> {
  id: string;
  publication_id: string;
  pdf_id: string;
  created_at: string;
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

interface PersistedDocumentUpdate {
  readonly resourcesChanged: boolean;
  readonly revision: number;
}

interface ProjectionOptions {
  readonly acceptedCrossref?: {
    readonly projection: BibTeXPublicationProjection;
    readonly publicationId: string;
  };
}

export class DocumentRoom extends DurableObject<Env> {
  #document = new Y.Doc();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec("PRAGMA foreign_keys = ON");
      runSQLiteMigrations(this.ctx.storage, this.#schemaMigrations());
      this.#loadDocument();
      runSQLiteMigrations(this.ctx.storage, this.#dataMigrations());
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

    let previous: WorkspaceRow;
    try {
      previous = this.#workspaceRow();
    } catch {
      socket.close(1011, "Document state could not be read");
      return;
    }

    const update = new Uint8Array(message);
    let applied: boolean;
    try {
      applied = applyYjsUpdateOnce(this.#document, update);
    } catch {
      this.#restoreDocument(previous.y_state);
      socket.close(1007, "Invalid document update");
      return;
    }

    if (!applied) {
      socket.send(encodeServerCollaborationMessage({ type: "ack", revision: previous.revision }));
      return;
    }

    let persisted: PersistedDocumentUpdate;
    try {
      persisted = this.#persistDocument(previous);
    } catch {
      socket.close(1011, "Document update could not be persisted");
      return;
    }
    socket.send(encodeServerCollaborationMessage({ type: "ack", revision: persisted.revision }));
    this.#broadcast(message, socket);
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }), socket);
    if (persisted.resourcesChanged) this.#broadcastResources();
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
      publicationPdfLinks: this.#publicationPdfLinks(),
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
    this.#replaceBibliography(merged.source, "bibliography-import");
    return this.getSnapshot(workspaceId);
  }

  getPublication(publicationId: string): PublicationResource {
    const row = this.ctx.storage.sql.exec<PublicationRow>("SELECT * FROM publications WHERE id = ?", publicationId).toArray()[0];
    if (!row) throw new Error("Publication not found");
    return publicationFromRow(row);
  }

  createPublicationPdfLink(input: CreatePublicationPdfLinkInput): PublicationPdfLink {
    const link: PublicationPdfLink = {
      id: crypto.randomUUID(),
      publicationId: input.publicationId,
      pdfId: input.pdfId,
      createdAt: new Date().toISOString(),
    };
    this.ctx.storage.transactionSync(() => {
      const publication = this.ctx.storage.sql
        .exec<{ count: number }>("SELECT COUNT(*) AS count FROM publications WHERE id = ?", link.publicationId)
        .one();
      if (publication.count === 0) throw new Error("Publication not found");
      const pdf = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM pdfs WHERE id = ?", link.pdfId).one();
      if (pdf.count === 0) throw new Error("PDF not found");
      const existing = this.ctx.storage.sql
        .exec<{
          count: number;
        }>("SELECT COUNT(*) AS count FROM publication_pdf_links WHERE publication_id = ? AND pdf_id = ?", link.publicationId, link.pdfId)
        .one();
      if (existing.count > 0) throw new Error("Publication/PDF link already exists");
      this.ctx.storage.sql.exec(
        "INSERT INTO publication_pdf_links (id, publication_id, pdf_id, created_at) VALUES (?, ?, ?, ?)",
        link.id,
        link.publicationId,
        link.pdfId,
        link.createdAt,
      );
    });
    this.#broadcastResources();
    return link;
  }

  deletePublicationPdfLink(linkId: string): void {
    const existing = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM publication_pdf_links WHERE id = ?", linkId)
      .one();
    if (existing.count === 0) throw new Error("Publication/PDF link not found");
    this.ctx.storage.sql.exec("DELETE FROM publication_pdf_links WHERE id = ?", linkId);
    this.#broadcastResources();
  }

  enrichPublication(workspaceId: string, publicationId: string, metadata: PublicationEnrichment): WorkspaceSnapshot {
    const publication = this.getPublication(publicationId);
    if (!publication.doi) throw new Error("Publication has no DOI");
    const entries = parseBibTeX(this.#workspaceRow().bibliography);
    const citationKey = publication.citationKey.toLowerCase();
    const entry = entries.find((candidate) => candidate.citationKey.toLowerCase() === citationKey);
    if (!entry) throw new Error("Publication is not present in the canonical bibliography");
    entry.fields = {
      ...entry.fields,
      title: metadata.title,
      author: metadata.authors.join(" and "),
      year: metadata.year,
      journal: metadata.venue,
      doi: normalizeDoi(metadata.doi),
      url: metadata.url,
      abstract: metadata.abstract,
    };
    this.#replaceBibliography(serializeBibTeX(entries), "crossref-enrichment", {
      acceptedCrossref: { projection: projectBibTeXPublication(entry), publicationId },
    });
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

  #schemaMigrations(): readonly SQLiteMigration[] {
    return [
      {
        version: 1,
        name: "create-document-room",
        apply(sql): undefined {
          sql.exec(`
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
          return undefined;
        },
      },
      {
        version: 2,
        name: "add-pdf-fingerprint",
        apply(sql): undefined {
          const columns = sql.exec<{ name: string }>("PRAGMA table_info(pdfs)").toArray();
          if (!columns.some((column) => column.name === "fingerprint")) {
            sql.exec("ALTER TABLE pdfs ADD COLUMN fingerprint TEXT NOT NULL DEFAULT ''");
          }
          return undefined;
        },
      },
      {
        version: 3,
        name: "add-annotation-rectangles",
        apply(sql): undefined {
          const columns = sql.exec<{ name: string }>("PRAGMA table_info(annotations)").toArray();
          if (!columns.some((column) => column.name === "rects_json")) {
            sql.exec("ALTER TABLE annotations ADD COLUMN rects_json TEXT NOT NULL DEFAULT '[]'");
          }
          return undefined;
        },
      },
      {
        version: 4,
        name: "add-relative-manuscript-anchors",
        apply: (): undefined => {
          this.#addAnchorColumns("passage_links");
          this.#addAnchorColumns("claim_passage_links");
          return undefined;
        },
      },
    ];
  }

  #dataMigrations(): readonly SQLiteMigration[] {
    return [
      {
        version: 5,
        name: "backfill-relative-manuscript-anchors",
        apply: (): undefined => {
          this.#backfillManuscriptAnchors();
          return undefined;
        },
      },
      {
        version: 6,
        name: "project-canonical-bibliography",
        apply: (): undefined => {
          this.#reconcileBibliography(this.#document.getText("bibliography").toString());
          return undefined;
        },
      },
      {
        version: 7,
        name: "add-publication-pdf-links",
        apply(sql): undefined {
          sql.exec(`
            CREATE TABLE IF NOT EXISTS publication_pdf_links (
              id TEXT PRIMARY KEY,
              publication_id TEXT NOT NULL REFERENCES publications(id),
              pdf_id TEXT NOT NULL REFERENCES pdfs(id),
              created_at TEXT NOT NULL,
              UNIQUE (publication_id, pdf_id)
            );
            CREATE INDEX IF NOT EXISTS publication_pdf_links_pdf ON publication_pdf_links(pdf_id);
          `);
          return undefined;
        },
      },
    ];
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

  #persistDocument(previous: WorkspaceRow, options: ProjectionOptions = {}): PersistedDocumentUpdate {
    const revision = previous.revision + 1;
    let resourcesChanged = false;
    try {
      const state = Y.encodeStateAsUpdate(this.#document);
      const source = this.#document.getText("source").toString();
      const bibliography = this.#document.getText("bibliography").toString();
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(
          "UPDATE workspace SET y_state = ?, source = ?, bibliography = ?, revision = ? WHERE id = 1",
          state.buffer,
          source,
          bibliography,
          revision,
        );
        if (bibliography !== previous.bibliography || options.acceptedCrossref) {
          resourcesChanged = this.#reconcileBibliography(bibliography, options);
        }
      });
    } catch (error) {
      this.#restoreDocument(previous.y_state);
      throw error;
    }
    return { resourcesChanged, revision };
  }

  #replaceBibliography(sourceValue: string, origin: string, options: ProjectionOptions = {}): void {
    const bibliography = this.#document.getText("bibliography");
    const splice = calculateTextSplice(bibliography.toString(), sourceValue);
    if (!splice) {
      let resourcesChanged = false;
      this.ctx.storage.transactionSync(() => {
        resourcesChanged = this.#reconcileBibliography(sourceValue, options);
      });
      if (resourcesChanged) this.#broadcastResources();
      return;
    }

    const previous = this.#workspaceRow();
    const stateVector = Y.encodeStateVector(this.#document);
    this.#document.transact(() => {
      if (splice.deleteCount > 0) bibliography.delete(splice.start, splice.deleteCount);
      if (splice.insert) bibliography.insert(splice.start, splice.insert);
    }, origin);
    const persisted = this.#persistDocument(previous, options);
    this.#broadcast(Y.encodeStateAsUpdate(this.#document, stateVector));
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }));
    if (persisted.resourcesChanged) this.#broadcastResources();
  }

  #reconcileBibliography(sourceValue: string, options: ProjectionOptions = {}): boolean {
    const now = new Date().toISOString();
    let changed = false;
    for (const entry of parseBibTeX(sourceValue)) {
      const projection = projectBibTeXPublication(entry);
      const byCitation = this.ctx.storage.sql
        .exec<PublicationRow>("SELECT * FROM publications WHERE citation_key = ? COLLATE NOCASE", projection.citationKey)
        .toArray()[0];
      const byDoi = projection.doi
        ? this.ctx.storage.sql
            .exec<PublicationRow>("SELECT * FROM publications WHERE doi = ? ORDER BY created_at ASC, id ASC LIMIT 1", projection.doi)
            .toArray()[0]
        : undefined;
      const existing = byCitation ?? byDoi;
      if (!existing) {
        const id = crypto.randomUUID();
        this.ctx.storage.sql.exec(
          `INSERT INTO publications
           (id, citation_key, entry_type, title, authors_json, publication_year, venue, doi, url, abstract,
            metadata_source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bibtex', ?, ?)`,
          id,
          projection.citationKey,
          projection.type,
          projection.title,
          JSON.stringify(projection.authors),
          projection.year,
          projection.venue,
          projection.doi,
          projection.url,
          projection.abstract,
          now,
          now,
        );
        changed = true;
        continue;
      }

      const projectionChanged = !bibTeXPublicationProjectionsEqual(publicationProjectionFromRow(existing), projection);
      const acceptedCrossref =
        existing.id === options.acceptedCrossref?.publicationId &&
        bibTeXPublicationProjectionsEqual(projection, options.acceptedCrossref.projection);
      if (!projectionChanged) {
        if (acceptedCrossref && existing.metadata_source !== "crossref") {
          this.ctx.storage.sql.exec(
            "UPDATE publications SET metadata_source = 'crossref', updated_at = ? WHERE id = ?",
            nextUpdatedAt(existing.updated_at, now),
            existing.id,
          );
          changed = true;
        }
        continue;
      }

      this.ctx.storage.sql.exec(
        `UPDATE publications SET citation_key = ?, entry_type = ?, title = ?, authors_json = ?, publication_year = ?, venue = ?,
         doi = ?, url = ?, abstract = ?, metadata_source = ?, updated_at = ? WHERE id = ?`,
        projection.citationKey,
        projection.type,
        projection.title,
        JSON.stringify(projection.authors),
        projection.year,
        projection.venue,
        projection.doi,
        projection.url,
        projection.abstract,
        acceptedCrossref ? "crossref" : "bibtex",
        nextUpdatedAt(existing.updated_at, now),
        existing.id,
      );
      changed = true;
    }
    return changed;
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

  #publicationPdfLinks(): PublicationPdfLink[] {
    return this.ctx.storage.sql
      .exec<PublicationPdfLinkRow>("SELECT * FROM publication_pdf_links ORDER BY created_at DESC, id ASC")
      .toArray()
      .map(publicationPdfLinkFromRow);
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

function publicationProjectionFromRow(row: PublicationRow): BibTeXPublicationProjection {
  return {
    citationKey: row.citation_key,
    type: row.entry_type,
    title: row.title,
    authors: parseStringArray(row.authors_json),
    year: row.publication_year,
    venue: row.venue,
    doi: row.doi,
    url: row.url,
    abstract: row.abstract,
  };
}

function nextUpdatedAt(previous: string, candidate: string): string {
  const previousTime = Date.parse(previous);
  const candidateTime = Date.parse(candidate);
  if (!Number.isFinite(previousTime) || !Number.isFinite(candidateTime) || candidateTime > previousTime) return candidate;
  return new Date(previousTime + 1).toISOString();
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

function publicationPdfLinkFromRow(row: PublicationPdfLinkRow): PublicationPdfLink {
  return {
    id: row.id,
    publicationId: row.publication_id,
    pdfId: row.pdf_id,
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

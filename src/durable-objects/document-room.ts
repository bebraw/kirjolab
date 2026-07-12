import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";
import {
  bibTeXPublicationProjectionsEqual,
  mergeBibTeX,
  normalizeDoi,
  parseBibTeX,
  projectBibTeXPublication,
  serializeBibTeX,
  type BibTeXEntry,
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
import { isValidCitationKey, suggestCitationKey } from "../domain/publication-intake";
import {
  composeProject,
  inboundProjectIncludes,
  normalizeProjectPath,
  projectUsesCitationAlias,
  projectEntryPath,
  rewriteInboundProjectIncludes,
  rewriteProjectCitationAlias,
  type ProjectFile,
} from "../domain/project-files";
import { bibliographicSnapshot, type BibliographicRecord, type BibliographicSnapshot, type WebSnapshot } from "../domain/reference-library";
import type { ResearchShareSnapshot } from "../domain/reference-library";
import {
  defaultBibliography,
  defaultSource,
  isCreateCandidateInput,
  isModelCandidate,
  type ApplyCandidateResult,
  type AnnotationLinkResult,
  type AnnotationResource,
  type ClaimEvidenceInput,
  type ClaimEvidenceLink,
  type ClaimEvidenceRelation,
  type ClaimPassageLink,
  type ClaimResource,
  type CreateAnnotationInput,
  type CreateAnnotationLinkInput,
  type CreateCandidateInput,
  type CreateClaimPassageLinkInput,
  type CreatePassageLinkInput,
  type CreatePublicationPdfLinkInput,
  type ModelCandidate,
  type ModelEvidence,
  type ModelEvidenceReference,
  type PassageLink,
  type PdfResource,
  type PublicationEnrichment,
  type PublicationIntakePreview,
  type PublicationIntakeResult,
  type PublicationPdfLink,
  type PublicationResource,
  type ProjectReferenceLink,
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
  entry_file_id: string | null;
}

interface ProjectFileRow extends Record<string, SqlStorageValue> {
  id: string;
  path: string;
  media_type: string;
  y_text_name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface ProjectReferenceRow extends Record<string, SqlStorageValue> {
  id: string;
  reference_id: string;
  citation_alias: string;
  snapshot_json: string;
  created_at: string;
  updated_at: string;
}

interface ResearchShareRow extends Record<string, SqlStorageValue> {
  id: string;
  project_id: string;
  reference_id: string;
  resource_id: string;
  kind: string;
  snapshot_json: string;
  created_at: string;
  revoked_at: string | null;
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
  project_file_id: string;
  created_at: string;
}

interface CandidateRow extends Record<string, SqlStorageValue> {
  id: string;
  operation: string;
  prompt_version: string;
  provider_adapter: string;
  provider_label: string;
  model: string;
  instruction: string;
  source_revision: number;
  start_offset: number;
  end_offset: number;
  excerpt: string;
  anchor_version: number;
  relative_start: ArrayBuffer | null;
  relative_end: ArrayBuffer | null;
  quote_prefix: string;
  quote_suffix: string;
  anchored_revision: number;
  project_file_id: string;
  evidence_json: string;
  proposed_replacement: string;
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
  project_file_id: string;
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

interface PublicationPdfLinkWrite {
  readonly created: boolean;
  readonly link: PublicationPdfLink;
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
    const files = this.#projectFiles();
    const projectReferences = this.#projectReferences();
    if (!workspace.entry_file_id) throw new Error("Project entry file is not initialized");
    return {
      id: workspaceId,
      title: workspace.title,
      entryFileId: workspace.entry_file_id,
      files,
      composition: composeProject(files, workspace.entry_file_id),
      source: workspace.source,
      bibliography: workspace.bibliography,
      revision: workspace.revision,
      pdfs: this.#pdfs(),
      publications: projectReferences.length > 0 ? projectReferences.map(projectReferencePublication) : this.#publications(),
      projectReferences,
      researchShares: this.#researchShares(),
      publicationPdfLinks: this.#publicationPdfLinks(),
      annotations: this.#annotations(),
      links: this.#links(),
      claims: this.#claims(),
      claimEvidenceLinks: this.#claimEvidenceLinks(),
      claimLinks: this.#claimLinks(),
      candidates: this.#candidates(),
    };
  }

  linkProjectReference(
    workspaceId: string,
    reference: BibliographicRecord,
    aliasValue: string,
    webSnapshot: WebSnapshot | null = null,
  ): WorkspaceSnapshot {
    const alias = aliasValue.trim();
    if (!isValidCitationKey(alias)) throw new Error("Citation alias is invalid");
    const rows = this.#projectReferenceRows();
    const existingReference = rows.find((row) => row.reference_id === reference.id);
    if (existingReference) return this.getSnapshot(workspaceId);
    if (rows.some((row) => row.citation_alias.toLocaleLowerCase() === alias.toLocaleLowerCase())) {
      throw new Error("Citation alias already exists in this project");
    }
    const now = new Date().toISOString();
    const link: ProjectReferenceLink = {
      id: crypto.randomUUID(),
      referenceId: reference.id,
      citationAlias: alias,
      snapshot: bibliographicSnapshot(reference, now, webSnapshot),
      createdAt: now,
      updatedAt: now,
    };
    const next = [...rows.map(projectReferenceFromRow), link];
    this.#replaceBibliography(projectReferenceBibliography(next), "project-reference-link", {}, () => {
      this.ctx.storage.sql.exec(
        `INSERT INTO project_references (id, reference_id, citation_alias, snapshot_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        link.id,
        link.referenceId,
        link.citationAlias,
        JSON.stringify(link.snapshot),
        now,
        now,
      );
    });
    return this.getSnapshot(workspaceId);
  }

  syncProjectReference(workspaceId: string, reference: BibliographicRecord): WorkspaceSnapshot {
    const rows = this.#projectReferenceRows();
    const row = rows.find((item) => item.reference_id === reference.id);
    if (!row) throw new Error("Reference is not linked to this project");
    const now = new Date().toISOString();
    const existing = projectReferenceFromRow(row);
    const snapshot = existing.snapshot.webSnapshot ? existing.snapshot : bibliographicSnapshot(reference, now);
    const next = rows
      .map(projectReferenceFromRow)
      .map((link) => (link.referenceId === reference.id ? { ...link, snapshot, updatedAt: now } : link));
    this.#replaceBibliography(projectReferenceBibliography(next), "project-reference-sync", {}, () => {
      this.ctx.storage.sql.exec(
        "UPDATE project_references SET snapshot_json = ?, updated_at = ? WHERE reference_id = ?",
        JSON.stringify(snapshot),
        now,
        reference.id,
      );
    });
    return this.getSnapshot(workspaceId);
  }

  pinProjectWebSnapshot(workspaceId: string, reference: BibliographicRecord, webSnapshot: WebSnapshot): WorkspaceSnapshot {
    if (webSnapshot.referenceId !== reference.id) throw new Error("Web snapshot does not belong to this reference");
    const rows = this.#projectReferenceRows();
    const row = rows.find((item) => item.reference_id === reference.id);
    if (!row) throw new Error("Reference is not linked to this project");
    const now = new Date().toISOString();
    const snapshot = bibliographicSnapshot(reference, now, webSnapshot);
    const next = rows
      .map(projectReferenceFromRow)
      .map((link) => (link.referenceId === reference.id ? { ...link, snapshot, updatedAt: now } : link));
    this.#replaceBibliography(projectReferenceBibliography(next), "project-web-snapshot-pin", {}, () => {
      this.ctx.storage.sql.exec(
        "UPDATE project_references SET snapshot_json = ?, updated_at = ? WHERE reference_id = ?",
        JSON.stringify(snapshot),
        now,
        reference.id,
      );
    });
    return this.getSnapshot(workspaceId);
  }

  renameProjectReferenceAlias(workspaceId: string, referenceId: string, aliasValue: string): WorkspaceSnapshot {
    const alias = aliasValue.trim();
    if (!isValidCitationKey(alias)) throw new Error("Citation alias is invalid");
    const rows = this.#projectReferenceRows();
    const row = rows.find((item) => item.reference_id === referenceId);
    if (!row) throw new Error("Reference is not linked to this project");
    if (rows.some((item) => item.reference_id !== referenceId && item.citation_alias.toLocaleLowerCase() === alias.toLocaleLowerCase())) {
      throw new Error("Citation alias already exists in this project");
    }
    if (row.citation_alias === alias) return this.getSnapshot(workspaceId);

    const previous = this.#workspaceRow();
    const stateVector = Y.encodeStateVector(this.#document);
    for (const fileRow of this.#projectFileRows()) {
      const text = this.#document.getText(fileRow.y_text_name);
      const content = rewriteProjectCitationAlias(text.toString(), row.citation_alias, alias);
      const splice = calculateTextSplice(text.toString(), content);
      if (!splice) continue;
      if (splice.deleteCount > 0) text.delete(splice.start, splice.deleteCount);
      if (splice.insert) text.insert(splice.start, splice.insert);
    }
    const now = new Date().toISOString();
    const next = rows
      .map(projectReferenceFromRow)
      .map((link) => (link.referenceId === referenceId ? { ...link, citationAlias: alias, updatedAt: now } : link));
    const bibliography = this.#document.getText("bibliography");
    const bibliographySplice = calculateTextSplice(bibliography.toString(), projectReferenceBibliography(next));
    if (bibliographySplice) {
      if (bibliographySplice.deleteCount > 0) bibliography.delete(bibliographySplice.start, bibliographySplice.deleteCount);
      if (bibliographySplice.insert) bibliography.insert(bibliographySplice.start, bibliographySplice.insert);
    }
    const persisted = this.#persistDocument(previous, {}, () => {
      this.ctx.storage.sql.exec(
        "UPDATE project_references SET citation_alias = ?, updated_at = ? WHERE reference_id = ?",
        alias,
        now,
        referenceId,
      );
    });
    this.#broadcast(Y.encodeStateAsUpdate(this.#document, stateVector));
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }));
    this.#broadcastResources();
    return this.getSnapshot(workspaceId);
  }

  unlinkProjectReference(workspaceId: string, referenceId: string): WorkspaceSnapshot {
    const rows = this.#projectReferenceRows();
    const row = rows.find((item) => item.reference_id === referenceId);
    if (!row) throw new Error("Reference is not linked to this project");
    if (projectUsesCitationAlias(this.#projectFiles(), row.citation_alias)) {
      throw new Error("Remove citations using this alias before unlinking the reference");
    }
    const next = rows.filter((item) => item.reference_id !== referenceId).map(projectReferenceFromRow);
    this.#replaceBibliography(projectReferenceBibliography(next), "project-reference-unlink", {}, () => {
      this.ctx.storage.sql.exec("DELETE FROM project_references WHERE reference_id = ?", referenceId);
    });
    return this.getSnapshot(workspaceId);
  }

  pinResearchShare(workspaceId: string, share: ResearchShareSnapshot): WorkspaceSnapshot {
    if (share.projectId !== workspaceId || share.revokedAt !== null) throw new Error("Research share is not active for this project");
    const existing = this.ctx.storage.sql
      .exec<ResearchShareRow>("SELECT * FROM project_research_shares WHERE id = ?", share.id)
      .toArray()[0];
    if (existing && existing.revoked_at === null) return this.getSnapshot(workspaceId);
    const previous = this.#workspaceRow();
    const persisted = this.#persistDocument(previous, {}, () => {
      this.ctx.storage.sql.exec(
        `INSERT INTO project_research_shares
         (id, project_id, reference_id, resource_id, kind, snapshot_json, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET snapshot_json = excluded.snapshot_json, created_at = excluded.created_at, revoked_at = NULL`,
        share.id,
        share.projectId,
        share.referenceId,
        share.resourceId,
        share.kind,
        JSON.stringify(share.content),
        share.createdAt,
      );
    });
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }));
    this.#broadcastResources();
    return this.getSnapshot(workspaceId);
  }

  revokeResearchShare(workspaceId: string, shareId: string, revokedAt: string): WorkspaceSnapshot {
    const row = this.ctx.storage.sql.exec<ResearchShareRow>("SELECT * FROM project_research_shares WHERE id = ?", shareId).toArray()[0];
    if (!row || row.project_id !== workspaceId) throw new Error("Research share not found");
    if (row.revoked_at) return this.getSnapshot(workspaceId);
    const previous = this.#workspaceRow();
    const persisted = this.#persistDocument(previous, {}, () => {
      this.ctx.storage.sql.exec("UPDATE project_research_shares SET revoked_at = ? WHERE id = ?", revokedAt, shareId);
    });
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }));
    this.#broadcastResources();
    return this.getSnapshot(workspaceId);
  }

  getActiveResearchShare(workspaceId: string, shareId: string): ResearchShareSnapshot {
    const share = this.#researchShares().find((item) => item.id === shareId && item.projectId === workspaceId);
    if (!share) throw new Error("Research share not found or revoked");
    return share;
  }

  createProjectFile(workspaceId: string, pathValue: string, content = ""): WorkspaceSnapshot {
    const path = normalizeProjectPath(pathValue);
    if (!path || path !== pathValue.trim() || !path.endsWith(".md") || path === projectEntryPath) {
      throw new Error("Project files require a unique relative .md path; main.md is reserved");
    }
    if (content.length > 2_000_000) throw new Error("Project file exceeds 2 MB");
    if (this.ctx.storage.sql.exec<ProjectFileRow>("SELECT * FROM project_files WHERE path = ?", path).toArray()[0]) {
      throw new Error("A project file already uses this path");
    }
    const id = crypto.randomUUID();
    const yTextName = `file:${id}`;
    const now = new Date().toISOString();
    const previous = this.#workspaceRow();
    const stateVector = Y.encodeStateVector(this.#document);
    const text = this.#document.getText(yTextName);
    if (content) text.insert(0, content);
    const persisted = this.#persistDocument(previous, {}, () => {
      this.ctx.storage.sql.exec(
        `INSERT INTO project_files (id, path, media_type, y_text_name, content, created_at, updated_at)
         VALUES (?, ?, 'text/markdown', ?, ?, ?, ?)`,
        id,
        path,
        yTextName,
        content,
        now,
        now,
      );
    });
    this.#broadcast(Y.encodeStateAsUpdate(this.#document, stateVector));
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }));
    this.#broadcastResources();
    return this.getSnapshot(workspaceId);
  }

  renameProjectFile(workspaceId: string, fileId: string, pathValue: string): WorkspaceSnapshot {
    const nextPath = normalizeProjectPath(pathValue);
    if (!nextPath || nextPath !== pathValue.trim() || !nextPath.endsWith(".md") || nextPath === projectEntryPath) {
      throw new Error("Supporting files require a unique relative .md path");
    }
    const workspace = this.#workspaceRow();
    if (workspace.entry_file_id === fileId) throw new Error("The main.md entry path cannot be renamed");
    const files = this.#projectFiles();
    const target = files.find((file) => file.id === fileId);
    if (!target) throw new Error("Project file not found");
    if (files.some((file) => file.id !== fileId && file.path === nextPath)) throw new Error("A project file already uses this path");

    const previous = workspace;
    const stateVector = Y.encodeStateVector(this.#document);
    const updates: Array<{ row: ProjectFileRow; content: string }> = [];
    for (const row of this.#projectFileRows()) {
      const current = projectFileFromRow(row);
      const content = rewriteInboundProjectIncludes(current, target.path, nextPath);
      if (content === current.content) continue;
      const text = this.#document.getText(row.y_text_name);
      const splice = calculateTextSplice(text.toString(), content);
      if (splice) {
        if (splice.deleteCount > 0) text.delete(splice.start, splice.deleteCount);
        if (splice.insert) text.insert(splice.start, splice.insert);
      }
      updates.push({ row, content });
    }
    const persisted = this.#persistDocument(previous, {}, () => {
      const now = new Date().toISOString();
      this.ctx.storage.sql.exec("UPDATE project_files SET path = ?, updated_at = ? WHERE id = ?", nextPath, now, fileId);
      for (const update of updates) {
        this.ctx.storage.sql.exec("UPDATE project_files SET content = ?, updated_at = ? WHERE id = ?", update.content, now, update.row.id);
      }
    });
    this.#broadcast(Y.encodeStateAsUpdate(this.#document, stateVector));
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }));
    this.#broadcastResources();
    return this.getSnapshot(workspaceId);
  }

  deleteProjectFile(workspaceId: string, fileId: string): WorkspaceSnapshot {
    const workspace = this.#workspaceRow();
    if (workspace.entry_file_id === fileId) throw new Error("The main.md entry file cannot be deleted");
    const files = this.#projectFiles();
    const target = files.find((file) => file.id === fileId);
    if (!target) throw new Error("Project file not found");
    const inbound = inboundProjectIncludes(files, target.path);
    if (inbound.length > 0) throw new Error(`Remove ${inbound.length} inbound include directive(s) before deleting this file`);
    const persisted = this.#persistDocument(workspace, {}, () => {
      this.ctx.storage.sql.exec("DELETE FROM project_files WHERE id = ?", fileId);
    });
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }));
    this.#broadcastResources();
    return this.getSnapshot(workspaceId);
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

  previewPublicationIntake(pdfId: string, metadata: PublicationEnrichment, metadataFingerprint: string): PublicationIntakePreview {
    this.#assertPdfExists(pdfId);
    const matches = this.#publicationRowsByDoi(metadata.doi);
    if (matches.length > 1) throw new Error("Publication DOI is ambiguous in this workspace");
    const existing = matches[0];
    const reservedKeys = this.ctx.storage.sql
      .exec<{ citation_key: string }>("SELECT citation_key FROM publications ORDER BY citation_key")
      .toArray()
      .map((row) => row.citation_key);
    return {
      pdfId,
      doi: normalizeDoi(metadata.doi),
      metadata,
      metadataFingerprint,
      citationKey: existing?.citation_key ?? suggestCitationKey(metadata, reservedKeys),
      existingPublicationId: existing?.id ?? null,
    };
  }

  acceptPublicationIntake(pdfId: string, citationKey: string, metadata: PublicationEnrichment): PublicationIntakeResult {
    const doi = normalizeDoi(metadata.doi);
    const matches = this.#publicationRowsByDoi(doi);
    if (matches.length > 1) throw new Error("Publication DOI is ambiguous in this workspace");
    const existing = matches[0];

    if (existing) {
      let linkWrite: PublicationPdfLinkWrite | undefined;
      this.ctx.storage.transactionSync(() => {
        this.#assertPdfExists(pdfId);
        linkWrite = this.#ensurePublicationPdfLink(existing.id, pdfId);
      });
      if (!linkWrite) throw new Error("Publication intake could not be completed");
      if (linkWrite.created) this.#broadcastResources();
      return {
        publication: publicationFromRow(existing),
        link: linkWrite.link,
        publicationCreated: false,
        linkCreated: linkWrite.created,
      };
    }

    if (!isValidCitationKey(citationKey)) throw new Error("Citation key is invalid");
    const collision = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM publications WHERE citation_key = ? COLLATE NOCASE", citationKey)
      .one();
    if (collision.count > 0) throw new Error("Citation key already exists");
    this.#assertPdfExists(pdfId);

    const entry = publicationIntakeEntry(citationKey, metadata);
    const projection = projectBibTeXPublication(entry);
    const publicationId = crypto.randomUUID();
    const currentBibliography = this.#workspaceRow().bibliography;
    const nextBibliography = appendBibTeXEntry(currentBibliography, entry);
    let linkWrite: PublicationPdfLinkWrite | undefined;
    this.#replaceBibliography(nextBibliography, "doi-publication-intake", { acceptedCrossref: { projection, publicationId } }, () => {
      const publication = this.ctx.storage.sql
        .exec<{ count: number }>("SELECT COUNT(*) AS count FROM publications WHERE id = ?", publicationId)
        .one();
      if (publication.count === 0) throw new Error("Publication intake projection failed");
      this.#assertPdfExists(pdfId);
      linkWrite = this.#ensurePublicationPdfLink(publicationId, pdfId);
    });
    if (!linkWrite) throw new Error("Publication intake could not be completed");
    return {
      publication: this.getPublication(publicationId),
      link: linkWrite.link,
      publicationCreated: true,
      linkCreated: linkWrite.created,
    };
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
      const projectReference = this.ctx.storage.sql
        .exec<{ count: number }>("SELECT COUNT(*) AS count FROM project_references WHERE reference_id = ?", link.publicationId)
        .one();
      if (publication.count === 0 && projectReference.count === 0) throw new Error("Publication not found");
      const pdf = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM pdfs WHERE id = ?", link.pdfId).one();
      if (pdf.count === 0) throw new Error("PDF not found");
      const table = projectReference.count > 0 ? "project_reference_pdf_links" : "publication_pdf_links";
      const existing = this.ctx.storage.sql
        .exec<{
          count: number;
        }>(`SELECT COUNT(*) AS count FROM ${table} WHERE publication_id = ? AND pdf_id = ?`, link.publicationId, link.pdfId)
        .one();
      if (existing.count > 0) throw new Error("Publication/PDF link already exists");
      this.ctx.storage.sql.exec(
        `INSERT INTO ${table} (id, publication_id, pdf_id, created_at) VALUES (?, ?, ?, ?)`,
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
    const legacy = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM publication_pdf_links WHERE id = ?", linkId)
      .one();
    const shared = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM project_reference_pdf_links WHERE id = ?", linkId)
      .one();
    if (legacy.count + shared.count === 0) throw new Error("Publication/PDF link not found");
    this.ctx.storage.sql.exec("DELETE FROM publication_pdf_links WHERE id = ?", linkId);
    this.ctx.storage.sql.exec("DELETE FROM project_reference_pdf_links WHERE id = ?", linkId);
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

  createAnnotationLink(input: CreateAnnotationLinkInput): AnnotationLinkResult {
    const pdf = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM pdfs WHERE id = ?", input.annotation.pdfId)
      .one();
    if (pdf.count === 0) throw new Error("PDF not found");

    const workspace = this.#workspaceRow();
    const target = this.#projectText(input.passage.fileId);
    const source = target.text.toString();
    if (input.passage.sourceRevision !== workspace.revision) throw new Error("Document selection is stale");
    if (
      source !== target.file.content ||
      input.passage.end > source.length ||
      source.slice(input.passage.start, input.passage.end) !== input.passage.excerpt
    ) {
      throw new Error("Document selection is stale");
    }

    const createdAt = new Date().toISOString();
    const annotation: AnnotationResource = { id: crypto.randomUUID(), ...input.annotation, createdAt };
    const anchor = createManuscriptAnchor(
      this.#document,
      input.passage.start,
      input.passage.end,
      workspace.revision,
      target.file.id,
      target.text,
    );
    const link: PassageLink = {
      id: crypto.randomUUID(),
      annotationId: annotation.id,
      anchor: toManuscriptAnchorSelector(anchor),
      resolution: resolveManuscriptAnchor(this.#document, anchor),
      createdAt,
    };
    this.ctx.storage.transactionSync(() => {
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
      this.ctx.storage.sql.exec(
        `INSERT INTO passage_links
         (id, annotation_id, start_offset, end_offset, excerpt, anchor_version, relative_start, relative_end,
          quote_prefix, quote_suffix, anchored_revision, project_file_id, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        link.id,
        link.annotationId,
        input.passage.start,
        input.passage.end,
        input.passage.excerpt,
        anchor.relativeStart,
        anchor.relativeEnd,
        anchor.prefix,
        anchor.suffix,
        anchor.anchoredRevision,
        anchor.fileId,
        link.createdAt,
      );
    });
    this.#broadcastResources();
    return { annotation, link };
  }

  createPassageLink(input: CreatePassageLinkInput): PassageLink {
    const workspace = this.#workspaceRow();
    const target = this.#projectText(input.fileId);
    const source = target.text.toString();
    const annotation = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM annotations WHERE id = ?", input.annotationId)
      .one();
    if (annotation.count === 0) throw new Error("Annotation not found");
    if (input.sourceRevision !== workspace.revision) throw new Error("Document selection is stale");
    if (source !== target.file.content || input.end > source.length || source.slice(input.start, input.end) !== input.excerpt) {
      throw new Error("Document selection is stale");
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const anchor = createManuscriptAnchor(this.#document, input.start, input.end, workspace.revision, target.file.id, target.text);
    this.ctx.storage.sql.exec(
      `INSERT INTO passage_links
       (id, annotation_id, start_offset, end_offset, excerpt, anchor_version, relative_start, relative_end,
        quote_prefix, quote_suffix, anchored_revision, project_file_id, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
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
      anchor.fileId,
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
    const target = this.#projectText(input.fileId);
    const source = target.text.toString();
    this.#claim(input.claimId);
    if (input.sourceRevision !== workspace.revision) throw new Error("Document selection is stale");
    if (source !== target.file.content || input.end > source.length || source.slice(input.start, input.end) !== input.excerpt) {
      throw new Error("Document selection is stale");
    }
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const anchor = createManuscriptAnchor(this.#document, input.start, input.end, workspace.revision, target.file.id, target.text);
    this.ctx.storage.sql.exec(
      `INSERT INTO claim_passage_links
       (id, claim_id, start_offset, end_offset, excerpt, anchor_version, relative_start, relative_end,
        quote_prefix, quote_suffix, anchored_revision, project_file_id, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
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
      anchor.fileId,
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
    if (!isCreateCandidateInput(input)) throw new Error("Model candidate input is invalid");
    const workspace = this.#workspaceRow();
    const target = this.#projectText(input.target.fileId);
    const sourceValue = target.text.toString();
    if (input.target.sourceRevision !== workspace.revision) {
      throw new Error("Candidate source is stale; generate a new revision");
    }
    if (
      sourceValue !== target.file.content ||
      input.target.end > sourceValue.length ||
      sourceValue.slice(input.target.start, input.target.end) !== input.target.excerpt
    ) {
      throw new Error("Candidate source is stale; generate a new revision");
    }

    const evidence = this.#captureModelEvidence(input.evidence);
    const anchor = createManuscriptAnchor(
      this.#document,
      input.target.start,
      input.target.end,
      workspace.revision,
      target.file.id,
      target.text,
    );
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO candidates
       (id, operation, prompt_version, provider_adapter, provider_label, model, instruction, source_revision,
        start_offset, end_offset, excerpt, anchor_version, relative_start, relative_end, quote_prefix, quote_suffix,
        anchored_revision, project_file_id, evidence_json, proposed_replacement, status, created_at)
       VALUES (?, 'revise-selection', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      id,
      input.promptVersion,
      input.providerAdapter,
      input.providerLabel,
      input.model,
      input.instruction,
      workspace.revision,
      input.target.start,
      input.target.end,
      input.target.excerpt,
      anchor.relativeStart,
      anchor.relativeEnd,
      anchor.prefix,
      anchor.suffix,
      anchor.anchoredRevision,
      anchor.fileId,
      JSON.stringify(evidence),
      input.proposedReplacement,
      createdAt,
    );
    this.#broadcastResources();
    return this.#candidate(id);
  }

  applyCandidate(workspaceId: string, candidateId: string): ApplyCandidateResult {
    const candidate = this.#candidate(candidateId);
    const workspace = this.#workspaceRow();
    if (candidate.status !== "pending") return { ok: false, error: "Candidate is no longer pending" };
    if (candidate.sourceRevision !== workspace.revision) return { ok: false, error: "Candidate is stale; generate a new revision" };

    const target = this.#projectText(candidate.target.anchor.fileId);
    const source = target.text;
    const resolution = resolveManuscriptAnchor(this.#document, candidate.target.anchor);
    if (resolution.status !== "resolved" || !resolution.exactMatch) {
      return { ok: false, error: "Candidate target is stale; generate a new revision" };
    }
    const splice = calculateTextSplice(candidate.target.anchor.exact, candidate.proposedReplacement);
    const stateVector = splice ? Y.encodeStateVector(this.#document) : undefined;
    if (splice) {
      this.#document.transact(() => {
        const start = resolution.start + splice.start;
        if (splice.deleteCount > 0) source.delete(start, splice.deleteCount);
        if (splice.insert) source.insert(start, splice.insert);
      }, "candidate");
    }
    let revision: number | undefined;
    if (splice) {
      revision = this.#persistDocument(workspace, {}, () => {
        this.ctx.storage.sql.exec("UPDATE candidates SET status = 'accepted' WHERE id = ?", candidateId);
      }).revision;
    } else {
      this.ctx.storage.sql.exec("UPDATE candidates SET status = 'accepted' WHERE id = ?", candidateId);
    }
    if (revision !== undefined && stateVector) {
      this.#broadcast(Y.encodeStateAsUpdate(this.#document, stateVector));
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
    const files = this.#projectFiles();
    if (!workspace.entry_file_id) throw new Error("Project entry file is not initialized");
    const source = composeProject(files, workspace.entry_file_id).content;
    const references = this.#projectReferences();
    const bibliography =
      references.length === 0
        ? workspace.bibliography
        : projectReferenceBibliography(references.filter((link) => citedAliases(source).has(link.citationAlias)));
    return { source, bibliography };
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
      {
        version: 8,
        name: "replace-whole-document-candidates",
        apply(sql): undefined {
          sql.exec(`
            DROP TABLE IF EXISTS candidates;
            CREATE TABLE candidates (
              id TEXT PRIMARY KEY,
              operation TEXT NOT NULL CHECK (operation = 'revise-selection'),
              prompt_version TEXT NOT NULL CHECK (prompt_version = 'revise-selection-v1'),
              provider_adapter TEXT NOT NULL CHECK (provider_adapter = 'openai-compatible'),
              provider_label TEXT NOT NULL,
              model TEXT NOT NULL,
              instruction TEXT NOT NULL,
              source_revision INTEGER NOT NULL,
              start_offset INTEGER NOT NULL,
              end_offset INTEGER NOT NULL,
              excerpt TEXT NOT NULL,
              anchor_version INTEGER NOT NULL CHECK (anchor_version = 1),
              relative_start BLOB NOT NULL,
              relative_end BLOB NOT NULL,
              quote_prefix TEXT NOT NULL,
              quote_suffix TEXT NOT NULL,
              anchored_revision INTEGER NOT NULL,
              evidence_json TEXT NOT NULL,
              proposed_replacement TEXT NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
              created_at TEXT NOT NULL
            );
          `);
          return undefined;
        },
      },
      {
        version: 9,
        name: "compose-project-from-main",
        apply: (): undefined => {
          const columns = this.ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(workspace)").toArray();
          if (!columns.some((column) => column.name === "entry_file_id")) {
            this.ctx.storage.sql.exec("ALTER TABLE workspace ADD COLUMN entry_file_id TEXT");
          }
          this.ctx.storage.sql.exec(`
            CREATE TABLE IF NOT EXISTS project_files (
              id TEXT PRIMARY KEY,
              path TEXT NOT NULL UNIQUE,
              media_type TEXT NOT NULL CHECK (media_type = 'text/markdown'),
              y_text_name TEXT NOT NULL UNIQUE,
              content TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
          `);
          const workspace = this.#workspaceRow();
          if (!workspace.entry_file_id) {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            this.ctx.storage.sql.exec(
              `INSERT INTO project_files (id, path, media_type, y_text_name, content, created_at, updated_at)
               VALUES (?, ?, 'text/markdown', 'source', ?, ?, ?)`,
              id,
              projectEntryPath,
              workspace.source,
              now,
              now,
            );
            this.ctx.storage.sql.exec("UPDATE workspace SET entry_file_id = ? WHERE id = 1", id);
          }
          return undefined;
        },
      },
      {
        version: 10,
        name: "qualify-manuscript-anchors-by-file",
        apply: (): undefined => {
          const entryFileId = this.#workspaceRow().entry_file_id;
          if (!entryFileId) throw new Error("Project entry file is not initialized");
          for (const table of ["passage_links", "claim_passage_links", "candidates"] as const) {
            const columns = this.ctx.storage.sql.exec<{ name: string }>(`PRAGMA table_info(${table})`).toArray();
            if (!columns.some((column) => column.name === "project_file_id")) {
              this.ctx.storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN project_file_id TEXT`);
            }
            this.ctx.storage.sql.exec(`UPDATE ${table} SET project_file_id = ? WHERE project_file_id IS NULL`, entryFileId);
          }
          return undefined;
        },
      },
      {
        version: 11,
        name: "link-shared-library-references",
        apply(sql): undefined {
          sql.exec(`
            CREATE TABLE IF NOT EXISTS project_references (
              id TEXT PRIMARY KEY,
              reference_id TEXT NOT NULL UNIQUE,
              citation_alias TEXT NOT NULL UNIQUE COLLATE NOCASE,
              snapshot_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
          `);
          return undefined;
        },
      },
      {
        version: 12,
        name: "pin-explicit-private-research-shares",
        apply(sql): undefined {
          sql.exec(`
            CREATE TABLE IF NOT EXISTS project_research_shares (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              reference_id TEXT NOT NULL,
              resource_id TEXT NOT NULL,
              kind TEXT NOT NULL CHECK (kind IN ('artifact', 'note', 'highlight')),
              snapshot_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              revoked_at TEXT
            );
            CREATE INDEX IF NOT EXISTS project_research_shares_reference ON project_research_shares(reference_id);
          `);
          return undefined;
        },
      },
      {
        version: 13,
        name: "retain-legacy-project-pdf-links",
        apply(sql): undefined {
          sql.exec(`
            CREATE TABLE IF NOT EXISTS project_reference_pdf_links (
              id TEXT PRIMARY KEY,
              publication_id TEXT NOT NULL,
              pdf_id TEXT NOT NULL REFERENCES pdfs(id),
              created_at TEXT NOT NULL,
              UNIQUE (publication_id, pdf_id)
            );
          `);
          return undefined;
        },
      },
      {
        version: 14,
        name: "pin-shared-web-snapshots",
        apply(sql): undefined {
          sql.exec(`
            DROP INDEX IF EXISTS project_research_shares_reference;
            ALTER TABLE project_research_shares RENAME TO project_research_shares_v13;
            CREATE TABLE project_research_shares (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              reference_id TEXT NOT NULL,
              resource_id TEXT NOT NULL,
              kind TEXT NOT NULL CHECK (kind IN ('artifact', 'note', 'highlight', 'web-snapshot')),
              snapshot_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              revoked_at TEXT
            );
            INSERT INTO project_research_shares SELECT * FROM project_research_shares_v13;
            DROP TABLE project_research_shares_v13;
            CREATE INDEX project_research_shares_reference ON project_research_shares(reference_id);
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
            fileId: "main",
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

  #persistDocument(previous: WorkspaceRow, options: ProjectionOptions = {}, relatedWrite?: () => void): PersistedDocumentUpdate {
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
        for (const file of this.#projectFileRows()) {
          const content = this.#document.getText(file.y_text_name).toString();
          if (content !== file.content) {
            this.ctx.storage.sql.exec(
              "UPDATE project_files SET content = ?, updated_at = ? WHERE id = ?",
              content,
              new Date().toISOString(),
              file.id,
            );
          }
        }
        if (bibliography !== previous.bibliography || options.acceptedCrossref) {
          resourcesChanged = this.#reconcileBibliography(bibliography, options);
        }
        relatedWrite?.();
      });
    } catch (error) {
      this.#restoreDocument(previous.y_state);
      throw error;
    }
    return { resourcesChanged, revision };
  }

  #projectFileRows(): ProjectFileRow[] {
    return this.ctx.storage.sql.exec<ProjectFileRow>("SELECT * FROM project_files ORDER BY path COLLATE NOCASE, id").toArray();
  }

  #projectFiles(): ProjectFile[] {
    return this.#projectFileRows().map(projectFileFromRow);
  }

  #projectText(fileId: string): { file: ProjectFile; text: Y.Text } {
    const row = this.#projectFileRows().find((file) => file.id === fileId);
    if (!row) throw new Error("Project file not found");
    return { file: projectFileFromRow(row), text: this.#document.getText(row.y_text_name) };
  }

  #projectReferenceRows(): ProjectReferenceRow[] {
    return this.ctx.storage.sql
      .exec<ProjectReferenceRow>("SELECT * FROM project_references ORDER BY citation_alias COLLATE NOCASE, id")
      .toArray();
  }

  #projectReferences(): ProjectReferenceLink[] {
    return this.#projectReferenceRows().map(projectReferenceFromRow);
  }

  #researchShares(): ResearchShareSnapshot[] {
    return this.ctx.storage.sql
      .exec<ResearchShareRow>("SELECT * FROM project_research_shares WHERE revoked_at IS NULL ORDER BY created_at, id")
      .toArray()
      .map(researchShareFromRow);
  }

  #replaceBibliography(sourceValue: string, origin: string, options: ProjectionOptions = {}, relatedWrite?: () => void): void {
    const bibliography = this.#document.getText("bibliography");
    const splice = calculateTextSplice(bibliography.toString(), sourceValue);
    if (!splice) {
      let resourcesChanged = false;
      this.ctx.storage.transactionSync(() => {
        resourcesChanged = this.#reconcileBibliography(sourceValue, options);
        relatedWrite?.();
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
    const persisted = this.#persistDocument(previous, options, relatedWrite);
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
        const accepted = options.acceptedCrossref;
        const acceptedCrossref = accepted !== undefined && bibTeXPublicationProjectionsEqual(projection, accepted.projection);
        const id = acceptedCrossref ? accepted.publicationId : crypto.randomUUID();
        this.ctx.storage.sql.exec(
          `INSERT INTO publications
           (id, citation_key, entry_type, title, authors_json, publication_year, venue, doi, url, abstract,
            metadata_source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          acceptedCrossref ? "crossref" : "bibtex",
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

  #publicationRowsByDoi(value: string): PublicationRow[] {
    const doi = normalizeDoi(value);
    return doi
      ? this.ctx.storage.sql
          .exec<PublicationRow>("SELECT * FROM publications WHERE doi = ? ORDER BY created_at ASC, id ASC LIMIT 2", doi)
          .toArray()
      : [];
  }

  #assertPdfExists(pdfId: string): void {
    const pdf = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM pdfs WHERE id = ?", pdfId).one();
    if (pdf.count === 0) throw new Error("PDF not found");
  }

  #ensurePublicationPdfLink(publicationId: string, pdfId: string): PublicationPdfLinkWrite {
    const existing = this.ctx.storage.sql
      .exec<PublicationPdfLinkRow>("SELECT * FROM publication_pdf_links WHERE publication_id = ? AND pdf_id = ?", publicationId, pdfId)
      .toArray()[0];
    if (existing) return { created: false, link: publicationPdfLinkFromRow(existing) };
    const link: PublicationPdfLink = {
      id: crypto.randomUUID(),
      publicationId,
      pdfId,
      createdAt: new Date().toISOString(),
    };
    this.ctx.storage.sql.exec(
      "INSERT INTO publication_pdf_links (id, publication_id, pdf_id, created_at) VALUES (?, ?, ?, ?)",
      link.id,
      link.publicationId,
      link.pdfId,
      link.createdAt,
    );
    return { created: true, link };
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
    const legacy = this.ctx.storage.sql
      .exec<PublicationPdfLinkRow>("SELECT * FROM publication_pdf_links ORDER BY created_at DESC, id ASC")
      .toArray()
      .map(publicationPdfLinkFromRow);
    const shared = this.ctx.storage.sql
      .exec<PublicationPdfLinkRow>("SELECT * FROM project_reference_pdf_links ORDER BY created_at DESC, id ASC")
      .toArray()
      .map(publicationPdfLinkFromRow);
    return [...legacy, ...shared].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
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

  #captureModelEvidence(references: readonly ModelEvidenceReference[]): ModelEvidence[] {
    const evidence: ModelEvidence[] = [];
    let contentLength = 0;
    for (const reference of references) {
      if (reference.kind === "annotation") {
        const row = this.ctx.storage.sql.exec<AnnotationRow>("SELECT * FROM annotations WHERE id = ?", reference.id).toArray()[0];
        if (!row) throw new Error("Model evidence annotation not found");
        if (row.created_at !== reference.version) throw new Error("Model evidence is stale; generate a new revision");
        const snapshot: ModelEvidence = {
          kind: "annotation",
          id: row.id,
          version: row.created_at,
          pdfId: row.pdf_id,
          page: row.page,
          quote: row.quote,
          prefix: row.prefix,
          suffix: row.suffix,
          comment: row.comment,
          rects: parseSelectionRects(row.rects_json),
          createdAt: row.created_at,
        };
        contentLength += snapshot.quote.length + snapshot.prefix.length + snapshot.suffix.length + snapshot.comment.length;
        evidence.push(snapshot);
        continue;
      }

      const row = this.ctx.storage.sql.exec<ClaimRow>("SELECT * FROM claims WHERE id = ?", reference.id).toArray()[0];
      if (!row) throw new Error("Model evidence claim not found");
      if (row.updated_at !== reference.version) throw new Error("Model evidence is stale; generate a new revision");
      const snapshot: ModelEvidence = {
        kind: "claim",
        id: row.id,
        version: row.updated_at,
        text: row.text,
        note: row.note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      contentLength += snapshot.text.length + snapshot.note.length;
      evidence.push(snapshot);
    }
    if (contentLength > 64 * 1_024) throw new Error("Model evidence exceeds the operation limit");
    return evidence;
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
      .map((row) => candidateFromRow(this.#document, row));
  }

  #candidate(candidateId: string): ModelCandidate {
    const rows = this.ctx.storage.sql.exec<CandidateRow>("SELECT * FROM candidates WHERE id = ?", candidateId).toArray();
    const row = rows[0];
    if (!row) throw new Error("Candidate not found");
    return candidateFromRow(this.#document, row);
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

function manuscriptAnchorFromRow(row: LinkRow | ClaimLinkRow | CandidateRow): StoredManuscriptAnchor {
  return {
    version: 1,
    fileId: row.project_file_id,
    relativeStart: row.anchor_version === 1 ? row.relative_start : null,
    relativeEnd: row.anchor_version === 1 ? row.relative_end : null,
    exact: row.excerpt,
    prefix: row.quote_prefix,
    suffix: row.quote_suffix,
    originalRange: { start: row.start_offset, end: row.end_offset },
    anchoredRevision: row.anchored_revision ?? 0,
  };
}

function candidateFromRow(document: Y.Doc, row: CandidateRow): ModelCandidate {
  const anchor = manuscriptAnchorFromRow(row);
  const candidate: unknown = {
    id: row.id,
    operation: row.operation,
    promptVersion: row.prompt_version,
    providerAdapter: row.provider_adapter,
    providerLabel: row.provider_label,
    model: row.model,
    instruction: row.instruction,
    sourceRevision: row.source_revision,
    target: {
      anchor: toManuscriptAnchorSelector(anchor),
      resolution: resolveManuscriptAnchor(document, anchor),
    },
    evidence: parseJson(row.evidence_json),
    proposedReplacement: row.proposed_replacement,
    status: row.status === "accepted" || row.status === "rejected" ? row.status : "pending",
    createdAt: row.created_at,
  };
  if (!isModelCandidate(candidate)) throw new Error("Stored model candidate is invalid");
  return candidate;
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

function projectFileFromRow(row: ProjectFileRow): ProjectFile {
  if (row.media_type !== "text/markdown") throw new Error("Stored project file has an unsupported media type");
  return {
    id: row.id,
    path: row.path,
    mediaType: "text/markdown",
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function projectReferenceFromRow(row: ProjectReferenceRow): ProjectReferenceLink {
  const snapshot = parseBibliographicSnapshot(row.snapshot_json);
  if (snapshot.referenceId !== row.reference_id) throw new Error("Stored project reference snapshot has the wrong identity");
  return {
    id: row.id,
    referenceId: row.reference_id,
    citationAlias: row.citation_alias,
    snapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function projectReferencePublication(link: ProjectReferenceLink): PublicationResource {
  return {
    id: link.referenceId,
    citationKey: link.citationAlias,
    type: link.snapshot.type,
    title: link.snapshot.title,
    authors: [...link.snapshot.authors],
    year: link.snapshot.year,
    venue: link.snapshot.venue,
    doi: link.snapshot.doi,
    url: link.snapshot.url,
    abstract: "",
    metadataSource: "bibtex",
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

function projectReferenceBibliography(links: readonly ProjectReferenceLink[]): string {
  return serializeBibTeX(
    links.map((link) => {
      const fields: Record<string, string> = { title: link.snapshot.title };
      if (link.snapshot.authors.length > 0) fields.author = link.snapshot.authors.join(" and ");
      if (link.snapshot.year) fields.year = link.snapshot.year;
      if (link.snapshot.venue) fields[link.snapshot.type === "article" ? "journal" : "publisher"] = link.snapshot.venue;
      if (link.snapshot.doi) fields.doi = link.snapshot.doi;
      if (link.snapshot.url) fields.url = link.snapshot.url;
      if (link.snapshot.webSnapshot) fields.urldate = link.snapshot.webSnapshot.accessedAt.slice(0, 10);
      return { type: link.snapshot.type, citationKey: link.citationAlias, fields };
    }),
  );
}

function citedAliases(source: string): Set<string> {
  const aliases = new Set<string>();
  for (const match of source.matchAll(/:cite\[(?<keys>[^\]\r\n]+)\]/gu)) {
    for (const key of (match.groups?.keys ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean))
      aliases.add(key);
  }
  return aliases;
}

function parseBibliographicSnapshot(value: string): BibliographicSnapshot {
  const parsed = parseJson(value);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    !("referenceId" in parsed) ||
    !("type" in parsed) ||
    !("title" in parsed) ||
    !("authors" in parsed) ||
    !("year" in parsed) ||
    !("venue" in parsed) ||
    !("doi" in parsed) ||
    !("url" in parsed) ||
    !("capturedAt" in parsed) ||
    !("tombstone" in parsed) ||
    typeof parsed.referenceId !== "string" ||
    typeof parsed.type !== "string" ||
    typeof parsed.title !== "string" ||
    !Array.isArray(parsed.authors) ||
    !parsed.authors.every((author) => typeof author === "string") ||
    typeof parsed.year !== "string" ||
    typeof parsed.venue !== "string" ||
    typeof parsed.doi !== "string" ||
    typeof parsed.url !== "string" ||
    typeof parsed.capturedAt !== "string" ||
    typeof parsed.tombstone !== "boolean"
  ) {
    throw new Error("Stored project reference snapshot is invalid");
  }
  const webSnapshot = "webSnapshot" in parsed ? parseWebCitationSnapshot(parsed.webSnapshot) : null;
  return {
    referenceId: parsed.referenceId,
    type: parsed.type,
    title: parsed.title,
    authors: parsed.authors,
    year: parsed.year,
    venue: parsed.venue,
    doi: parsed.doi,
    url: parsed.url,
    capturedAt: parsed.capturedAt,
    tombstone: parsed.tombstone,
    webSnapshot,
  };
}

function parseWebCitationSnapshot(value: unknown): BibliographicSnapshot["webSnapshot"] {
  if (value === null || value === undefined) return null;
  if (
    !isRecordValue(value) ||
    typeof value.id !== "string" ||
    typeof value.accessedAt !== "string" ||
    typeof value.finalUrl !== "string" ||
    typeof value.contentHash !== "string" ||
    typeof value.complete !== "boolean" ||
    !Array.isArray(value.diagnostics) ||
    !value.diagnostics.every((diagnostic) => typeof diagnostic === "string")
  ) {
    throw new Error("Stored project web citation snapshot is invalid");
  }
  return {
    id: value.id,
    accessedAt: value.accessedAt,
    finalUrl: value.finalUrl,
    contentHash: value.contentHash,
    complete: value.complete,
    diagnostics: value.diagnostics,
  };
}

function researchShareFromRow(row: ResearchShareRow): ResearchShareSnapshot {
  const content = parseJson(row.snapshot_json);
  if (row.kind === "artifact" && isRecordValue(content) && content.kind === "artifact") {
    if (
      typeof content.name !== "string" ||
      typeof content.size !== "number" ||
      typeof content.fingerprint !== "string" ||
      typeof content.objectKey !== "string"
    ) {
      throw new Error("Stored project research share is invalid");
    }
    return {
      id: row.id,
      projectId: row.project_id,
      referenceId: row.reference_id,
      resourceId: row.resource_id,
      kind: "artifact",
      content: { kind: "artifact", name: content.name, size: content.size, fingerprint: content.fingerprint, objectKey: content.objectKey },
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    };
  }
  if (row.kind === "note" && isRecordValue(content) && content.kind === "note" && typeof content.body === "string") {
    return {
      id: row.id,
      projectId: row.project_id,
      referenceId: row.reference_id,
      resourceId: row.resource_id,
      kind: "note",
      content: { kind: "note", body: content.body },
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    };
  }
  if (
    row.kind === "highlight" &&
    isRecordValue(content) &&
    content.kind === "highlight" &&
    typeof content.page === "number" &&
    typeof content.quote === "string" &&
    typeof content.comment === "string"
  ) {
    return {
      id: row.id,
      projectId: row.project_id,
      referenceId: row.reference_id,
      resourceId: row.resource_id,
      kind: "highlight",
      content: { kind: "highlight", page: content.page, quote: content.quote, comment: content.comment },
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    };
  }
  if (
    row.kind === "web-snapshot" &&
    isRecordValue(content) &&
    content.kind === "web-snapshot" &&
    typeof content.snapshotId === "string" &&
    typeof content.accessedAt === "string" &&
    typeof content.finalUrl === "string" &&
    typeof content.contentHash === "string" &&
    (content.rawObjectKey === null || typeof content.rawObjectKey === "string") &&
    (content.readableObjectKey === null || typeof content.readableObjectKey === "string") &&
    typeof content.complete === "boolean" &&
    Array.isArray(content.diagnostics) &&
    content.diagnostics.every((diagnostic) => typeof diagnostic === "string")
  ) {
    return {
      id: row.id,
      projectId: row.project_id,
      referenceId: row.reference_id,
      resourceId: row.resource_id,
      kind: "web-snapshot",
      content: {
        kind: "web-snapshot",
        snapshotId: content.snapshotId,
        accessedAt: content.accessedAt,
        finalUrl: content.finalUrl,
        contentHash: content.contentHash,
        rawObjectKey: content.rawObjectKey,
        readableObjectKey: content.readableObjectKey,
        complete: content.complete,
        diagnostics: content.diagnostics,
      },
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    };
  }
  throw new Error("Stored project research share is invalid");
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicationPdfLinkFromRow(row: PublicationPdfLinkRow): PublicationPdfLink {
  return {
    id: row.id,
    publicationId: row.publication_id,
    pdfId: row.pdf_id,
    createdAt: row.created_at,
  };
}

function publicationIntakeEntry(citationKey: string, metadata: PublicationEnrichment): BibTeXEntry {
  const fields: Record<string, string> = { title: metadata.title, doi: normalizeDoi(metadata.doi) };
  if (metadata.authors.length > 0) fields.author = metadata.authors.join(" and ");
  if (metadata.year) fields.year = metadata.year;
  if (metadata.venue) fields.journal = metadata.venue;
  if (metadata.url) fields.url = metadata.url;
  if (metadata.abstract) fields.abstract = metadata.abstract;
  return { type: metadata.type ?? "misc", citationKey, fields };
}

function appendBibTeXEntry(source: string, entry: BibTeXEntry): string {
  const serialized = serializeBibTeX([entry]);
  return source.trim().length === 0 ? serialized : `${source.trimEnd()}\n\n${serialized}`;
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
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

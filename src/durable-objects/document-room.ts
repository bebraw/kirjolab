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
import {
  applyYjsUpdateOnce,
  encodeServerCollaborationMessage,
  parseClientSelectionMessage,
  parseServerCollaborationMessage,
} from "../domain/collaboration";
import {
  createManuscriptAnchor,
  resolveManuscriptAnchor,
  toManuscriptAnchorSelector,
  type StoredManuscriptAnchor,
} from "../domain/manuscript-anchor";
import {
  compareProjectRevisions,
  type ProjectMilestone,
  type ProjectRevisionContent,
  type ProjectRevisionDiff,
  type ProjectRevisionSummary,
} from "../domain/project-history";
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
  defaultTransclusionPath,
  defaultTransclusionSource,
  isCreateCandidateInput,
  isModelCandidate,
  isProjectPublicationProfile,
  defaultProjectPublicationProfile,
  type ApplyCandidateResult,
  type AnnotationLinkResult,
  type AnnotationFragment,
  type AnnotationResource,
  type AddAnnotationFragmentInput,
  type ClaimEvidenceInput,
  type ClaimEvidenceLink,
  type ClaimEvidenceRelation,
  type ClaimPassageLink,
  type ClaimResource,
  type CreateAnnotationInput,
  type CreateAnnotationLinkInput,
  type UpdateAnnotationInput,
  type UpdateAnnotationFragmentInput,
  type CreateCandidateInput,
  type CreateClaimPassageLinkInput,
  type CreateManuscriptCommentInput,
  type CreatePassageLinkInput,
  type CreatePublicationPdfLinkInput,
  type ModelCandidate,
  type ModelEvidence,
  type ModelEvidenceReference,
  type PassageLink,
  type ManuscriptComment,
  type PdfResource,
  type PublicationEnrichment,
  type PublicationIntakePreview,
  type PublicationIntakeResult,
  type PublicationPdfLink,
  type PublicationResource,
  type ProjectReferenceLink,
  type ProjectPublicationProfile,
  type UpsertClaimInput,
  type WorkspaceSnapshot,
} from "../domain/workspace";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";
import { currentRecoveryBookmark } from "./recovery";

export type DocumentRoomOperationResult<Value, Code extends string> = { ok: true; value: Value } | { ok: false; code: Code; error: string };

export type ProjectFileReplaceResult = DocumentRoomOperationResult<
  WorkspaceSnapshot,
  "content-too-large" | "revision-conflict" | "file-not-found"
>;

export type ProjectReferenceUnlinkResult = DocumentRoomOperationResult<WorkspaceSnapshot, "reference-not-linked" | "citation-alias-in-use">;

export type ClaimUpdateResult = DocumentRoomOperationResult<ClaimResource, "claim-not-found" | "annotation-not-found">;

export type CandidateCreationResult = DocumentRoomOperationResult<
  ModelCandidate,
  "invalid-input" | "target-not-found" | "source-stale" | "evidence-not-found" | "evidence-stale" | "evidence-too-large"
>;

interface WorkspaceRow extends Record<string, SqlStorageValue> {
  title: string;
  y_state: ArrayBuffer;
  source: string;
  bibliography: string;
  revision: number;
  entry_file_id: string | null;
  settings_json: string;
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

interface ManuscriptCommentRow extends Record<string, SqlStorageValue> {
  id: string;
  author_id: string;
  author_label: string;
  body: string;
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
  status: string;
  created_at: string;
  updated_at: string;
}

interface PersistedDocumentUpdate {
  readonly resourcesChanged: boolean;
  readonly revision: number;
}

type CollaborationSocketAttachment =
  | { readonly mode: "writer"; readonly collaboratorId: string }
  | { readonly mode: "edit-presence"; readonly collaboratorId: string }
  | { readonly mode: "reader" };

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

interface ProjectRevisionRow extends Record<string, SqlStorageValue> {
  revision: number;
  reason: string;
  snapshot_json: string;
  created_at: string;
}

interface ProjectMilestoneRow extends Record<string, SqlStorageValue> {
  id: string;
  revision: number;
  name: string;
  description: string;
  created_at: string;
}

type StoredSqlValue = string | number | null | { readonly blob: string };
type StoredSqlRow = Readonly<Record<string, StoredSqlValue>>;

interface StoredProjectRevision {
  readonly version: 1;
  readonly workspace: {
    readonly title: string;
    readonly yState: string;
    readonly source: string;
    readonly bibliography: string;
    readonly entryFileId: string;
    readonly publicationProfile: ProjectPublicationProfile;
  };
  readonly tables: Readonly<Record<RevisionTable, readonly StoredSqlRow[]>>;
}

const revisionTables = [
  "pdfs",
  "annotations",
  "passage_links",
  "publications",
  "claims",
  "claim_evidence_links",
  "claim_passage_links",
  "manuscript_comments",
  "publication_pdf_links",
  "project_files",
  "project_references",
  "project_research_shares",
  "project_reference_pdf_links",
] as const;

type RevisionTable = (typeof revisionTables)[number];

const revisionTableColumns: Readonly<Record<RevisionTable, readonly string[]>> = {
  pdfs: ["id", "name", "content_type", "size", "object_key", "fingerprint", "created_at"],
  annotations: ["id", "pdf_id", "page", "quote", "prefix", "suffix", "comment", "rects_json", "created_at"],
  passage_links: [
    "id",
    "annotation_id",
    "start_offset",
    "end_offset",
    "excerpt",
    "anchor_version",
    "relative_start",
    "relative_end",
    "quote_prefix",
    "quote_suffix",
    "anchored_revision",
    "created_at",
    "project_file_id",
  ],
  publications: [
    "id",
    "citation_key",
    "entry_type",
    "title",
    "authors_json",
    "publication_year",
    "venue",
    "doi",
    "url",
    "abstract",
    "metadata_source",
    "created_at",
    "updated_at",
  ],
  claims: ["id", "text", "note", "created_at", "updated_at"],
  claim_evidence_links: ["id", "claim_id", "annotation_id", "relation", "created_at"],
  claim_passage_links: [
    "id",
    "claim_id",
    "start_offset",
    "end_offset",
    "excerpt",
    "anchor_version",
    "relative_start",
    "relative_end",
    "quote_prefix",
    "quote_suffix",
    "anchored_revision",
    "created_at",
    "project_file_id",
  ],
  manuscript_comments: [
    "id",
    "author_id",
    "author_label",
    "body",
    "start_offset",
    "end_offset",
    "excerpt",
    "anchor_version",
    "relative_start",
    "relative_end",
    "quote_prefix",
    "quote_suffix",
    "anchored_revision",
    "project_file_id",
    "status",
    "created_at",
    "updated_at",
  ],
  publication_pdf_links: ["id", "publication_id", "pdf_id", "created_at"],
  project_files: ["id", "path", "media_type", "y_text_name", "content", "created_at", "updated_at"],
  project_references: ["id", "reference_id", "citation_alias", "snapshot_json", "created_at", "updated_at"],
  project_research_shares: ["id", "project_id", "reference_id", "resource_id", "kind", "snapshot_json", "created_at", "revoked_at"],
  project_reference_pdf_links: ["id", "publication_id", "pdf_id", "created_at"],
};

const revisionDeleteOrder: readonly RevisionTable[] = [
  "manuscript_comments",
  "passage_links",
  "claim_passage_links",
  "claim_evidence_links",
  "publication_pdf_links",
  "project_reference_pdf_links",
  "project_research_shares",
  "project_references",
  "claims",
  "annotations",
  "publications",
  "project_files",
  "pdfs",
];

const revisionInsertOrder: readonly RevisionTable[] = [
  "pdfs",
  "annotations",
  "publications",
  "claims",
  "project_files",
  "project_references",
  "project_research_shares",
  "publication_pdf_links",
  "project_reference_pdf_links",
  "claim_evidence_links",
  "passage_links",
  "claim_passage_links",
  "manuscript_comments",
];

export class DocumentRoom extends DurableObject<Env> {
  #document = new Y.Doc();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec("PRAGMA foreign_keys = ON");
      runSQLiteMigrations(this.ctx.storage, this.#schemaMigrations());
      this.#loadDocument();
      runSQLiteMigrations(this.ctx.storage, this.#dataMigrations());
      this.#ensureInitialRevision();
    });
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "WebSocket upgrade required" }, { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const readOnly = request.headers.get("x-kirjolab-read-only") === "1";
    const editPresence = request.headers.get("x-kirjolab-edit-presence") === "1";
    server.serializeAttachment(
      readOnly
        ? ({ mode: "reader" } satisfies CollaborationSocketAttachment)
        : ({
            mode: editPresence ? "edit-presence" : "writer",
            collaboratorId: crypto.randomUUID(),
          } satisfies CollaborationSocketAttachment),
    );
    this.ctx.acceptWebSocket(server);
    if (readOnly) {
      sendWebSocketMessage(server, encodeServerCollaborationMessage({ type: "revision", revision: this.#workspaceRow().revision }));
    } else {
      if (!editPresence) sendWebSocketMessage(server, Y.encodeStateAsUpdate(this.#document));
      sendWebSocketMessage(
        server,
        encodeServerCollaborationMessage({ type: "sync", protocol: 1, revision: this.#workspaceRow().revision }),
      );
      this.#broadcastPresence();
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (collaborationSocketAttachment(socket)?.mode === "reader") {
      socket.close(1008, "Read-only project connections cannot send messages");
      return;
    }
    if (typeof message === "string") {
      const selection = parseClientSelectionMessage(message);
      if (!selection) {
        socket.close(1003, "Unsupported client collaboration metadata");
        return;
      }
      const workspace = this.#workspaceRow();
      if (selection.revision !== workspace.revision) return;
      const file = this.#projectFiles().find((candidate) => candidate.id === selection.fileId);
      if (!file || selection.end > file.content.length) {
        socket.close(1007, "Invalid collaborator selection");
        return;
      }
      const attachment = collaborationSocketAttachment(socket);
      if (!attachment || (attachment.mode !== "writer" && attachment.mode !== "edit-presence")) {
        socket.close(1011, "Collaboration identity is unavailable");
        return;
      }
      this.#broadcast(
        encodeServerCollaborationMessage({
          type: "selection",
          collaboratorId: attachment.collaboratorId,
          fileId: selection.fileId,
          start: selection.start,
          end: selection.end,
          revision: selection.revision,
        }),
        socket,
      );
      return;
    }

    if (collaborationSocketAttachment(socket)?.mode === "edit-presence") {
      socket.close(1008, "Edit links may send only collaborator selections");
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
      sendWebSocketMessage(socket, encodeServerCollaborationMessage({ type: "ack", revision: previous.revision }));
      return;
    }

    let persisted: PersistedDocumentUpdate;
    try {
      persisted = this.#persistDocument(previous);
    } catch {
      socket.close(1011, "Document update could not be persisted");
      return;
    }
    sendWebSocketMessage(socket, encodeServerCollaborationMessage({ type: "ack", revision: persisted.revision }));
    this.#broadcast(message, socket);
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }), socket);
    if (persisted.resourcesChanged) this.#broadcastResources();
  }

  override webSocketClose(socket: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    const attachment = collaborationSocketAttachment(socket);
    if (attachment?.mode === "writer" || attachment?.mode === "edit-presence") {
      this.#broadcast(encodeServerCollaborationMessage({ type: "selection-clear", collaboratorId: attachment.collaboratorId }), socket);
      this.#broadcastPresence();
    }
  }

  disconnectReadOnlySockets(): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (collaborationSocketAttachment(socket)?.mode === "reader") socket.close(1008, "Read-only link changed");
    }
  }

  disconnectEditPresenceSockets(): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (collaborationSocketAttachment(socket)?.mode === "edit-presence") socket.close(1008, "Edit link changed");
    }
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
      publicationProfile: parsePublicationProfile(workspace.settings_json),
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
      comments: this.#comments(),
      candidates: this.#candidates(),
    };
  }

  async getBackupSnapshot(workspaceId: string): Promise<{ snapshot: WorkspaceSnapshot; revisionSeed: string; bookmark: string | null }> {
    const snapshot = this.getSnapshot(workspaceId);
    const revisionSeed = this.getHeadRevisionSeed();
    return {
      snapshot,
      revisionSeed,
      bookmark: await currentRecoveryBookmark(this.ctx.storage, this.env.AUTH_MODE),
    };
  }

  listRevisions(): ProjectRevisionSummary[] {
    const milestones = this.#milestones();
    return this.ctx.storage.sql
      .exec<ProjectRevisionRow>("SELECT * FROM project_revisions ORDER BY revision DESC LIMIT 500")
      .toArray()
      .map((row) => {
        const state = parseStoredProjectRevision(row.snapshot_json);
        return {
          revision: row.revision,
          title: state.workspace.title,
          reason: row.reason,
          createdAt: row.created_at,
          fileCount: state.tables.project_files.length,
          milestones: milestones.filter((milestone) => milestone.revision === row.revision),
        };
      });
  }

  getRevision(revision: number): ProjectRevisionContent {
    const row = this.#revisionRow(revision);
    return projectRevisionContent(row.revision, parseStoredProjectRevision(row.snapshot_json));
  }

  compareRevisions(fromRevision: number, toRevision: number): ProjectRevisionDiff {
    return compareProjectRevisions(this.getRevision(fromRevision), this.getRevision(toRevision));
  }

  createMilestone(revision: number, nameValue: string, descriptionValue = ""): ProjectMilestone {
    const name = nameValue.trim();
    const description = descriptionValue.trim();
    if (!name || name.length > 120 || description.length > 2_000) throw new Error("Milestone name or description is invalid");
    this.#revisionRow(revision);
    const existing = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM project_milestones WHERE name = ? COLLATE NOCASE", name)
      .one();
    if (existing.count > 0) throw new Error("Milestone name already exists");
    const milestone: ProjectMilestone = {
      id: crypto.randomUUID(),
      revision,
      name,
      description,
      createdAt: new Date().toISOString(),
    };
    this.ctx.storage.sql.exec(
      "INSERT INTO project_milestones (id, revision, name, description, created_at) VALUES (?, ?, ?, ?, ?)",
      milestone.id,
      milestone.revision,
      milestone.name,
      milestone.description,
      milestone.createdAt,
    );
    this.#broadcastResources();
    return milestone;
  }

  restoreRevision(workspaceId: string, targetRevision: number): WorkspaceSnapshot {
    const target = parseStoredProjectRevision(this.#revisionRow(targetRevision).snapshot_json);
    const current = this.#workspaceRow();
    const nextRevision = current.revision + 1;
    const previousState = current.y_state;
    const targetState = decodeBase64(target.workspace.yState);
    this.#restoreDocument(targetState);
    try {
      this.ctx.storage.transactionSync(() => {
        this.#replaceRevisionTables(target);
        this.ctx.storage.sql.exec("DELETE FROM candidates");
        this.ctx.storage.sql.exec(
          `UPDATE workspace
           SET title = ?, y_state = ?, source = ?, bibliography = ?, revision = ?, entry_file_id = ?, settings_json = ?
           WHERE id = 1`,
          target.workspace.title,
          targetState,
          target.workspace.source,
          target.workspace.bibliography,
          nextRevision,
          target.workspace.entryFileId,
          JSON.stringify({ publicationProfile: target.workspace.publicationProfile }),
        );
        this.#recordRevision(`restore:r${targetRevision}`);
      });
    } catch (error) {
      this.#restoreDocument(previousState);
      throw error;
    }
    this.#broadcast(encodeServerCollaborationMessage({ type: "reset", revision: nextRevision }));
    this.#broadcastResources();
    return this.getSnapshot(workspaceId);
  }

  getRevisionSeed(revision: number): string {
    return this.#revisionRow(revision).snapshot_json;
  }

  getHeadRevisionSeed(): string {
    const row = this.ctx.storage.sql.exec<ProjectRevisionRow>("SELECT * FROM project_revisions ORDER BY revision DESC LIMIT 1").one();
    return row.snapshot_json;
  }

  seedFromRevision(workspaceId: string, titleValue: string, seedValue: string): WorkspaceSnapshot {
    const seed = parseStoredProjectRevision(seedValue);
    const title = titleValue.trim();
    if (!title || title.length > 120) throw new Error("Workspace title is invalid");
    const targetState = decodeBase64(seed.workspace.yState);
    const previous = this.#workspaceRow();
    this.#restoreDocument(targetState);
    try {
      this.ctx.storage.transactionSync(() => {
        this.#replaceRevisionTables(seed, workspaceId);
        this.ctx.storage.sql.exec("DELETE FROM candidates");
        this.ctx.storage.sql.exec("DELETE FROM project_milestones");
        this.ctx.storage.sql.exec("DELETE FROM project_revisions");
        this.ctx.storage.sql.exec(
          `UPDATE workspace
           SET title = ?, y_state = ?, source = ?, bibliography = ?, revision = 0, entry_file_id = ?, settings_json = ?
           WHERE id = 1`,
          title,
          targetState,
          seed.workspace.source,
          seed.workspace.bibliography,
          seed.workspace.entryFileId,
          JSON.stringify({ publicationProfile: seed.workspace.publicationProfile }),
        );
        this.#recordRevision("seed-from-revision", 0);
      });
    } catch (error) {
      this.#restoreDocument(previous.y_state);
      throw error;
    }
    this.#broadcastResources();
    return this.getSnapshot(workspaceId);
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
    const persisted = this.#persistDocument(
      previous,
      {},
      () => {
        this.ctx.storage.sql.exec(
          "UPDATE project_references SET citation_alias = ?, updated_at = ? WHERE reference_id = ?",
          alias,
          now,
          referenceId,
        );
      },
      "project-reference-alias-rename",
    );
    this.#broadcast(Y.encodeStateAsUpdate(this.#document, stateVector));
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }));
    this.#broadcastResources();
    return this.getSnapshot(workspaceId);
  }

  unlinkProjectReference(workspaceId: string, referenceId: string): ProjectReferenceUnlinkResult {
    const rows = this.#projectReferenceRows();
    const row = rows.find((item) => item.reference_id === referenceId);
    if (!row) return { ok: false, code: "reference-not-linked", error: "Reference is not linked to this project" };
    if (projectUsesCitationAlias(this.#projectFiles(), row.citation_alias)) {
      return { ok: false, code: "citation-alias-in-use", error: "Remove citations using this alias before unlinking the reference" };
    }
    const next = rows.filter((item) => item.reference_id !== referenceId).map(projectReferenceFromRow);
    this.#replaceBibliography(projectReferenceBibliography(next), "project-reference-unlink", {}, () => {
      this.ctx.storage.sql.exec("DELETE FROM project_references WHERE reference_id = ?", referenceId);
    });
    return { ok: true, value: this.getSnapshot(workspaceId) };
  }

  pinResearchShare(workspaceId: string, share: ResearchShareSnapshot): WorkspaceSnapshot {
    if (share.projectId !== workspaceId || share.revokedAt !== null) throw new Error("Research share is not active for this project");
    const existing = this.ctx.storage.sql
      .exec<ResearchShareRow>("SELECT * FROM project_research_shares WHERE id = ?", share.id)
      .toArray()[0];
    if (existing && existing.revoked_at === null) return this.getSnapshot(workspaceId);
    const previous = this.#workspaceRow();
    const persisted = this.#persistDocument(
      previous,
      {},
      () => {
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
      },
      "research-share-pin",
    );
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }));
    this.#broadcastResources();
    return this.getSnapshot(workspaceId);
  }

  revokeResearchShare(workspaceId: string, shareId: string, revokedAt: string): WorkspaceSnapshot {
    const row = this.ctx.storage.sql.exec<ResearchShareRow>("SELECT * FROM project_research_shares WHERE id = ?", shareId).toArray()[0];
    if (!row || row.project_id !== workspaceId) throw new Error("Research share not found");
    if (row.revoked_at) return this.getSnapshot(workspaceId);
    const previous = this.#workspaceRow();
    const persisted = this.#persistDocument(
      previous,
      {},
      () => {
        this.ctx.storage.sql.exec("UPDATE project_research_shares SET revoked_at = ? WHERE id = ?", revokedAt, shareId);
      },
      "research-share-revoke",
    );
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
    const persisted = this.#persistDocument(
      previous,
      {},
      () => {
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
      },
      "project-file-create",
    );
    this.#broadcast(Y.encodeStateAsUpdate(this.#document, stateVector));
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }));
    this.#broadcastResources();
    return this.getSnapshot(workspaceId);
  }

  replaceProjectFileContent(workspaceId: string, fileId: string, content: string, expectedRevision: number): ProjectFileReplaceResult {
    if (content.length > 2_000_000) return { ok: false, code: "content-too-large", error: "Project file exceeds 2 MB" };
    const previous = this.#workspaceRow();
    if (previous.revision !== expectedRevision) {
      return { ok: false, code: "revision-conflict", error: "Project changed since this edit loaded" };
    }
    let text: Y.Text;
    try {
      ({ text } = this.#projectText(fileId));
    } catch (error) {
      if (error instanceof Error && error.message === "Project file not found") {
        return { ok: false, code: "file-not-found", error: error.message };
      }
      throw error;
    }
    const splice = calculateTextSplice(text.toString(), content);
    if (!splice) return { ok: true, value: this.getSnapshot(workspaceId) };

    const stateVector = Y.encodeStateVector(this.#document);
    if (splice.deleteCount > 0) text.delete(splice.start, splice.deleteCount);
    if (splice.insert) text.insert(splice.start, splice.insert);
    const persisted = this.#persistDocument(previous, {}, undefined, "edit-link-file-replace");
    this.#broadcast(Y.encodeStateAsUpdate(this.#document, stateVector));
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }));
    return { ok: true, value: this.getSnapshot(workspaceId) };
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
    const persisted = this.#persistDocument(
      previous,
      {},
      () => {
        const now = new Date().toISOString();
        this.ctx.storage.sql.exec("UPDATE project_files SET path = ?, updated_at = ? WHERE id = ?", nextPath, now, fileId);
        for (const update of updates) {
          this.ctx.storage.sql.exec(
            "UPDATE project_files SET content = ?, updated_at = ? WHERE id = ?",
            update.content,
            now,
            update.row.id,
          );
        }
      },
      "project-file-rename",
    );
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
    const persisted = this.#persistDocument(
      workspace,
      {},
      () => {
        this.ctx.storage.sql.exec("DELETE FROM project_files WHERE id = ?", fileId);
      },
      "project-file-delete",
    );
    this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision: persisted.revision }));
    this.#broadcastResources();
    return this.getSnapshot(workspaceId);
  }

  initializeWorkspace(title: string): void {
    const workspace = this.#workspaceRow();
    if (workspace.revision !== 0 || workspace.title !== "Evidence becomes prose") return;
    this.#persistResourceRevision("workspace-initialize", () => {
      this.ctx.storage.sql.exec("UPDATE workspace SET title = ? WHERE id = 1", title);
    });
  }

  renameWorkspace(titleValue: string): WorkspaceSnapshot {
    const title = titleValue.trim();
    if (!title || title.length > 120) throw new Error("Workspace title is invalid");
    this.#persistResourceRevision("workspace-rename", () => {
      this.ctx.storage.sql.exec("UPDATE workspace SET title = ? WHERE id = 1", title);
    });
    return this.getSnapshot("");
  }

  updatePublicationProfile(profile: ProjectPublicationProfile): WorkspaceSnapshot {
    if (!isProjectPublicationProfile(profile)) throw new Error("Project publication profile is invalid");
    this.#persistResourceRevision("publication-profile-update", () => {
      this.ctx.storage.sql.exec("UPDATE workspace SET settings_json = ? WHERE id = 1", JSON.stringify({ publicationProfile: profile }));
    });
    return this.getSnapshot("");
  }

  async deleteWorkspaceData(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) socket.close(1001, "Workspace deleted");
    this.#document.destroy();
    await this.ctx.storage.deleteAll();
  }

  registerPdf(pdf: PdfResource): PdfResource {
    this.#persistResourceRevision("pdf-register", () => {
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
    });
    return pdf;
  }

  deletePdf(pdfId: string): PdfResource {
    const pdf = this.#pdfs().find((item) => item.id === pdfId);
    if (!pdf) throw new Error("PDF not found");
    const annotations = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM annotations WHERE pdf_id = ?", pdfId)
      .one().count;
    const publicationLinks = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM publication_pdf_links WHERE pdf_id = ?", pdfId)
      .one().count;
    const referenceLinks = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM project_reference_pdf_links WHERE pdf_id = ?", pdfId)
      .one().count;
    if (annotations + publicationLinks + referenceLinks > 0) {
      throw new Error(
        `Remove ${annotations} annotation(s) and ${publicationLinks + referenceLinks} reference link(s) before removing this PDF`,
      );
    }
    this.#persistResourceRevision("pdf-delete", () => {
      this.ctx.storage.sql.exec("DELETE FROM pdfs WHERE id = ?", pdfId);
    });
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
      this.#persistResourceRevision("publication-pdf-link", () => {
        this.#assertPdfExists(pdfId);
        linkWrite = this.#ensurePublicationPdfLink(existing.id, pdfId);
      });
      if (!linkWrite) throw new Error("Publication intake could not be completed");
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
    this.#persistResourceRevision("publication-pdf-link", () => {
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
    this.#persistResourceRevision("publication-pdf-unlink", () => {
      this.ctx.storage.sql.exec("DELETE FROM publication_pdf_links WHERE id = ?", linkId);
      this.ctx.storage.sql.exec("DELETE FROM project_reference_pdf_links WHERE id = ?", linkId);
    });
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

    const createdAt = new Date().toISOString();
    const fragment: AnnotationFragment = {
      id: crypto.randomUUID(),
      quote: input.quote,
      prefix: input.prefix,
      suffix: input.suffix,
      rects: input.rects,
      createdAt,
    };
    const annotation: AnnotationResource = { id: crypto.randomUUID(), ...input, fragments: [fragment], createdAt, updatedAt: createdAt };
    this.#persistResourceRevision("annotation-create", () => {
      this.ctx.storage.sql.exec(
        "INSERT INTO annotations (id, pdf_id, page, quote, prefix, suffix, comment, rects_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        annotation.id,
        annotation.pdfId,
        annotation.page,
        annotation.quote,
        annotation.prefix,
        annotation.suffix,
        annotation.comment,
        serializeAnnotationState(annotation.fragments, annotation.updatedAt),
        annotation.createdAt,
      );
    });
    return annotation;
  }

  appendAnnotationFragment(annotationId: string, input: AddAnnotationFragmentInput): AnnotationResource {
    const row = this.#annotationRow(annotationId);
    if (row.page !== input.page) throw new Error("Highlight fragments must remain on one PDF page");
    const current = annotationFromRow(row);
    const updatedAt = new Date().toISOString();
    const fragment: AnnotationFragment = { id: crypto.randomUUID(), ...input, createdAt: updatedAt };
    const fragments = [...current.fragments, fragment];
    const summary = annotationFragmentSummary(fragments);
    this.#persistResourceRevision("annotation-fragment-add", () => {
      this.ctx.storage.sql.exec(
        "UPDATE annotations SET quote = ?, prefix = ?, suffix = ?, rects_json = ? WHERE id = ?",
        summary.quote,
        summary.prefix,
        summary.suffix,
        serializeAnnotationState(fragments, updatedAt),
        annotationId,
      );
    });
    this.#broadcastResources();
    return annotationFromRow(this.#annotationRow(annotationId));
  }

  updateAnnotation(annotationId: string, input: UpdateAnnotationInput): AnnotationResource {
    this.#annotationRow(annotationId);
    const updatedAt = new Date().toISOString();
    const current = annotationFromRow(this.#annotationRow(annotationId));
    this.#persistResourceRevision("annotation-update", () => {
      this.ctx.storage.sql.exec(
        "UPDATE annotations SET comment = ?, rects_json = ? WHERE id = ?",
        input.comment,
        serializeAnnotationState(current.fragments, updatedAt),
        annotationId,
      );
    });
    this.#broadcastResources();
    return annotationFromRow(this.#annotationRow(annotationId));
  }

  removeAnnotationFragment(annotationId: string, fragmentId: string): AnnotationResource | null {
    const current = annotationFromRow(this.#annotationRow(annotationId));
    if (!current.fragments.some((fragment) => fragment.id === fragmentId)) throw new Error("Highlight fragment not found");
    const fragments = current.fragments.filter((fragment) => fragment.id !== fragmentId);
    if (fragments.length === 0) {
      this.deleteAnnotation(annotationId);
      return null;
    }
    const updatedAt = new Date().toISOString();
    const summary = annotationFragmentSummary(fragments);
    this.#persistResourceRevision("annotation-fragment-remove", () => {
      this.ctx.storage.sql.exec(
        "UPDATE annotations SET quote = ?, prefix = ?, suffix = ?, rects_json = ? WHERE id = ?",
        summary.quote,
        summary.prefix,
        summary.suffix,
        serializeAnnotationState(fragments, updatedAt),
        annotationId,
      );
    });
    this.#broadcastResources();
    return annotationFromRow(this.#annotationRow(annotationId));
  }

  updateAnnotationFragment(annotationId: string, fragmentId: string, input: UpdateAnnotationFragmentInput): AnnotationResource {
    const current = annotationFromRow(this.#annotationRow(annotationId));
    if (!current.fragments.some((fragment) => fragment.id === fragmentId)) throw new Error("Highlight fragment not found");
    const fragments = current.fragments.map((fragment) => (fragment.id === fragmentId ? { ...fragment, ...input } : fragment));
    const updatedAt = new Date().toISOString();
    const summary = annotationFragmentSummary(fragments);
    this.#persistResourceRevision("annotation-fragment-update", () => {
      this.ctx.storage.sql.exec(
        "UPDATE annotations SET quote = ?, prefix = ?, suffix = ?, rects_json = ? WHERE id = ?",
        summary.quote,
        summary.prefix,
        summary.suffix,
        serializeAnnotationState(fragments, updatedAt),
        annotationId,
      );
    });
    this.#broadcastResources();
    return annotationFromRow(this.#annotationRow(annotationId));
  }

  deleteAnnotation(annotationId: string): void {
    this.#annotationRow(annotationId);
    const claims = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM claim_evidence_links WHERE annotation_id = ?", annotationId)
      .one().count;
    if (claims > 0) throw new Error(`Remove this highlight from ${claims} claim(s) before deleting it`);
    this.#persistResourceRevision("annotation-delete", () => {
      this.ctx.storage.sql.exec("DELETE FROM passage_links WHERE annotation_id = ?", annotationId);
      this.ctx.storage.sql.exec("DELETE FROM annotations WHERE id = ?", annotationId);
    });
    this.#broadcastResources();
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
    const fragment: AnnotationFragment = {
      id: crypto.randomUUID(),
      quote: input.annotation.quote,
      prefix: input.annotation.prefix,
      suffix: input.annotation.suffix,
      rects: input.annotation.rects,
      createdAt,
    };
    const annotation: AnnotationResource = {
      id: crypto.randomUUID(),
      ...input.annotation,
      fragments: [fragment],
      createdAt,
      updatedAt: createdAt,
    };
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
    this.#persistResourceRevision("annotation-passage-link", () => {
      this.ctx.storage.sql.exec(
        "INSERT INTO annotations (id, pdf_id, page, quote, prefix, suffix, comment, rects_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        annotation.id,
        annotation.pdfId,
        annotation.page,
        annotation.quote,
        annotation.prefix,
        annotation.suffix,
        annotation.comment,
        serializeAnnotationState(annotation.fragments, annotation.updatedAt),
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
    this.#persistResourceRevision("annotation-passage-link", () => {
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
    });
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
    this.#persistResourceRevision("claim-create", () => {
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
    return claim;
  }

  updateClaim(claimId: string, input: UpsertClaimInput): ClaimUpdateResult {
    let existing: ClaimResource;
    try {
      existing = this.#claim(claimId);
      this.#assertEvidenceAnnotations(input.evidence);
    } catch (error) {
      if (error instanceof Error && error.message === "Claim not found") {
        return { ok: false, code: "claim-not-found", error: error.message };
      }
      if (error instanceof Error && error.message === "Annotation not found") {
        return { ok: false, code: "annotation-not-found", error: error.message };
      }
      throw error;
    }
    const updatedAt = new Date().toISOString();
    this.#persistResourceRevision("claim-update", () => {
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
    return { ok: true, value: { ...existing, text: input.text.trim(), note: input.note.trim(), updatedAt } };
  }

  deleteClaim(claimId: string): void {
    this.#claim(claimId);
    this.#persistResourceRevision("claim-delete", () => {
      this.ctx.storage.sql.exec("DELETE FROM claims WHERE id = ?", claimId);
    });
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
    this.#persistResourceRevision("claim-passage-link", () => {
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
    });
    return {
      id,
      claimId: input.claimId,
      anchor: toManuscriptAnchorSelector(anchor),
      resolution: resolveManuscriptAnchor(this.#document, anchor),
      createdAt,
    };
  }

  createManuscriptComment(input: CreateManuscriptCommentInput, authorId: string, authorLabel: string): ManuscriptComment {
    const workspace = this.#workspaceRow();
    const target = this.#projectText(input.fileId);
    const source = target.text.toString();
    if (input.sourceRevision !== workspace.revision) throw new Error("Document selection is stale");
    if (source !== target.file.content || input.end > source.length || source.slice(input.start, input.end) !== input.excerpt) {
      throw new Error("Document selection is stale");
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const anchor = createManuscriptAnchor(this.#document, input.start, input.end, workspace.revision, target.file.id, target.text);
    this.#persistResourceRevision("comment-create", () => {
      this.ctx.storage.sql.exec(
        `INSERT INTO manuscript_comments
         (id, author_id, author_label, body, start_offset, end_offset, excerpt, anchor_version,
          relative_start, relative_end, quote_prefix, quote_suffix, anchored_revision, project_file_id,
          status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
        id,
        authorId,
        authorLabel,
        input.body.trim(),
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
        createdAt,
      );
    });
    return this.#comment(id);
  }

  resolveManuscriptComment(commentId: string): ManuscriptComment {
    const existing = this.#comment(commentId);
    if (existing.status === "resolved") return existing;
    const updatedAt = new Date().toISOString();
    this.#persistResourceRevision("comment-resolve", () => {
      this.ctx.storage.sql.exec("UPDATE manuscript_comments SET status = 'resolved', updated_at = ? WHERE id = ?", updatedAt, commentId);
    });
    return this.#comment(commentId);
  }

  createCandidate(input: CreateCandidateInput): CandidateCreationResult {
    if (!isCreateCandidateInput(input)) return { ok: false, code: "invalid-input", error: "Model candidate input is invalid" };
    const workspace = this.#workspaceRow();
    let target: { file: ProjectFile; text: Y.Text };
    try {
      target = this.#projectText(input.target.fileId);
    } catch (error) {
      if (error instanceof Error && error.message === "Project file not found") {
        return { ok: false, code: "target-not-found", error: error.message };
      }
      throw error;
    }
    const sourceValue = target.text.toString();
    if (input.target.sourceRevision !== workspace.revision) {
      return { ok: false, code: "source-stale", error: "Candidate source is stale; generate a new revision" };
    }
    if (
      sourceValue !== target.file.content ||
      input.target.end > sourceValue.length ||
      sourceValue.slice(input.target.start, input.target.end) !== input.target.excerpt
    ) {
      return { ok: false, code: "source-stale", error: "Candidate source is stale; generate a new revision" };
    }

    let evidence: ModelEvidence[];
    try {
      evidence = this.#captureModelEvidence(input.evidence);
    } catch (error) {
      if (error instanceof Error && /Model evidence (annotation|claim) not found/u.test(error.message)) {
        return { ok: false, code: "evidence-not-found", error: error.message };
      }
      if (error instanceof Error && error.message === "Model evidence is stale; generate a new revision") {
        return { ok: false, code: "evidence-stale", error: error.message };
      }
      if (error instanceof Error && error.message === "Model evidence exceeds the operation limit") {
        return { ok: false, code: "evidence-too-large", error: error.message };
      }
      throw error;
    }
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
    return { ok: true, value: this.#candidate(id) };
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
      revision = this.#persistDocument(
        workspace,
        {},
        () => {
          this.ctx.storage.sql.exec("UPDATE candidates SET status = 'accepted' WHERE id = ?", candidateId);
        },
        "model-candidate-apply",
      ).revision;
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
            if (workspace.source === defaultSource) {
              const supportingId = crypto.randomUUID();
              const yTextName = `file:${supportingId}`;
              this.#document.getText(yTextName).insert(0, defaultTransclusionSource);
              this.ctx.storage.sql.exec(
                `INSERT INTO project_files (id, path, media_type, y_text_name, content, created_at, updated_at)
                 VALUES (?, ?, 'text/markdown', ?, ?, ?, ?)`,
                supportingId,
                defaultTransclusionPath,
                yTextName,
                defaultTransclusionSource,
                now,
                now,
              );
              const state = Y.encodeStateAsUpdate(this.#document);
              this.ctx.storage.sql.exec("UPDATE workspace SET y_state = ? WHERE id = 1", state.buffer);
            }
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
      {
        version: 15,
        name: "preserve-project-revisions-and-milestones",
        apply(sql): undefined {
          sql.exec(`
            CREATE TABLE IF NOT EXISTS project_revisions (
              revision INTEGER PRIMARY KEY,
              reason TEXT NOT NULL,
              snapshot_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS project_milestones (
              id TEXT PRIMARY KEY,
              revision INTEGER NOT NULL REFERENCES project_revisions(revision),
              name TEXT NOT NULL UNIQUE COLLATE NOCASE,
              description TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS project_milestones_revision ON project_milestones(revision);
          `);
          return undefined;
        },
      },
      {
        version: 16,
        name: "anchor-collaborative-comments",
        apply(sql): undefined {
          sql.exec(`
            CREATE TABLE IF NOT EXISTS manuscript_comments (
              id TEXT PRIMARY KEY,
              author_id TEXT NOT NULL,
              author_label TEXT NOT NULL,
              body TEXT NOT NULL,
              start_offset INTEGER NOT NULL,
              end_offset INTEGER NOT NULL,
              excerpt TEXT NOT NULL,
              anchor_version INTEGER NOT NULL CHECK (anchor_version = 1),
              relative_start BLOB NOT NULL,
              relative_end BLOB NOT NULL,
              quote_prefix TEXT NOT NULL,
              quote_suffix TEXT NOT NULL,
              anchored_revision INTEGER NOT NULL,
              project_file_id TEXT NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS manuscript_comments_status ON manuscript_comments(status, updated_at DESC);
          `);
          const revisions = sql.exec<ProjectRevisionRow>("SELECT * FROM project_revisions").toArray();
          for (const revision of revisions) {
            const snapshot: unknown = JSON.parse(revision.snapshot_json);
            if (!isRecordValue(snapshot) || !isRecordValue(snapshot.tables) || "manuscript_comments" in snapshot.tables) continue;
            snapshot.tables.manuscript_comments = [];
            sql.exec("UPDATE project_revisions SET snapshot_json = ? WHERE revision = ?", JSON.stringify(snapshot), revision.revision);
          }
          return undefined;
        },
      },
      {
        version: 17,
        name: "store-project-publication-profile",
        apply(sql): undefined {
          const columns = sql.exec<{ name: string }>("PRAGMA table_info(workspace)").toArray();
          if (!columns.some((column) => column.name === "settings_json")) {
            sql.exec(
              `ALTER TABLE workspace ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{"publicationProfile":{"citationStyle":"apa","locale":"en-US"}}'`,
            );
          }
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

  #persistDocument(
    previous: WorkspaceRow,
    options: ProjectionOptions = {},
    relatedWrite?: () => void,
    reason = "document-edit",
  ): PersistedDocumentUpdate {
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
        this.#recordRevision(reason);
      });
    } catch (error) {
      this.#restoreDocument(previous.y_state);
      throw error;
    }
    return { resourcesChanged, revision };
  }

  #persistResourceRevision(reason: string, relatedWrite: () => void): number {
    let revision = 0;
    this.ctx.storage.transactionSync(() => {
      relatedWrite();
      revision = this.#recordRevision(reason);
    });
    this.#broadcastResources();
    return revision;
  }

  #ensureInitialRevision(): void {
    const existing = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM project_revisions").one();
    if (existing.count > 0) return;
    this.#recordRevision("history-adoption", 0);
  }

  #recordRevision(reason: string, requestedRevision?: number): number {
    const coalesced = reason === "document-edit" && requestedRevision === undefined ? this.#coalescedDocumentRevision() : null;
    if (coalesced !== null) {
      this.ctx.storage.sql.exec(
        "UPDATE project_revisions SET snapshot_json = ?, created_at = ? WHERE revision = ?",
        JSON.stringify(this.#captureRevisionState()),
        new Date().toISOString(),
        coalesced,
      );
      return coalesced;
    }
    const revision = requestedRevision ?? this.#nextHistoryRevision();
    this.ctx.storage.sql.exec(
      "INSERT INTO project_revisions (revision, reason, snapshot_json, created_at) VALUES (?, ?, ?, ?)",
      revision,
      reason,
      JSON.stringify(this.#captureRevisionState()),
      new Date().toISOString(),
    );
    return revision;
  }

  #coalescedDocumentRevision(): number | null {
    const latest = this.ctx.storage.sql
      .exec<ProjectRevisionRow>("SELECT * FROM project_revisions ORDER BY revision DESC LIMIT 1")
      .toArray()[0];
    if (!latest || latest.reason !== "document-edit") return null;
    const age = Date.now() - Date.parse(latest.created_at);
    if (!Number.isFinite(age) || age < 0 || age > 30_000) return null;
    const milestone = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM project_milestones WHERE revision = ?", latest.revision)
      .one();
    return milestone.count === 0 ? latest.revision : null;
  }

  #nextHistoryRevision(): number {
    const row = this.ctx.storage.sql.exec<{ revision: number | null }>("SELECT MAX(revision) AS revision FROM project_revisions").one();
    return (row.revision ?? -1) + 1;
  }

  #captureRevisionState(): StoredProjectRevision {
    const workspace = this.#workspaceRow();
    if (!workspace.entry_file_id) throw new Error("Project entry file is not initialized");
    const tables = Object.fromEntries(
      revisionTables.map((table) => [
        table,
        this.ctx.storage.sql.exec<Record<string, SqlStorageValue>>(`SELECT * FROM ${table}`).toArray().map(storeSqlRow),
      ]),
    );
    if (!isStoredRevisionTables(tables)) throw new Error("Project revision tables could not be captured");
    return {
      version: 1,
      workspace: {
        title: workspace.title,
        yState: encodeBase64(Y.encodeStateAsUpdate(this.#document).buffer),
        source: workspace.source,
        bibliography: workspace.bibliography,
        entryFileId: workspace.entry_file_id,
        publicationProfile: parsePublicationProfile(workspace.settings_json),
      },
      tables,
    };
  }

  #revisionRow(revision: number): ProjectRevisionRow {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Project revision is invalid");
    const row = this.ctx.storage.sql.exec<ProjectRevisionRow>("SELECT * FROM project_revisions WHERE revision = ?", revision).toArray()[0];
    if (!row) throw new Error("Project revision not found");
    return row;
  }

  #milestones(): ProjectMilestone[] {
    return this.ctx.storage.sql
      .exec<ProjectMilestoneRow>("SELECT * FROM project_milestones ORDER BY created_at DESC, name COLLATE NOCASE")
      .toArray()
      .map((row) => ({
        id: row.id,
        revision: row.revision,
        name: row.name,
        description: row.description,
        createdAt: row.created_at,
      }));
  }

  #replaceRevisionTables(state: StoredProjectRevision, workspaceId?: string): void {
    for (const table of revisionDeleteOrder) this.ctx.storage.sql.exec(`DELETE FROM ${table}`);
    for (const table of revisionInsertOrder) {
      for (const storedRow of state.tables[table]) {
        const row = restoreSqlRow(storedRow);
        if (table === "project_research_shares" && workspaceId) row.project_id = workspaceId;
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        const placeholders = columns.map(() => "?").join(", ");
        this.ctx.storage.sql.exec(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
          ...columns.map((column) => row[column] ?? null),
        );
      }
    }
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
      let revision: number | undefined;
      this.ctx.storage.transactionSync(() => {
        resourcesChanged = this.#reconcileBibliography(sourceValue, options);
        relatedWrite?.();
        if (resourcesChanged || relatedWrite) {
          revision = this.#workspaceRow().revision + 1;
          this.ctx.storage.sql.exec("UPDATE workspace SET revision = ? WHERE id = 1", revision);
          this.#recordRevision(origin);
        }
      });
      if (revision !== undefined) this.#broadcast(encodeServerCollaborationMessage({ type: "revision", revision }));
      if (resourcesChanged) this.#broadcastResources();
      return;
    }

    const previous = this.#workspaceRow();
    const stateVector = Y.encodeStateVector(this.#document);
    this.#document.transact(() => {
      if (splice.deleteCount > 0) bibliography.delete(splice.start, splice.deleteCount);
      if (splice.insert) bibliography.insert(splice.start, splice.insert);
    }, origin);
    const persisted = this.#persistDocument(previous, options, relatedWrite, origin);
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
    return this.ctx.storage.sql.exec<AnnotationRow>("SELECT * FROM annotations ORDER BY created_at DESC").toArray().map(annotationFromRow);
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

  #comments(): ManuscriptComment[] {
    return this.ctx.storage.sql
      .exec<ManuscriptCommentRow>("SELECT * FROM manuscript_comments ORDER BY updated_at DESC, id ASC")
      .toArray()
      .map((row) => manuscriptCommentFromRow(this.#document, row));
  }

  #comment(commentId: string): ManuscriptComment {
    const row = this.ctx.storage.sql.exec<ManuscriptCommentRow>("SELECT * FROM manuscript_comments WHERE id = ?", commentId).toArray()[0];
    if (!row) throw new Error("Comment not found");
    return manuscriptCommentFromRow(this.#document, row);
  }

  #annotationRow(annotationId: string): AnnotationRow {
    const row = this.ctx.storage.sql.exec<AnnotationRow>("SELECT * FROM annotations WHERE id = ?", annotationId).toArray()[0];
    if (!row) throw new Error("Highlight not found");
    return row;
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
        const annotation = annotationFromRow(row);
        if (annotation.updatedAt !== reference.version) throw new Error("Model evidence is stale; generate a new revision");
        const snapshot: ModelEvidence = {
          kind: "annotation",
          id: row.id,
          version: annotation.updatedAt,
          pdfId: row.pdf_id,
          page: row.page,
          quote: annotation.quote,
          prefix: annotation.prefix,
          suffix: annotation.suffix,
          comment: row.comment,
          rects: annotation.rects,
          createdAt: row.created_at,
          updatedAt: annotation.updatedAt,
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
    const control = typeof message === "string" ? parseServerCollaborationMessage(message) : null;
    const visibleToReaders = control?.type === "revision" || control?.type === "reset";
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except || socket.readyState !== WebSocket.OPEN) continue;
      const attachment = collaborationSocketAttachment(socket);
      if (attachment?.mode === "reader") {
        if (visibleToReaders) sendWebSocketMessage(socket, message);
        continue;
      }
      if (attachment?.mode === "edit-presence" && typeof message !== "string") continue;
      sendWebSocketMessage(socket, message);
    }
  }

  #broadcastPresence(): void {
    const collaborators = this.ctx.getWebSockets().filter((socket) => collaborationSocketAttachment(socket)?.mode !== "reader").length;
    this.#broadcast(encodeServerCollaborationMessage({ type: "presence", collaborators }));
  }

  #broadcastResources(): void {
    this.#broadcast(encodeServerCollaborationMessage({ type: "resources" }));
  }
}

function collaborationSocketAttachment(socket: WebSocket): CollaborationSocketAttachment | null {
  const value: unknown = socket.deserializeAttachment();
  if (!isRecordValue(value)) return null;
  if (value.mode === "reader") return { mode: "reader" };
  if (
    (value.mode === "writer" || value.mode === "edit-presence") &&
    typeof value.collaboratorId === "string" &&
    value.collaboratorId.length <= 128
  ) {
    return { mode: value.mode, collaboratorId: value.collaboratorId };
  }
  return null;
}

export interface WebSocketMessageTarget {
  readonly readyState: number;
  send(message: string | ArrayBuffer | ArrayBufferView): void;
}

export function sendWebSocketMessage(target: WebSocketMessageTarget, message: string | ArrayBuffer | ArrayBufferView): boolean {
  if (target.readyState !== WebSocket.OPEN) return false;
  try {
    target.send(message);
    return true;
  } catch (error) {
    if (target.readyState !== WebSocket.OPEN || isWebSocketDisconnect(error)) return false;
    throw error;
  }
}

function isWebSocketDisconnect(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "InvalidStateError" || error.message === "Network connection lost.";
}

function projectRevisionContent(revision: number, state: StoredProjectRevision): ProjectRevisionContent {
  const document = new Y.Doc();
  Y.applyUpdate(document, new Uint8Array(decodeBase64(state.workspace.yState)));
  const files = revisionRows(state, "project_files").map(
    (row): ProjectFile => ({
      id: sqlString(row, "id"),
      path: sqlString(row, "path"),
      mediaType: "text/markdown",
      content: sqlString(row, "content"),
      createdAt: sqlString(row, "created_at"),
      updatedAt: sqlString(row, "updated_at"),
    }),
  );
  const projectReferences = revisionRows(state, "project_references").map((row) =>
    projectReferenceFromRow({
      id: sqlString(row, "id"),
      reference_id: sqlString(row, "reference_id"),
      citation_alias: sqlString(row, "citation_alias"),
      snapshot_json: sqlString(row, "snapshot_json"),
      created_at: sqlString(row, "created_at"),
      updated_at: sqlString(row, "updated_at"),
    }),
  );
  const researchShares = revisionRows(state, "project_research_shares").map((row) =>
    researchShareFromRow({
      id: sqlString(row, "id"),
      project_id: sqlString(row, "project_id"),
      reference_id: sqlString(row, "reference_id"),
      resource_id: sqlString(row, "resource_id"),
      kind: sqlString(row, "kind"),
      snapshot_json: sqlString(row, "snapshot_json"),
      created_at: sqlString(row, "created_at"),
      revoked_at: sqlNullableString(row, "revoked_at"),
    }),
  );
  const pdfs = revisionRows(state, "pdfs").map(
    (row): PdfResource => ({
      id: sqlString(row, "id"),
      name: sqlString(row, "name"),
      contentType: "application/pdf",
      size: sqlNumber(row, "size"),
      objectKey: sqlString(row, "object_key"),
      fingerprint: sqlString(row, "fingerprint"),
      createdAt: sqlString(row, "created_at"),
    }),
  );
  const publicationPdfLinks = [...revisionRows(state, "publication_pdf_links"), ...revisionRows(state, "project_reference_pdf_links")].map(
    (row): PublicationPdfLink => ({
      id: sqlString(row, "id"),
      publicationId: sqlString(row, "publication_id"),
      pdfId: sqlString(row, "pdf_id"),
      createdAt: sqlString(row, "created_at"),
    }),
  );
  const annotations = revisionRows(state, "annotations").map(
    (row): AnnotationResource =>
      annotationFromRow({
        id: sqlString(row, "id"),
        pdf_id: sqlString(row, "pdf_id"),
        page: sqlNumber(row, "page"),
        quote: sqlString(row, "quote"),
        prefix: sqlString(row, "prefix"),
        suffix: sqlString(row, "suffix"),
        comment: sqlString(row, "comment"),
        rects_json: sqlString(row, "rects_json"),
        created_at: sqlString(row, "created_at"),
      }),
  );
  const claims = revisionRows(state, "claims").map(
    (row): ClaimResource => ({
      id: sqlString(row, "id"),
      text: sqlString(row, "text"),
      note: sqlString(row, "note"),
      createdAt: sqlString(row, "created_at"),
      updatedAt: sqlString(row, "updated_at"),
    }),
  );
  const comments = revisionRows(state, "manuscript_comments").map((row) =>
    manuscriptCommentFromRow(document, {
      id: sqlString(row, "id"),
      author_id: sqlString(row, "author_id"),
      author_label: sqlString(row, "author_label"),
      body: sqlString(row, "body"),
      start_offset: sqlNumber(row, "start_offset"),
      end_offset: sqlNumber(row, "end_offset"),
      excerpt: sqlString(row, "excerpt"),
      anchor_version: sqlNumber(row, "anchor_version"),
      relative_start: sqlNullableBlob(row, "relative_start"),
      relative_end: sqlNullableBlob(row, "relative_end"),
      quote_prefix: sqlString(row, "quote_prefix"),
      quote_suffix: sqlString(row, "quote_suffix"),
      anchored_revision: sqlNumber(row, "anchored_revision"),
      project_file_id: sqlString(row, "project_file_id"),
      status: sqlString(row, "status"),
      created_at: sqlString(row, "created_at"),
      updated_at: sqlString(row, "updated_at"),
    }),
  );
  const composition = files.some((file) => file.id === state.workspace.entryFileId)
    ? composeProject(files, state.workspace.entryFileId).content
    : state.workspace.source;
  return {
    revision,
    title: state.workspace.title,
    entryFileId: state.workspace.entryFileId,
    source: composition,
    bibliography: state.workspace.bibliography,
    files,
    projectReferences,
    researchShares,
    pdfs,
    publicationPdfLinks,
    annotations,
    claims,
    comments,
    relationships: {
      annotationPassages: state.tables.passage_links.length,
      claimEvidence: state.tables.claim_evidence_links.length,
      claimPassages: state.tables.claim_passage_links.length,
      comments: state.tables.manuscript_comments.length,
    },
  };
}

function parseStoredProjectRevision(value: string): StoredProjectRevision {
  const parsed: unknown = JSON.parse(value);
  if (!isRecordValue(parsed) || parsed.version !== 1 || !isRecordValue(parsed.workspace) || !isStoredRevisionTables(parsed.tables)) {
    throw new Error("Stored project revision is invalid");
  }
  const workspace = parsed.workspace;
  if (
    typeof workspace.title !== "string" ||
    typeof workspace.yState !== "string" ||
    typeof workspace.source !== "string" ||
    typeof workspace.bibliography !== "string" ||
    typeof workspace.entryFileId !== "string" ||
    !workspace.entryFileId
  ) {
    throw new Error("Stored project revision is invalid");
  }
  return {
    version: 1,
    workspace: {
      title: workspace.title,
      yState: workspace.yState,
      source: workspace.source,
      bibliography: workspace.bibliography,
      entryFileId: workspace.entryFileId,
      publicationProfile: isProjectPublicationProfile(workspace.publicationProfile)
        ? workspace.publicationProfile
        : defaultProjectPublicationProfile,
    },
    tables: parsed.tables,
  };
}

function parsePublicationProfile(value: string): ProjectPublicationProfile {
  const parsed: unknown = JSON.parse(value);
  if (!isRecordValue(parsed) || !isProjectPublicationProfile(parsed.publicationProfile)) return defaultProjectPublicationProfile;
  return parsed.publicationProfile;
}

function isStoredRevisionTables(value: unknown): value is StoredProjectRevision["tables"] {
  if (!isRecordValue(value)) return false;
  for (const table of revisionTables) {
    const rows = value[table];
    if (!Array.isArray(rows)) return false;
    for (const row of rows) {
      if (!isRecordValue(row)) return false;
      const columns = revisionTableColumns[table];
      const keys = Object.keys(row);
      if (keys.length !== columns.length || !keys.every((key) => columns.includes(key))) return false;
      for (const [key, item] of Object.entries(row)) {
        if (!/^[a-z_]+$/u.test(key)) return false;
        if (item === null || typeof item === "string" || typeof item === "number") continue;
        if (!isStoredBlob(item)) return false;
      }
    }
  }
  return true;
}

function storeSqlRow(row: Record<string, SqlStorageValue>): StoredSqlRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, storeSqlValue(value)]));
}

function storeSqlValue(value: SqlStorageValue): StoredSqlValue {
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  if (value instanceof ArrayBuffer) return { blob: encodeBase64(value) };
  throw new Error("Project revision contains an unsupported SQLite value");
}

function restoreSqlRow(row: StoredSqlRow): Record<string, SqlStorageValue> {
  const restored: Record<string, SqlStorageValue> = {};
  for (const [key, value] of Object.entries(row)) restored[key] = isStoredBlob(value) ? decodeBase64(value.blob) : value;
  return restored;
}

function revisionRows(state: StoredProjectRevision, table: RevisionTable): Record<string, SqlStorageValue>[] {
  return state.tables[table].map(restoreSqlRow);
}

function sqlString(row: Record<string, SqlStorageValue>, field: string): string {
  const value = row[field];
  if (typeof value !== "string") throw new Error(`Stored project revision field ${field} is invalid`);
  return value;
}

function sqlNullableString(row: Record<string, SqlStorageValue>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Stored project revision field ${field} is invalid`);
  return value;
}

function sqlNumber(row: Record<string, SqlStorageValue>, field: string): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Stored project revision field ${field} is invalid`);
  return value;
}

function sqlNullableBlob(row: Record<string, SqlStorageValue>, field: string): ArrayBuffer | null {
  const value = row[field];
  if (value === null || value instanceof ArrayBuffer) return value;
  throw new Error(`Stored project revision field ${field} is invalid`);
}

function encodeBase64(value: ArrayBufferLike): string {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isStoredBlob(value: unknown): value is { readonly blob: string } {
  return isRecordValue(value) && Object.keys(value).length === 1 && typeof value.blob === "string";
}

function decodeBase64(value: string): ArrayBuffer {
  if (!value || value.length > 180_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value))
    throw new Error("Stored project revision state is invalid");
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
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

function manuscriptAnchorFromRow(row: LinkRow | ClaimLinkRow | CandidateRow | ManuscriptCommentRow): StoredManuscriptAnchor {
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

function manuscriptCommentFromRow(document: Y.Doc, row: ManuscriptCommentRow): ManuscriptComment {
  const anchor = manuscriptAnchorFromRow(row);
  return {
    id: row.id,
    authorId: row.author_id,
    authorLabel: row.author_label,
    body: row.body,
    anchor: toManuscriptAnchorSelector(anchor),
    resolution: resolveManuscriptAnchor(document, anchor),
    status: row.status === "resolved" ? "resolved" : "open",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

function annotationFromRow(row: AnnotationRow): AnnotationResource {
  const state = parseAnnotationState(row);
  const summary = annotationFragmentSummary(state.fragments);
  return {
    id: row.id,
    pdfId: row.pdf_id,
    page: row.page,
    quote: summary.quote || row.quote,
    prefix: summary.prefix || row.prefix,
    suffix: summary.suffix || row.suffix,
    comment: row.comment,
    rects: state.fragments.flatMap((fragment) => fragment.rects),
    fragments: state.fragments,
    createdAt: row.created_at,
    updatedAt: state.updatedAt,
  };
}

function parseAnnotationState(row: AnnotationRow): { fragments: AnnotationFragment[]; updatedAt: string } {
  const parsed = parseJson(row.rects_json);
  if (isStoredAnnotationState(parsed)) return parsed;
  const rects = Array.isArray(parsed) ? parsed.filter(isStoredSelectionRect) : [];
  return {
    fragments: [
      {
        id: `legacy-${row.id}`,
        quote: row.quote,
        prefix: row.prefix,
        suffix: row.suffix,
        rects,
        createdAt: row.created_at,
      },
    ],
    updatedAt: row.created_at,
  };
}

function serializeAnnotationState(fragments: readonly AnnotationFragment[], updatedAt: string): string {
  return JSON.stringify({ version: 2, fragments, updatedAt });
}

function annotationFragmentSummary(fragments: readonly AnnotationFragment[]): { quote: string; prefix: string; suffix: string } {
  return {
    quote: fragments.map((fragment) => fragment.quote).join(" … "),
    prefix: fragments[0]?.prefix ?? "",
    suffix: fragments.at(-1)?.suffix ?? "",
  };
}

function isStoredAnnotationState(value: unknown): value is { version: 2; fragments: AnnotationFragment[]; updatedAt: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 2 &&
    "updatedAt" in value &&
    typeof value.updatedAt === "string" &&
    "fragments" in value &&
    Array.isArray(value.fragments) &&
    value.fragments.every(isStoredAnnotationFragment)
  );
}

function isStoredAnnotationFragment(value: unknown): value is AnnotationFragment {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "quote" in value &&
    typeof value.quote === "string" &&
    "prefix" in value &&
    typeof value.prefix === "string" &&
    "suffix" in value &&
    typeof value.suffix === "string" &&
    "createdAt" in value &&
    typeof value.createdAt === "string" &&
    "rects" in value &&
    Array.isArray(value.rects) &&
    value.rects.every(isStoredSelectionRect)
  );
}

function isStoredSelectionRect(value: unknown): value is AnnotationResource["rects"][number] {
  return (
    typeof value === "object" &&
    value !== null &&
    "x" in value &&
    "y" in value &&
    "width" in value &&
    "height" in value &&
    [value.x, value.y, value.width, value.height].every((coordinate) => typeof coordinate === "number")
  );
}

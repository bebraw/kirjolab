import * as v from "valibot";
import { strToU8, zipSync, type Zippable } from "fflate";
import { inspectLatexArchive, LatexArchiveFailure } from "../manuscript/latex-import";
import { sha256Bytes } from "../sha256";
import type { WorkspaceSnapshot } from "../workspace/workspace";
import { isValidCitationKey } from "../publication/publication-intake";
import { hasProjectImageSignature } from "./project-image-signatures";
import { isInertSvgImage, normalizeProjectPath } from "./project-files";
import {
  projectArchiveManifestSchema,
  projectArchiveSchemaVersion,
  projectArchiveStateSchema,
  type ProjectArchiveManifest,
  type ProjectArchiveState,
} from "./project-archive-schema";

export type { ProjectArchiveState, ProjectArchiveManifest } from "./project-archive-schema";
export const projectArchiveExclusions = [
  "Revision history and milestones",
  "Private Library attachments, personal notes, highlights, tags and reading state",
  "Live Library source grants and review connections",
  "Memberships, public sharing links and GitHub connections",
  "Model suggestions and derived caches",
] as const;
export interface ProjectArchiveSummary {
  readonly title: string;
  readonly entryPath: string;
  readonly files: number;
  readonly references: number;
  readonly images: number;
  readonly pdfs: number;
  readonly sharedSnapshots: number;
  readonly exclusions: readonly string[];
}
export type ProjectArchiveInspection =
  | {
      readonly kind: "native";
      readonly project: ProjectArchiveState;
      readonly manifest: ProjectArchiveManifest;
      readonly payloads: ReadonlyMap<string, Uint8Array>;
      readonly summary: ProjectArchiveSummary;
      readonly archiveSha256: string;
    }
  | { readonly kind: "legacy"; readonly summary: ProjectArchiveSummary; readonly archiveSha256: string };

export class ProjectArchiveError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ProjectArchiveError";
  }
}

export function projectArchiveSummary(
  project: ProjectArchiveState | WorkspaceSnapshot,
  exclusions: readonly string[] = projectArchiveExclusions,
): ProjectArchiveSummary {
  return {
    title: project.title,
    entryPath: project.files.find(({ id }) => id === project.entryFileId)?.path ?? "",
    files: project.files.length,
    references: project.projectReferences.length,
    images: project.assets.length,
    pdfs: project.pdfs.length,
    sharedSnapshots: project.researchShares.length,
    exclusions: [...exclusions],
  };
}

export function projectArchiveBinaryKeys(snapshot: Pick<WorkspaceSnapshot, "assets" | "pdfs" | "researchShares">): string[] {
  const keys = [...snapshot.assets.map(({ objectKey }) => objectKey), ...snapshot.pdfs.map(({ objectKey }) => objectKey)];
  for (const share of snapshot.researchShares) {
    if (share.revokedAt !== null) continue;
    if (share.content.kind === "artifact") keys.push(share.content.objectKey);
    if (share.content.kind === "web-snapshot") {
      if (share.content.rawObjectKey) keys.push(share.content.rawObjectKey);
      if (share.content.readableObjectKey) keys.push(share.content.readableObjectKey);
    }
  }
  return [...new Set(keys)];
}

export async function buildProjectArchive(
  snapshot: WorkspaceSnapshot,
  binaries: ReadonlyMap<string, Uint8Array>,
  exclusions: readonly string[] = projectArchiveExclusions,
): Promise<Uint8Array> {
  const payloads = new Map<string, Uint8Array>();
  const pointer = (key: string, expectedSize?: number): string => {
    const bytes = binaries.get(key);
    if (!bytes || (expectedSize !== undefined && bytes.byteLength !== expectedSize))
      throw new ProjectArchiveError("A required project binary is unavailable or has changed", 409);
    const path = `payloads/${payloads.size}.bin`;
    payloads.set(path, bytes);
    return path;
  };
  const project = parseProjectArchiveState({
    id: snapshot.id,
    title: snapshot.title,
    revision: snapshot.revision,
    entryFileId: snapshot.entryFileId,
    files: snapshot.files.map(({ collaborationTextName: _name, ...file }) => file),
    folders: snapshot.folders,
    assets: snapshot.assets.map((asset) => ({ ...asset, objectKey: pointer(asset.objectKey, asset.size) })),
    pdfs: snapshot.pdfs.map((pdf) => ({ ...pdf, objectKey: pointer(pdf.objectKey, pdf.size) })),
    bibliography: snapshot.bibliography,
    publicationProfile: snapshot.publicationProfile,
    publications: snapshot.publications,
    projectReferences: snapshot.projectReferences,
    publicationPdfLinks: snapshot.publicationPdfLinks,
    researchShares: snapshot.researchShares.map((share) => ({
      ...share,
      content:
        share.content.kind === "artifact"
          ? { ...share.content, objectKey: share.revokedAt ? "" : pointer(share.content.objectKey, share.content.size) }
          : share.content.kind === "web-snapshot"
            ? {
                ...share.content,
                rawObjectKey: share.revokedAt || !share.content.rawObjectKey ? null : pointer(share.content.rawObjectKey),
                readableObjectKey: share.revokedAt || !share.content.readableObjectKey ? null : pointer(share.content.readableObjectKey),
              }
            : share.content,
    })),
    annotations: snapshot.annotations,
    links: snapshot.links,
    claims: snapshot.claims,
    claimEvidenceLinks: snapshot.claimEvidenceLinks,
    claimLinks: snapshot.claimLinks,
    comments: snapshot.comments,
    reviewArtifactPins: snapshot.reviewArtifactPins,
  });
  const projectBytes = strToU8(JSON.stringify(project));
  if (projectBytes.byteLength > 10 * 1024 * 1024) throw new ProjectArchiveError("Project metadata exceeds 10 MiB", 413);
  payloads.set("project.json", projectBytes);
  if (payloads.size + 1 > 1_024) throw new ProjectArchiveError("Project archive exceeds 1,024 entries", 413);
  const total = [...payloads.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0);
  if (total > 20 * 1024 * 1024) throw new ProjectArchiveError("Project archive exceeds the 20 MiB expanded-size limit", 413);
  validateProjectArchiveGraph(project, payloads);
  const manifest: ProjectArchiveManifest = {
    schemaVersion: projectArchiveSchemaVersion,
    scope: "current-project",
    sourceProjectId: project.id,
    sourceRevision: project.revision,
    exclusions: [...new Set([...projectArchiveExclusions, ...exclusions])],
    payloads: [],
  };
  for (const [path, bytes] of payloads)
    manifest.payloads.push({ id: path, path, bytes: bytes.byteLength, sha256: await sha256Bytes(bytes) });
  const entries: Zippable = {};
  const at = new Date("1980-01-01T00:00:00.000Z");
  for (const [path, bytes] of [...payloads].sort(([a], [b]) => a.localeCompare(b))) entries[path] = [bytes, { mtime: at }];
  entries["manifest.json"] = [strToU8(JSON.stringify(manifest)), { mtime: at }];
  // Stored entries keep highly repetitive canonical files inside the extractor's expansion-ratio bounds.
  const zip = zipSync(entries, { level: 0, mtime: at });
  if (zip.byteLength > 20 * 1024 * 1024) throw new ProjectArchiveError("Project archive exceeds 20 MiB", 413);
  return zip;
}

export async function inspectProjectArchive(bytes: Uint8Array): Promise<ProjectArchiveInspection> {
  let files: ReadonlyMap<string, Uint8Array>;
  try {
    // Reuse the existing bounded ZIP parser. Native payload names never enter LaTeX conversion.
    const inspection = await inspectLatexArchive(bytes, { maximumExpandedBytes: 20 * 1024 * 1024 });
    files = new Map(inspection.files.map((file) => [file.path, file.bytes]));
  } catch (error) {
    if (error instanceof LatexArchiveFailure)
      throw new ProjectArchiveError(error.message.replaceAll("LaTeX", "Project"), error.code.includes("size") ? 413 : 400);
    throw error;
  }
  const archiveSha256 = await sha256Bytes(bytes);
  const manifestBytes = files.get("manifest.json");
  if (!manifestBytes) {
    if (files.has("project/project-snapshot.json"))
      return {
        kind: "legacy",
        archiveSha256,
        summary: {
          title: "Legacy source archive",
          entryPath: "",
          files: [...files.keys()].filter((path) => path.startsWith("project/") && path.endsWith(".md")).length,
          references: 0,
          images: 0,
          pdfs: 0,
          sharedSnapshots: 0,
          exclusions: [
            "Legacy source ZIPs cannot restore complete project metadata, PDF bytes or revision history. Export a Kirjolab project ZIP from the original project.",
          ],
        },
      };
    throw new ProjectArchiveError("This ZIP is not a Kirjolab project archive");
  }
  const parsed = v.safeParse(projectArchiveManifestSchema, decodeJson(manifestBytes, 1024 * 1024));
  if (!parsed.success) throw new ProjectArchiveError("Invalid or unsupported Kirjolab project manifest");
  const manifest = parsed.output;
  await validateArchivePayloads(manifest, files);
  const project = parseProjectArchiveState(decodeJson(files.get("project.json")!, 10 * 1024 * 1024));
  if (project.id !== manifest.sourceProjectId || project.revision !== manifest.sourceRevision)
    throw new ProjectArchiveError("Project manifest and state disagree");
  validateProjectArchiveGraph(project, files);
  return {
    kind: "native",
    project,
    manifest,
    payloads: files,
    summary: projectArchiveSummary(project, [...new Set([...projectArchiveExclusions, ...manifest.exclusions])]),
    archiveSha256,
  };
}

async function validateArchivePayloads(manifest: ProjectArchiveManifest, files: ReadonlyMap<string, Uint8Array>): Promise<void> {
  const declared = new Set<string>();
  const identities = new Set<string>();
  for (const payload of manifest.payloads) {
    if (
      declared.has(payload.path) ||
      identities.has(payload.id) ||
      (payload.path !== "project.json" && !/^payloads\/\d+\.bin$/u.test(payload.path))
    )
      throw new ProjectArchiveError("Duplicate or invalid project payload identity or path");
    declared.add(payload.path);
    identities.add(payload.id);
    const content = files.get(payload.path);
    if (!content) throw new ProjectArchiveError(`Missing project payload: ${payload.path}`);
    if (content.byteLength !== payload.bytes || (await sha256Bytes(content)) !== payload.sha256)
      throw new ProjectArchiveError(`Project payload integrity digest mismatch: ${payload.path}`);
  }
  if (files.size !== declared.size + 1 || !declared.has("project.json"))
    throw new ProjectArchiveError("Unexpected or missing project payloads");
}

export function parseProjectArchiveState(value: unknown): ProjectArchiveState {
  const parsed = v.safeParse(projectArchiveStateSchema, value);
  if (!parsed.success) throw new ProjectArchiveError("Invalid or out-of-bounds native project metadata");
  return parsed.output;
}

function decodeJson(bytes: Uint8Array, max: number): unknown {
  if (bytes.byteLength > max) throw new ProjectArchiveError("Project JSON exceeds its size limit", 413);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    throw new ProjectArchiveError("Project archive contains invalid UTF-8 JSON");
  }
}

function validateProjectArchiveGraph(project: ProjectArchiveState, payloads: ReadonlyMap<string, Uint8Array>): void {
  validateProjectPaths(project);
  validateProjectAliases(project);
  validateProjectRelationships(project, validateProjectIdentities(project));
  validateProjectBinaries(project, payloads);
}

function collectionIds(items: readonly { readonly id: string }[]): Set<string> {
  const ids = new Set(items.map(({ id }) => id));
  if (ids.size !== items.length) throw new ProjectArchiveError("Duplicate project resource identities");
  return ids;
}

function validateProjectIdentities(project: ProjectArchiveState) {
  const files = collectionIds(project.files),
    pdfs = collectionIds(project.pdfs),
    claims = collectionIds(project.claims),
    annotations = collectionIds(project.annotations);
  for (const items of [
    project.assets,
    project.folders,
    project.projectReferences,
    project.publications,
    project.links,
    project.claimLinks,
    project.claimEvidenceLinks,
    project.comments,
    project.researchShares,
    project.publicationPdfLinks,
  ])
    collectionIds(items);
  const publications = new Set([
    ...project.publications.map(({ id }) => id),
    ...project.projectReferences.map(({ referenceId }) => referenceId),
  ]);
  const references = new Set(project.projectReferences.map(({ referenceId }) => referenceId));
  if (!files.has(project.entryFileId) || references.size !== project.projectReferences.length)
    throw new ProjectArchiveError("Invalid project entry or reference identity");
  return { files, pdfs, claims, annotations, publications };
}

function validateProjectPaths(project: ProjectArchiveState): void {
  const paths = new Set<string>();
  for (const item of [...project.files, ...project.assets, ...project.folders]) {
    if (
      normalizeProjectPath(item.path) !== item.path ||
      item.path.includes("\\") ||
      item.path.split("/").length > 64 ||
      paths.has(item.path.toLowerCase())
    )
      throw new ProjectArchiveError("Invalid or duplicate project path");
    paths.add(item.path.toLowerCase());
  }
  const leafPaths = new Set([...project.files, ...project.assets].map(({ path }) => path.toLowerCase()));
  validateNestedPaths(paths, leafPaths);
  if (project.files.some(({ path }) => !path.endsWith(".md"))) throw new ProjectArchiveError("Project text files must use Markdown paths");
}

function validateNestedPaths(paths: ReadonlySet<string>, leafPaths: ReadonlySet<string>): void {
  for (const path of paths) {
    const parts = path.split("/");
    for (let end = 1; end < parts.length; end++)
      if (leafPaths.has(parts.slice(0, end).join("/"))) throw new ProjectArchiveError("Project paths cannot nest beneath a file");
  }
}

function validateProjectAliases(project: ProjectArchiveState): void {
  const aliases = new Set<string>();
  for (const reference of project.projectReferences) {
    const key = reference.citationAlias.toLowerCase();
    if (!isValidCitationKey(reference.citationAlias) || aliases.has(key) || reference.snapshot.referenceId !== reference.referenceId)
      throw new ProjectArchiveError("Invalid or duplicate project citation alias");
    aliases.add(key);
  }
}

function requireLink(condition: boolean): void {
  if (!condition) throw new ProjectArchiveError("Project relationship points to a missing resource");
}

function uniquePairs(pairs: readonly string[]): void {
  if (new Set(pairs).size !== pairs.length) throw new ProjectArchiveError("Duplicate project relationships");
}

function validateProjectRelationships(project: ProjectArchiveState, identities: ReturnType<typeof validateProjectIdentities>): void {
  const { pdfs, claims, annotations, publications } = identities;
  uniquePairs(project.publicationPdfLinks.map((link) => JSON.stringify([link.publicationId, link.pdfId])));
  uniquePairs(project.claimEvidenceLinks.map((link) => JSON.stringify([link.claimId, link.annotationId])));
  for (const annotation of project.annotations) {
    requireLink(pdfs.has(annotation.pdfId));
    collectionIds(annotation.fragments);
  }
  for (const link of project.publicationPdfLinks) requireLink(pdfs.has(link.pdfId) && publications.has(link.publicationId));
  for (const link of project.claimEvidenceLinks) requireLink(claims.has(link.claimId) && annotations.has(link.annotationId));
  for (const link of project.links) requireLink(annotations.has(link.annotationId));
  for (const link of project.claimLinks) requireLink(claims.has(link.claimId));
  validateProjectAnchors(project);
  if (new Set(project.reviewArtifactPins.map(({ path }) => path)).size !== project.reviewArtifactPins.length)
    throw new ProjectArchiveError("Duplicate pinned review paths");
  for (const pin of project.reviewArtifactPins) requireLink(project.files.some(({ path }) => path === pin.path));
}

function validateProjectAnchors(project: ProjectArchiveState): void {
  for (const item of [...project.links, ...project.claimLinks, ...project.comments]) {
    const file = project.files.find(({ id }) => id === item.anchor.fileId);
    if (item.resolution.status === "resolved")
      requireLink(Boolean(file && file.content.slice(item.resolution.start, item.resolution.end) === item.resolution.text));
  }
}

type BinaryValidator = (key: string, size?: number) => Uint8Array;

function requirePdfSignature(bytes: Uint8Array): void {
  if (!new TextDecoder().decode(bytes.subarray(0, 5)).startsWith("%PDF-")) throw new ProjectArchiveError("Invalid project PDF signature");
}

function validateProjectBinaries(project: ProjectArchiveState, payloads: ReadonlyMap<string, Uint8Array>): void {
  const usedPayloads = new Set<string>(["project.json"]);
  const checkBinary = (key: string, size?: number): Uint8Array => {
    const bytes = payloads.get(key);
    if (!/^payloads\/\d+\.bin$/u.test(key) || !bytes || (size !== undefined && bytes.byteLength !== size))
      throw new ProjectArchiveError("Missing or invalid project binary payload");
    usedPayloads.add(key);
    return bytes;
  };
  for (const asset of project.assets) {
    const bytes = checkBinary(asset.objectKey, asset.size);
    if (!hasProjectImageSignature(asset.mediaType, bytes) || (asset.mediaType === "image/svg+xml" && !isInertSvgImage(bytes)))
      throw new ProjectArchiveError("Invalid or unsafe project image");
  }
  for (const pdf of project.pdfs) requirePdfSignature(checkBinary(pdf.objectKey, pdf.size));
  const publications = new Set([
    ...project.publications.map(({ id }) => id),
    ...project.projectReferences.map(({ referenceId }) => referenceId),
  ]);
  for (const share of project.researchShares) {
    requireLink(share.projectId === project.id && publications.has(share.referenceId) && share.kind === share.content.kind);
    validateSharedBinaries(share, checkBinary);
  }
  if ([...payloads.keys()].some((key) => key !== "manifest.json" && !usedPayloads.has(key)))
    throw new ProjectArchiveError("Unreferenced project binary payload");
}

function validateSharedBinaries(share: ProjectArchiveState["researchShares"][number], checkBinary: BinaryValidator): void {
  if (share.revokedAt !== null) {
    if (
      (share.content.kind === "artifact" && share.content.objectKey) ||
      (share.content.kind === "web-snapshot" && (share.content.rawObjectKey || share.content.readableObjectKey))
    )
      throw new ProjectArchiveError("Revoked research cannot carry binary access");
    return;
  }
  if (share.content.kind === "artifact") requirePdfSignature(checkBinary(share.content.objectKey, share.content.size));
  if (share.content.kind === "web-snapshot") {
    if (share.content.rawObjectKey) checkBinary(share.content.rawObjectKey);
    if (share.content.readableObjectKey) checkBinary(share.content.readableObjectKey);
  }
}

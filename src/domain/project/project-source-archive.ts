import { LatexArchiveFailure } from "../../lib/paper-import/latex-archive";
import { extractSourceArchive } from "./project-source-zip";
import { parseBibTeX, projectBibTeXPublication } from "../reference-library/bibliography";
import { sha256Bytes } from "../sha256";
import { defaultProjectPublicationProfile } from "../workspace/workspace";
import {
  inspectProjectArchive,
  parseProjectArchiveState,
  projectArchiveSummary,
  ProjectArchiveError,
  validateProjectArchiveGraph,
  type ProjectArchiveInspection,
} from "./project-archive";
import { projectArchiveSchemaVersion, type ProjectArchiveManifest, type ProjectArchiveState } from "./project-archive-schema";
import type { ProjectImageMediaType } from "./project-files";

export interface ProjectSourceSelection {
  readonly entryPath?: string;
  readonly bibliographyPath?: string;
  readonly includePdfs?: boolean;
}
export interface ProjectSourceSummary {
  readonly entryCandidates: readonly string[];
  readonly bibliographyCandidates: readonly string[];
  readonly bibliographyPath: string;
  readonly includePdfs: boolean;
  readonly skippedEntries: number;
}
export type ProjectSourceArchiveInspection = Omit<Extract<ProjectArchiveInspection, { kind: "native" }>, "kind"> & {
  readonly kind: "source";
  readonly source: ProjectSourceSummary;
};
export type ProjectImportArchiveInspection = ProjectArchiveInspection | ProjectSourceArchiveInspection;
const imageTypes: Readonly<Record<string, ProjectImageMediaType>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};
const ignoredDirectories = new Set(["node_modules", ".git", "__MACOSX", ".svn", ".hg"]);
const at = "1980-01-01T00:00:00.000Z";

export async function inspectProjectImportArchive(
  bytes: Uint8Array,
  selection: ProjectSourceSelection = {},
): Promise<ProjectImportArchiveInspection> {
  let archive;
  try {
    archive = extractSourceArchive(bytes, (path) => includeSourcePath(path) && (selection.includePdfs !== false || !path.endsWith(".pdf")));
  } catch (error) {
    if (error instanceof LatexArchiveFailure)
      throw new ProjectArchiveError(error.message.replaceAll("LaTeX", "Project"), error.code.includes("size") ? 413 : 400);
    throw error;
  }
  // A declared native archive always takes the strict integrity-validation path.
  if (archive.files.has("manifest.json") || archive.files.has("project/project-snapshot.json")) return await inspectProjectArchive(bytes);
  const paths = [...archive.files.keys()].sort();
  // Choices must not change the inferred root or invalidate an already selected entry.
  const prefix = commonWrapper(archive.entryPaths.filter(includeSourcePath));
  const files = new Map(paths.map((path) => [path.slice(prefix.length), archive.files.get(path)!]));
  const entryCandidates = [...files.keys()].filter((path) => path.endsWith(".md"));
  if (!entryCandidates.length) throw new ProjectArchiveError("This ZIP contains no Markdown files. Use Import LaTeX for a LaTeX project.");
  const entryPath = selection.entryPath ?? suggestedEntry(entryCandidates);
  if (!entryCandidates.includes(entryPath)) throw new ProjectArchiveError("Choose an entry file present in the source archive");
  const bibliographyCandidates = [...files.keys()].filter((path) => path.endsWith(".bib"));
  const bibliographyPath =
    selection.bibliographyPath ?? bibliographyCandidates.find((path) => path === "bibliography.bib") ?? bibliographyCandidates[0] ?? "";
  if (bibliographyPath && !bibliographyCandidates.includes(bibliographyPath))
    throw new ProjectArchiveError("Choose a bibliography present in the source archive");
  const source: ProjectSourceSummary = {
    entryCandidates,
    bibliographyCandidates,
    bibliographyPath,
    includePdfs: selection.includePdfs !== false,
    skippedEntries: archive.skippedEntries,
  };
  const hash = await sha256Bytes(bytes);
  const { project, payloads } = sourceProject(files, source, entryPath, hash, prefix);
  const projectBytes = new TextEncoder().encode(JSON.stringify(project));
  if (projectBytes.byteLength > 10 * 1024 * 1024) throw new ProjectArchiveError("Project metadata exceeds 10 MiB", 413);
  payloads.set("project.json", projectBytes);
  if ([...payloads.values()].reduce((sum, value) => sum + value.byteLength, 0) > 20 * 1024 * 1024)
    throw new ProjectArchiveError("Imported project content exceeds 20 MiB", 413);
  validateProjectArchiveGraph(project, payloads);
  const exclusions = [
    `${source.skippedEntries} ZIP entries skipped: dependency folders, version control, macOS metadata, directories, unsupported files and omitted PDFs`,
    "Project history, comments and collaboration settings start fresh",
    ...(!source.includePdfs ? ["Bundled PDFs omitted by your selection"] : []),
  ];
  const manifest: ProjectArchiveManifest = {
    schemaVersion: projectArchiveSchemaVersion,
    scope: "current-project",
    sourceProjectId: project.id,
    sourceRevision: 0,
    exclusions,
    payloads: [],
  };
  for (const [path, content] of payloads)
    manifest.payloads.push({ id: path, path, bytes: content.byteLength, sha256: await sha256Bytes(content) });
  return { kind: "source", project, payloads, manifest, summary: projectArchiveSummary(project, exclusions), archiveSha256: hash, source };
}

function includeSourcePath(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((part) => ignoredDirectories.has(part) || part.startsWith("._")) || parts.at(-1) === ".DS_Store") return false;
  return (
    /\.(?:md|bib|pdf|png|jpe?g|gif|webp|avif|svg)$/u.test(path) ||
    path === "manifest.json" ||
    path === "project.json" ||
    path === "project/project-snapshot.json" ||
    /^payloads\/\d+\.bin$/u.test(path)
  );
}
function commonWrapper(paths: readonly string[]): string {
  const first = paths[0]?.split("/")[0];
  return first && paths.every((path) => path.startsWith(`${first}/`)) ? `${first}/` : "";
}
function suggestedEntry(paths: readonly string[]): string {
  return ["manuscript.md", "main.md", "paper.md", "index.md", "README.md", "readme.md"].find((path) => paths.includes(path)) ?? paths[0]!;
}
function text(bytes: Uint8Array, path: string): string {
  if (bytes.byteLength > 2 * 1024 * 1024) throw new ProjectArchiveError(`Source text file exceeds 2 MiB: ${path}`, 413);
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new ProjectArchiveError(`Source text file must be UTF-8: ${path}`);
  }
}
function sourceProject(
  files: ReadonlyMap<string, Uint8Array>,
  source: ProjectSourceSummary,
  entryPath: string,
  hash: string,
  prefix: string,
): { project: ProjectArchiveState; payloads: Map<string, Uint8Array> } {
  const payloads = new Map<string, Uint8Array>();
  const pointer = (bytes: Uint8Array): string => {
    const key = `payloads/${payloads.size}.bin`;
    payloads.set(key, bytes);
    return key;
  };
  const markdown = source.entryCandidates.map((path, index) => ({
    id: `file-${index}`,
    path,
    mediaType: "text/markdown" as const,
    content: text(files.get(path)!, path),
    createdAt: at,
    updatedAt: at,
  }));
  const entry = markdown.find((file) => file.path === entryPath)!;
  const bibliography = source.bibliographyPath ? text(files.get(source.bibliographyPath)!, source.bibliographyPath) : "";
  const projectReferences = parseBibTeX(bibliography).map((entry, index) => {
    const projection = projectBibTeXPublication(entry);
    const referenceId = `reference-${index}`;
    return {
      id: `link-${index}`,
      referenceId,
      citationAlias: projection.citationKey,
      snapshot: {
        referenceId,
        type: projection.type,
        title: projection.title,
        authors: [...projection.authors],
        year: projection.year,
        venue: projection.venue,
        doi: projection.doi,
        url: projection.url,
        capturedAt: at,
        tombstone: false,
        webSnapshot: null,
      },
      createdAt: at,
      updatedAt: at,
    };
  });
  const assets: ProjectArchiveState["assets"] = [];
  const pdfs: ProjectArchiveState["pdfs"] = [];
  for (const [path, bytes] of files) {
    const mediaType = imageTypes[path.split(".").at(-1) ?? ""];
    if (mediaType)
      assets.push({
        id: `image-${assets.length}`,
        path,
        mediaType,
        size: bytes.byteLength,
        objectKey: pointer(bytes),
        fingerprint: "source",
        createdAt: at,
        updatedAt: at,
      });
    if (source.includePdfs && path.endsWith(".pdf"))
      pdfs.push({
        id: `pdf-${pdfs.length}`,
        name: path,
        contentType: "application/pdf",
        size: bytes.byteLength,
        objectKey: pointer(bytes),
        fingerprint: "source",
        createdAt: at,
      });
  }
  const folderPaths = new Set<string>();
  for (const { path } of [...markdown, ...assets]) {
    const parts = path.split("/");
    for (let count = 1; count < parts.length; count++) folderPaths.add(parts.slice(0, count).join("/"));
  }
  const heading = /^#\s+(.+)$/mu.exec(entry.content)?.[1]?.trim();
  const title = (heading || prefix.slice(0, -1) || entryPath.replace(/\.md$/u, "")).slice(0, 120);
  const project = parseProjectArchiveState({
    id: `source-${hash.slice(0, 32)}`,
    title,
    revision: 0,
    entryFileId: entry.id,
    files: markdown,
    folders: [...folderPaths].sort().map((path, index) => ({ id: `folder-${index}`, path, createdAt: at, updatedAt: at })),
    bibliography,
    publicationProfile: defaultProjectPublicationProfile,
    assets,
    pdfs,
    publications: [],
    projectReferences,
    researchShares: [],
    publicationPdfLinks: [],
    annotations: [],
    links: [],
    claims: [],
    claimEvidenceLinks: [],
    claimLinks: [],
    comments: [],
    reviewArtifactPins: [],
  });
  return { project, payloads };
}

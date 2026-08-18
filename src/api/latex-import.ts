import { adaptLatexProjectToSeed } from "../domain/project/latex-project-adapter";
import {
  inspectLatexArchive,
  LatexArchiveFailure,
  latexArchiveMaximumCompressedBytes,
  type LatexArchiveInspection,
} from "../domain/manuscript/latex-import";
import { isProjectTemplateSeed } from "../domain/project/project-templates";
import { hasProjectImageSignature } from "../domain/project/project-image-signatures";
import { isSha256Hex, sha256Bytes } from "../domain/sha256";
import { isCreateWorkspaceInput, type ProjectAsset } from "../domain/workspace/workspace";
import {
  convertLatexProject,
  createLatexPreviewIdentity,
  digestLatexPreviewIdentity,
  LatexConversionError,
  type LatexProjectConversion,
} from "../lib/paper-import";
import type { AuthIdentity } from "../security/auth";
import { readBoundedRequestBytes } from "./request-body";

const supportedArchiveTypes = new Set(["application/zip", "application/x-zip-compressed"]);
type LatexConversion = ReturnType<typeof adaptLatexProjectToSeed>;

export async function handleLatexImportApi(request: Request, env: Env, identity: AuthIdentity): Promise<Response> {
  const url = new URL(request.url);
  const preview = url.pathname === "/api/latex-import-previews";
  const requestError = validateImportRequest(request, url);
  if (requestError) return requestError;

  try {
    const bytes = await readLatexArchiveBytes(request);
    const inspection = await inspectLatexArchive(bytes);
    const archiveSha256 = await sha256Bytes(bytes);
    const rootPath = url.searchParams.get("root") ?? inspection.selectedRoot;
    const bibliographyPath = url.searchParams.get("bibliography") ?? undefined;

    if (preview) return await previewImport(bytes, inspection, archiveSha256, rootPath, bibliographyPath);
    return await confirmImport(url, bytes, inspection, archiveSha256, rootPath, bibliographyPath, env, identity);
  } catch (error) {
    const response = importFailureResponse(error);
    if (response) return response;
    throw error;
  }
}

async function readLatexArchiveBytes(request: Request): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  return await readBoundedRequestBytes(request.body, {
    maximumBytes: latexArchiveMaximumCompressedBytes,
    tooLarge: () => new LatexArchiveFailure("archive-size", "LaTeX archive must be between 1 byte and 20 MiB"),
    preserveLimitErrorOnCancelFailure: true,
  });
}

function validateImportRequest(request: Request, url: URL): Response | null {
  if (url.pathname !== "/api/latex-import-previews" && url.pathname !== "/api/latex-imports") {
    return jsonError("LaTeX import route not found", 404, "route-not-found");
  }
  if (request.method !== "POST") return jsonError("Method not allowed", 405, "method-not-allowed");
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase();
  if (!mediaType || !supportedArchiveTypes.has(mediaType)) {
    return jsonError("LaTeX import requires a ZIP archive", 415, "archive-media-type");
  }
  const declaredSize = Number(request.headers.get("content-length") ?? "0");
  return Number.isFinite(declaredSize) && declaredSize > latexArchiveMaximumCompressedBytes
    ? jsonError("LaTeX archive exceeds 20 MiB", 413, "archive-size")
    : null;
}

function importFailureResponse(error: unknown): Response | null {
  if (error instanceof LatexArchiveFailure) return jsonError(error.message, archiveFailureStatus(error), error.code);
  if (error instanceof LatexConversionError) return jsonError(error.message, 400, error.code);
  if (error instanceof SyntaxError) return jsonError("Invalid LaTeX import request", 400, "invalid-request");
  return null;
}

async function previewImport(
  archive: Uint8Array,
  inspection: LatexArchiveInspection,
  archiveSha256: string,
  rootPath: string | null,
  bibliographyPath: string | undefined,
): Promise<Response> {
  const neutralConversion = rootPath ? convertLatexProject(inspection, conversionSelection(rootPath, bibliographyPath)) : null;
  const previewDigest = neutralConversion ? conversionPreviewDigest(archive, inspection, neutralConversion) : null;
  const conversion = neutralConversion ? adaptLatexProjectToSeed(neutralConversion) : null;
  return Response.json(
    {
      archiveSha256,
      previewDigest,
      archive: publicInspection(inspection),
      conversion: conversion ? publicConversion(conversion) : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

async function confirmImport(
  url: URL,
  archive: Uint8Array,
  inspection: LatexArchiveInspection,
  archiveSha256: string,
  rootPath: string | null,
  bibliographyPath: string | undefined,
  env: Env,
  identity: AuthIdentity,
): Promise<Response> {
  const title = url.searchParams.get("title") ?? "";
  const expectedArchiveSha256 = url.searchParams.get("archiveSha256") ?? "";
  const previewDigest = url.searchParams.get("previewDigest") ?? "";
  if (!isCreateWorkspaceInput({ title }) || !rootPath || !isSha256Hex(expectedArchiveSha256) || !isSha256Hex(previewDigest)) {
    return jsonError("Invalid LaTeX import confirmation", 400, "invalid-confirmation");
  }
  if (archiveSha256 !== expectedArchiveSha256) return jsonError("LaTeX archive changed after preview", 409, "archive-changed");

  const neutralConversion = convertLatexProject(inspection, conversionSelection(rootPath, bibliographyPath));
  if (conversionPreviewDigest(archive, inspection, neutralConversion) !== previewDigest) {
    return jsonError("LaTeX conversion changed after preview", 409, "preview-changed");
  }
  const conversion = adaptLatexProjectToSeed(neutralConversion);
  const conversionError = validateConversion(conversion);
  if (conversionError) return conversionError;
  return await createImportedWorkspace(env, identity, title.trim(), conversion);
}

function conversionSelection(rootPath: string, bibliographyPath: string | undefined) {
  return { rootPath, ...(bibliographyPath ? { bibliographyPath } : {}) };
}

function validateConversion(conversion: LatexConversion): Response | null {
  if (conversion.report.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return Response.json(
      { error: "LaTeX conversion has blocking diagnostics", code: "conversion-blocked", conversion: publicConversion(conversion) },
      { status: 422, headers: { "cache-control": "no-store" } },
    );
  }
  if (!isProjectTemplateSeed(conversion.seed)) return jsonError("Converted project exceeds project bounds", 422, "invalid-seed");
  const invalidAsset = conversion.assets.find(
    (asset) =>
      asset.bytes.byteLength <= 0 || asset.bytes.byteLength > 20 * 1024 * 1024 || !hasProjectImageSignature(asset.mediaType, asset.bytes),
  );
  return invalidAsset ? jsonError(`Converted figure is invalid: ${invalidAsset.path}`, 422, "invalid-asset") : null;
}

async function createImportedWorkspace(env: Env, identity: AuthIdentity, title: string, conversion: LatexConversion): Promise<Response> {
  const id = crypto.randomUUID();
  const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
  const access = env.WORKSPACE_ACCESS.getByName(id);
  await access.initializeOwner(identity.email);
  const room = env.DOCUMENT_ROOMS.getByName(id);
  const storedAssets: ProjectAsset[] = [];
  try {
    for (const asset of conversion.assets) storedAssets.push(await storeAsset(env, id, asset));
    await room.seedFromTemplate(id, title, conversion.seed);
    for (const asset of storedAssets) await room.registerProjectAsset(id, asset);
    const workspace = await catalog.registerWorkspace(id, title);
    return Response.json({ workspace, report: conversion.report }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    await Promise.all(storedAssets.map(async (asset) => await env.PAPERS.delete(asset.objectKey)));
    throw error;
  }
}

function publicInspection(inspection: LatexArchiveInspection) {
  return {
    files: inspection.files.map((file) => ({ path: file.path, kind: file.kind, bytes: file.bytes.byteLength })),
    rootCandidates: inspection.rootCandidates,
    selectedRoot: inspection.selectedRoot,
    includes: inspection.includes,
    bibliographies: inspection.bibliographies,
    diagnostics: inspection.diagnostics,
  };
}

function publicConversion(conversion: LatexConversion) {
  return {
    seed: conversion.seed,
    assets: conversion.assets.map((asset) => ({ path: asset.path, mediaType: asset.mediaType, bytes: asset.bytes.byteLength })),
    report: conversion.report,
  };
}

function conversionPreviewDigest(archive: Uint8Array, inspection: LatexArchiveInspection, conversion: LatexProjectConversion): string {
  return digestLatexPreviewIdentity(
    createLatexPreviewIdentity({
      archive,
      files: inspection.files,
      conversion,
    }),
  );
}

async function storeAsset(env: Env, workspaceId: string, asset: LatexConversion["assets"][number]): Promise<ProjectAsset> {
  const id = crypto.randomUUID();
  const objectKey = `${workspaceId}/assets/${id}`;
  const stored = await env.PAPERS.put(objectKey, asset.bytes, { httpMetadata: { contentType: asset.mediaType } });
  const now = new Date().toISOString();
  return {
    id,
    path: asset.path,
    mediaType: asset.mediaType,
    size: asset.bytes.byteLength,
    objectKey,
    fingerprint: `r2-etag:${stored.etag.replaceAll('"', "")}`,
    createdAt: now,
    updatedAt: now,
  };
}

function archiveFailureStatus(error: LatexArchiveFailure): number {
  if (error.code === "archive-size" || error.code === "archive-expanded-size" || error.code === "archive-text-size") return 413;
  if (error.code === "archive-unsupported-compression") return 415;
  return 400;
}

function jsonError(error: string, status: number, code: string): Response {
  return Response.json({ error, code }, { status, headers: { "cache-control": "no-store" } });
}

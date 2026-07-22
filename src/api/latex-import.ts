import { convertLatexInspection, LatexConversionError } from "../domain/latex-converter";
import {
  inspectLatexArchive,
  LatexArchiveFailure,
  latexArchiveMaximumCompressedBytes,
  type LatexArchiveInspection,
} from "../domain/latex-import";
import { isProjectTemplateSeed } from "../domain/project-templates";
import { hasProjectImageSignature } from "../domain/project-image-signatures";
import { isCreateWorkspaceInput, type ProjectAsset } from "../domain/workspace";
import type { AuthIdentity } from "../security/auth";

const supportedArchiveTypes = new Set(["application/zip", "application/x-zip-compressed"]);
type LatexConversion = ReturnType<typeof convertLatexInspection>;

export async function handleLatexImportApi(request: Request, env: Env, identity: AuthIdentity): Promise<Response> {
  const url = new URL(request.url);
  const preview = url.pathname === "/api/latex-import-previews";
  const requestError = validateImportRequest(request, url);
  if (requestError) return requestError;

  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const digest = await archiveDigest(bytes);
    const inspection = await inspectLatexArchive(bytes);
    const rootPath = url.searchParams.get("root") ?? inspection.selectedRoot;
    const bibliographyPath = url.searchParams.get("bibliography") ?? undefined;

    if (preview) return previewImport(inspection, digest, rootPath, bibliographyPath);
    return await confirmImport(url, inspection, digest, rootPath, bibliographyPath, env, identity);
  } catch (error) {
    const response = importFailureResponse(error);
    if (response) return response;
    throw error;
  }
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

function previewImport(
  inspection: LatexArchiveInspection,
  digest: string,
  rootPath: string | null,
  bibliographyPath: string | undefined,
): Response {
  const conversion = rootPath ? convertLatexInspection(inspection, conversionOptions(rootPath, bibliographyPath)) : null;
  return Response.json(
    { digest, archive: publicInspection(inspection), conversion: conversion ? publicConversion(conversion) : null },
    { headers: { "cache-control": "no-store" } },
  );
}

async function confirmImport(
  url: URL,
  inspection: LatexArchiveInspection,
  digest: string,
  rootPath: string | null,
  bibliographyPath: string | undefined,
  env: Env,
  identity: AuthIdentity,
): Promise<Response> {
  const title = url.searchParams.get("title") ?? "";
  const previewDigest = url.searchParams.get("previewDigest") ?? "";
  if (!isCreateWorkspaceInput({ title }) || !rootPath || !/^[a-f0-9]{64}$/u.test(previewDigest)) {
    return jsonError("Invalid LaTeX import confirmation", 400, "invalid-confirmation");
  }
  if (digest !== previewDigest) return jsonError("LaTeX archive changed after preview", 409, "archive-changed");

  const conversion = convertLatexInspection(inspection, conversionOptions(rootPath, bibliographyPath));
  const conversionError = validateConversion(conversion);
  if (conversionError) return conversionError;
  return await createImportedWorkspace(env, identity, title.trim(), conversion);
}

function conversionOptions(rootPath: string, bibliographyPath: string | undefined) {
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

async function archiveDigest(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function archiveFailureStatus(error: LatexArchiveFailure): number {
  if (error.code === "archive-size" || error.code === "archive-expanded-size" || error.code === "archive-text-size") return 413;
  if (error.code === "archive-unsupported-compression") return 415;
  return 400;
}

function jsonError(error: string, status: number, code: string): Response {
  return Response.json({ error, code }, { status, headers: { "cache-control": "no-store" } });
}

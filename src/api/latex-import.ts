import { convertLatexInspection, LatexConversionError } from "../domain/latex-converter";
import {
  inspectLatexArchive,
  LatexArchiveFailure,
  latexArchiveMaximumCompressedBytes,
  type LatexArchiveInspection,
} from "../domain/latex-import";
import { isProjectTemplateSeed } from "../domain/project-templates";
import { isCreateWorkspaceInput } from "../domain/workspace";
import type { AuthIdentity } from "../security/auth";

const supportedArchiveTypes = new Set(["application/zip", "application/x-zip-compressed"]);

export async function handleLatexImportApi(request: Request, env: Env, identity: AuthIdentity): Promise<Response> {
  const url = new URL(request.url);
  const preview = url.pathname === "/api/latex-import-previews";
  const confirmation = url.pathname === "/api/latex-imports";
  if (!preview && !confirmation) return jsonError("LaTeX import route not found", 404, "route-not-found");
  if (request.method !== "POST") return jsonError("Method not allowed", 405, "method-not-allowed");
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase();
  if (!mediaType || !supportedArchiveTypes.has(mediaType)) {
    return jsonError("LaTeX import requires a ZIP archive", 415, "archive-media-type");
  }
  const declaredSize = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredSize) && declaredSize > latexArchiveMaximumCompressedBytes) {
    return jsonError("LaTeX archive exceeds 20 MiB", 413, "archive-size");
  }

  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const digest = await archiveDigest(bytes);
    const inspection = await inspectLatexArchive(bytes);
    const rootPath = url.searchParams.get("root") ?? inspection.selectedRoot;
    const bibliographyPath = url.searchParams.get("bibliography") ?? undefined;

    if (preview) {
      const conversion = rootPath
        ? convertLatexInspection(inspection, { rootPath, ...(bibliographyPath ? { bibliographyPath } : {}) })
        : null;
      return Response.json({ digest, archive: publicInspection(inspection), conversion }, { headers: { "cache-control": "no-store" } });
    }

    const title = url.searchParams.get("title") ?? "";
    const previewDigest = url.searchParams.get("previewDigest") ?? "";
    if (!isCreateWorkspaceInput({ title }) || !rootPath || !/^[a-f0-9]{64}$/u.test(previewDigest)) {
      return jsonError("Invalid LaTeX import confirmation", 400, "invalid-confirmation");
    }
    if (digest !== previewDigest) return jsonError("LaTeX archive changed after preview", 409, "archive-changed");
    const conversion = convertLatexInspection(inspection, { rootPath, ...(bibliographyPath ? { bibliographyPath } : {}) });
    if (conversion.report.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      return Response.json(
        { error: "LaTeX conversion has blocking diagnostics", code: "conversion-blocked", conversion },
        { status: 422, headers: { "cache-control": "no-store" } },
      );
    }
    if (!isProjectTemplateSeed(conversion.seed)) return jsonError("Converted project exceeds project bounds", 422, "invalid-seed");

    const normalizedTitle = title.trim();
    const id = crypto.randomUUID();
    const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
    const access = env.WORKSPACE_ACCESS.getByName(id);
    await access.initializeOwner(identity.email);
    const room = env.DOCUMENT_ROOMS.getByName(id);
    await room.seedFromTemplate(id, normalizedTitle, conversion.seed);
    const workspace = await catalog.registerWorkspace(id, normalizedTitle);
    return Response.json({ workspace, report: conversion.report }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof LatexArchiveFailure) return jsonError(error.message, archiveFailureStatus(error), error.code);
    if (error instanceof LatexConversionError) return jsonError(error.message, 400, error.code);
    if (error instanceof SyntaxError) return jsonError("Invalid LaTeX import request", 400, "invalid-request");
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

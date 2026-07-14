import type { WorkspaceSnapshot } from "../domain/workspace";
import { buildExportBundle } from "../domain/export-pipeline";
import type { ProjectFileReplaceResult } from "../durable-objects/document-room";
import type { ResolvedEditShare } from "../durable-objects/workspace-access";
import { isSameOriginMutation } from "../security/auth";
import { renderEditSharePage } from "../views/edit-share";
import { renderNotFoundPage } from "../views/not-found";
import { htmlResponse, pdfResponse } from "../views/shared";
import { renderExportPdf } from "./export-artifacts";

const maximumEditSharePayloadBytes = 8_100_000;

interface EditShareAccessApi {
  resolveEditShare(token: string): Promise<ResolvedEditShare>;
}

interface EditShareRoomApi {
  fetch(request: Request): Promise<Response>;
  getSnapshot(workspaceId: string): Promise<WorkspaceSnapshot>;
  replaceProjectFileContent(
    workspaceId: string,
    fileId: string,
    content: string,
    expectedRevision: number,
  ): Promise<ProjectFileReplaceResult>;
}

export interface EditShareEnv {
  readonly WORKSPACE_ACCESS: { getByName(name: string): EditShareAccessApi };
  readonly DOCUMENT_ROOMS: { getByName(name: string): EditShareRoomApi };
}

export async function handleEditShareRequest(request: Request, env?: EditShareEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const match = /^\/edit\/([a-z0-9-]{1,64})\.([A-Za-z0-9_-]{43})(?:\/(snapshot|document\.pdf|socket|files\/([0-9a-f-]{36})))?$/u.exec(
    url.pathname,
  );
  if (!match?.[1] || !match[2]) return null;
  if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });

  const locator = match[1];
  const token = match[2];
  const resolved = await env.WORKSPACE_ACCESS.getByName(locator).resolveEditShare(token);
  if (!resolved.valid || !resolved.target) {
    return request.method === "GET"
      ? htmlResponse(renderNotFoundPage("/edit"), 404, url)
      : Response.json({ error: "Edit link not found" }, { status: 404 });
  }

  const room = env.DOCUMENT_ROOMS.getByName(resolved.target.storageKey);
  const editPath = `/edit/${locator}.${token}`;
  if (match[3] === "socket" && request.method === "GET") {
    if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin WebSocket denied" }, { status: 403 });
    const headers = new Headers(request.headers);
    headers.set("x-kirjolab-edit-presence", "1");
    return await room.fetch(new Request(request, { headers }));
  }
  const snapshot = await room.getSnapshot(resolved.target.workspaceId);
  if (!match[3] && request.method === "GET") {
    return htmlResponse(renderEditSharePage(snapshot, editPath, url.searchParams.get("file")), 200, url, {
      allowSameOriginFrames: true,
      crossOriginIsolated: false,
    });
  }
  if (match[3] === "snapshot" && request.method === "GET") return editShareSnapshotResponse(snapshot);
  if (match[3] === "document.pdf" && request.method === "GET") {
    return pdfResponse(await renderExportPdf(buildExportBundle(snapshot)));
  }
  if (match[4] && request.method === "PATCH") {
    return await editProjectFile(request, room, resolved.target.workspaceId, match[4]);
  }
  return Response.json({ error: "Edit link route not found" }, { status: 404 });
}

async function editProjectFile(request: Request, room: EditShareRoomApi, workspaceId: string, fileId: string): Promise<Response> {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin edit denied" }, { status: 403 });
  let body: unknown;
  try {
    body = await readBoundedJson(request, maximumEditSharePayloadBytes);
  } catch (error) {
    return Response.json(
      { error: error instanceof RangeError ? "Project file edit exceeds the size limit" : "Invalid project file edit" },
      { status: error instanceof RangeError ? 413 : 400 },
    );
  }
  if (
    !isRecord(body) ||
    typeof body.content !== "string" ||
    body.content.length > 2_000_000 ||
    typeof body.revision !== "number" ||
    !Number.isSafeInteger(body.revision)
  ) {
    return Response.json({ error: "Invalid project file edit" }, { status: 400 });
  }
  const result = await room.replaceProjectFileContent(workspaceId, fileId, body.content, body.revision);
  if (result.ok) return editShareSnapshotResponse(result.value);
  const status = result.code === "revision-conflict" ? 409 : result.code === "file-not-found" ? 404 : 400;
  return Response.json({ error: result.error }, { status });
}

function editShareSnapshotResponse(snapshot: WorkspaceSnapshot): Response {
  return Response.json(
    {
      title: snapshot.title,
      revision: snapshot.revision,
      entryFileId: snapshot.entryFileId,
      files: snapshot.files.map(({ id, path, content }) => ({ id, path, content })),
    },
    { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const declaredBytes = Number(request.headers.get("content-length") ?? "0");
  if (declaredBytes > maximumBytes) throw new RangeError("Request body exceeds the size limit");
  if (!request.body) throw new SyntaxError("Request body is empty");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    byteLength += result.value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel();
      throw new RangeError("Request body exceeds the size limit");
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
}

import type { WorkspaceSnapshot } from "../domain/workspace";
import { renderSharedEditorPage, resolveSharedEditorFile } from "./shared-editor";

export function resolveReadOnlyShareFile(
  snapshot: WorkspaceSnapshot,
  requestedFileId: string | null,
  legacyView: string | null = null,
) {
  const legacyFileId = legacyView?.startsWith("file:") ? legacyView.slice("file:".length) : null;
  return resolveSharedEditorFile(snapshot, requestedFileId ?? legacyFileId);
}

export function renderReadOnlySharePage(
  snapshot: WorkspaceSnapshot,
  sharePath: string,
  requestedFileId: string | null,
  legacyView: string | null = null,
): string {
  const activeFile = resolveReadOnlyShareFile(snapshot, requestedFileId, legacyView);
  return renderSharedEditorPage(snapshot, {
    mode: "read-only",
    path: sharePath,
    requestedFileId: activeFile.id,
    initialLayout: legacyView === "pdf" ? "pdf" : "split",
    ...(requestedFileId === null && legacyView === "markdown"
      ? { sourceOverride: { id: "composed-manuscript", path: "Composed manuscript", content: snapshot.composition.content } }
      : {}),
  });
}

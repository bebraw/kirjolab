import type { ProjectFile, WorkspaceSnapshot } from "../domain/workspace";
import { renderSharedEditorPage, resolveSharedEditorFile } from "./shared-editor";

export function resolveEditShareFile(snapshot: WorkspaceSnapshot, requestedFileId: string | null): ProjectFile {
  return resolveSharedEditorFile(snapshot, requestedFileId);
}

export function renderEditSharePage(snapshot: WorkspaceSnapshot, editPath: string, requestedFileId: string | null): string {
  return renderSharedEditorPage(snapshot, { mode: "edit", path: editPath, requestedFileId });
}

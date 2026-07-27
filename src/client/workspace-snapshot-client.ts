import type * as Y from "yjs";
import { resolveWorkspaceSnapshotAnchors } from "../domain/workspace-anchor-projection";
import { isWorkspaceSnapshot, type WorkspaceSnapshot } from "../domain/workspace";

type WorkspaceFetcher = (input: string) => Promise<Response>;

export class WorkspaceAccessError extends Error {}

export function parseWorkspaceSnapshot(value: unknown, invalidMessage: string): WorkspaceSnapshot {
  if (!isWorkspaceSnapshot(value)) throw new Error(invalidMessage);
  return value;
}

export async function loadWorkspaceSnapshot(
  apiBase: string,
  document: Y.Doc,
  projectAnchors: boolean,
  fetcher: WorkspaceFetcher = fetch,
): Promise<WorkspaceSnapshot> {
  const response = await fetcher(apiBase);
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new WorkspaceAccessError("Project access is no longer available");
  }
  if (!response.ok) throw new Error("Could not load the project");
  const snapshot = parseWorkspaceSnapshot(await response.json(), "Project returned an invalid snapshot");
  return projectAnchors ? resolveWorkspaceSnapshotAnchors(document, snapshot) : snapshot;
}

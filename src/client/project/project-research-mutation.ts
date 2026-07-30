import { isWorkspaceSnapshot, type WorkspaceSnapshot } from "../../domain/workspace/workspace";
import { expectOk, jsonFetch } from "../platform/http";
import { LightDomElement } from "../platform/light-dom-controller";

export const projectResearchChangedEvent = "project-research-changed";

export interface ProjectResearchChanged {
  readonly message: string;
  readonly snapshot: WorkspaceSnapshot;
}

export type ProjectResearchMutation =
  | { readonly action: "pin"; readonly referenceId: string; readonly snapshotId: string }
  | { readonly action: "revoke"; readonly shareId: string }
  | {
      readonly action: "share";
      readonly kind: "note" | "highlight" | "web-snapshot";
      readonly referenceId: string;
      readonly resourceId: string;
    };

export abstract class ProjectResearchMutationElement extends LightDomElement {
  protected async changeProjectResearch(apiBase: string, mutation: ProjectResearchMutation): Promise<void> {
    const snapshot = await this.requestProjectResearchMutation(apiBase, mutation);
    const message =
      mutation.action === "pin"
        ? "This exact web capture is pinned to the project."
        : mutation.action === "share"
          ? "Private research snapshot shared explicitly with this project."
          : "Share revoked for future project access; prior revision history remains intact.";
    this.dispatchEvent(
      new CustomEvent<ProjectResearchChanged>(projectResearchChangedEvent, {
        bubbles: true,
        composed: true,
        detail: { message, snapshot },
      }),
    );
  }

  protected requestProjectResearchMutation(apiBase: string, mutation: ProjectResearchMutation): Promise<WorkspaceSnapshot> {
    return mutateProjectResearch(apiBase, mutation);
  }
}

export async function mutateProjectResearch(apiBase: string, mutation: ProjectResearchMutation): Promise<WorkspaceSnapshot> {
  const response =
    mutation.action === "pin"
      ? await jsonFetch(`${apiBase}/references/${encodeURIComponent(mutation.referenceId)}/web-snapshot`, {
          snapshotId: mutation.snapshotId,
        })
      : mutation.action === "share"
        ? await jsonFetch(`${apiBase}/research-shares`, mutation)
        : await fetch(`${apiBase}/research-shares/${encodeURIComponent(mutation.shareId)}`, {
            credentials: "same-origin",
            method: "DELETE",
          });
  await expectOk(response);
  const value: unknown = await response.json();
  if (!isWorkspaceSnapshot(value)) throw new Error("Project research mutation returned an invalid workspace");
  return value;
}

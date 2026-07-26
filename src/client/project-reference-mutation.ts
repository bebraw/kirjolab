import { LitElement } from "lit";
import { isWorkspaceSnapshot, type WorkspaceSnapshot } from "../domain/workspace";
import { expectOk, jsonFetch } from "./http";

export const projectReferenceChangedEvent = "project-reference-changed";

export interface ProjectReferenceChanged {
  readonly message: string;
  readonly snapshot: WorkspaceSnapshot;
}

export type ProjectReferenceMutation =
  | { readonly action: "link"; readonly citationAlias: string; readonly referenceId: string }
  | { readonly action: "unlink"; readonly referenceId: string };

export abstract class ProjectReferenceMutationElement extends LitElement {
  protected async changeProjectReference(apiBase: string, mutation: ProjectReferenceMutation): Promise<void> {
    const snapshot = await this.requestProjectReferenceMutation(apiBase, mutation);
    const message =
      mutation.action === "link"
        ? `Added :cite[${mutation.citationAlias.trim()}] to this project's reference set.`
        : "Reference removed from this project; the private library record remains.";
    this.dispatchEvent(
      new CustomEvent<ProjectReferenceChanged>(projectReferenceChangedEvent, {
        bubbles: true,
        composed: true,
        detail: { message, snapshot },
      }),
    );
  }

  protected requestProjectReferenceMutation(apiBase: string, mutation: ProjectReferenceMutation): Promise<WorkspaceSnapshot> {
    return mutateProjectReference(apiBase, mutation);
  }
}

export async function mutateProjectReference(apiBase: string, mutation: ProjectReferenceMutation): Promise<WorkspaceSnapshot> {
  const response =
    mutation.action === "link"
      ? await jsonFetch(`${apiBase}/references`, {
          referenceId: mutation.referenceId,
          citationAlias: mutation.citationAlias,
        })
      : await fetch(`${apiBase}/references/${encodeURIComponent(mutation.referenceId)}`, {
          credentials: "same-origin",
          method: "DELETE",
        });
  await expectOk(response);
  const value: unknown = await response.json();
  if (!isWorkspaceSnapshot(value)) throw new Error("Project reference mutation returned an invalid workspace");
  return value;
}

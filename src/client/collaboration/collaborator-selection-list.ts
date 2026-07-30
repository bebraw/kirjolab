import { html, type TemplateResult } from "lit";
import type { ServerCollaborationMessage } from "../../domain/collaboration";
import type { ProjectFile } from "../../domain/project/project-files";
import { LightDomElement } from "../platform/light-dom-controller";
import type { EditorPresenceRange } from "./editor-presence";
import { accessibleEvidenceExcerpt } from "../context/research-resource-presentation";

type RemoteSelection = Extract<ServerCollaborationMessage, { type: "selection" }>;

export interface CollaboratorSelectionListData {
  readonly files: readonly ProjectFile[];
  readonly revision: number;
}

export class CollaboratorSelectionList extends LightDomElement {
  static override properties = { data: { state: true } };

  declare private data: CollaboratorSelectionListData | null;
  private readonly selections = new Map<string, RemoteSelection>();
  private selectionChangedCallback: () => void = () => undefined;

  constructor() {
    super();
    this.data = null;
  }

  setData(data: CollaboratorSelectionListData): void {
    this.data = data;
    for (const [collaboratorId, selection] of this.selections) {
      if (selection.revision !== data.revision) this.selections.delete(collaboratorId);
    }
  }

  bindSelectionChanged(callback: () => void): void {
    this.selectionChangedCallback = callback;
  }

  receive(selection: RemoteSelection): void {
    if (selection.revision !== this.data?.revision) return;
    this.selections.set(selection.collaboratorId, selection);
    this.selectionChanged();
  }

  removeSelection(collaboratorId: string): void {
    if (!this.selections.delete(collaboratorId)) return;
    this.selectionChanged();
  }

  clear(): void {
    if (this.selections.size === 0) return;
    this.selections.clear();
    this.selectionChanged();
  }

  rangesFor(fileId: string | null): readonly EditorPresenceRange[] {
    const data = this.data;
    if (!data) return [];
    return [...this.selections.values()]
      .filter((selection) => selection.revision === data.revision && selection.fileId === fileId)
      .map(({ collaboratorId, end, start }) => ({ collaboratorId, end, start }));
  }

  protected override render(): TemplateResult {
    const data = this.data;
    if (!data) return html``;
    return html`${[...this.selections.values()]
      .filter((selection) => selection.revision === data.revision)
      .map((selection) => {
        const file = data.files.find((candidate) => candidate.id === selection.fileId);
        const selected = file?.content.slice(selection.start, selection.end).replaceAll(/\s+/gu, " ").trim() ?? "";
        const range = selection.start === selection.end ? `caret at ${selection.start}` : `selection ${selection.start}–${selection.end}`;
        const excerpt = selected ? ` · “${accessibleEvidenceExcerpt(selected)}”` : "";
        return html`<span class="mr-4 inline-block">Collaborator · ${file?.path ?? "project file"} · ${range}${excerpt}</span>`;
      })}`;
  }

  private selectionChanged(): void {
    this.requestUpdate();
    this.selectionChangedCallback();
  }
}

if (typeof customElements !== "undefined" && !customElements.get("collaborator-selection-list")) {
  customElements.define("collaborator-selection-list", CollaboratorSelectionList);
}

declare global {
  interface HTMLElementTagNameMap {
    "collaborator-selection-list": CollaboratorSelectionList;
  }
}

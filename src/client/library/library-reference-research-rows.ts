import { html, nothing, type TemplateResult } from "lit";
import type {
  BibliographicRecord,
  LibraryPdfArtifact,
  ReferenceLibrarySnapshot,
  ResearchShareSnapshot,
} from "../../domain/reference-library";
import "./library-reference-pdf-rows";
import { ProjectResearchMutationElement } from "../project/project-research-mutation";

export type LibraryReferenceResearchAction =
  | { readonly action: "capture"; readonly canonicalUrl: string }
  | { readonly action: "compare"; readonly currentId: string; readonly priorId: string };

export const libraryReferenceResearchActionEvent = "library-reference-research-action";

export interface LibraryReferenceResearchData {
  readonly artifacts: readonly LibraryPdfArtifact[];
  readonly canonicalUrl: string | null;
  readonly highlights: ReferenceLibrarySnapshot["highlights"];
  readonly linkedSnapshotId: string | null;
  readonly notes: ReferenceLibrarySnapshot["notes"];
  readonly projectApiBase: string | null;
  readonly reference: BibliographicRecord;
  readonly referenceLinked: boolean;
  readonly researchShares: readonly ResearchShareSnapshot[];
  readonly webSnapshots: ReferenceLibrarySnapshot["webSnapshots"];
}

export class LibraryReferenceResearchRows extends ProjectResearchMutationElement {
  static override properties = { data: { state: true } };

  declare private data: LibraryReferenceResearchData | null;

  constructor() {
    super();
    this.data = null;
  }

  setData(data: LibraryReferenceResearchData): void {
    this.data = data;
  }

  protected override render(): TemplateResult {
    const data = this.data;
    if (!data) return html``;
    const hasRows = data.notes.length + data.artifacts.length + data.highlights.length + data.webSnapshots.length > 0;
    return html`
      ${
        hasRows
          ? html`<div class="mt-3 space-y-2 border-t border-app-line pt-3">
              ${data.notes.map((note) => this.renderPrivateRow(data, "note", note.id, `Note · ${note.body.slice(0, 100)}`))}
              <library-reference-pdf-rows
                class="contents"
                .artifacts=${data.artifacts}
                .linked=${data.referenceLinked}
                .reference=${data.reference}
              ></library-reference-pdf-rows>
              ${data.highlights.map((highlight) =>
                this.renderPrivateRow(data, "highlight", highlight.id, `Highlight p. ${highlight.page} · ${highlight.quote.slice(0, 100)}`),
              )}
              ${
                data.canonicalUrl
                  ? data.webSnapshots.map((snapshot, index) => this.renderWebSnapshot(data, snapshot, data.webSnapshots[index + 1]))
                  : nothing
              }
            </div>`
          : nothing
      }
      ${
        data.canonicalUrl
          ? html`<button
              class="button-secondary mt-3"
              type="button"
              @click=${() => this.emitAction({ action: "capture", canonicalUrl: data.canonicalUrl! })}
            >
              Capture current version
            </button>`
          : nothing
      }
    `;
  }

  protected emitAction(action: LibraryReferenceResearchAction): void {
    this.dispatchEvent(
      new CustomEvent<LibraryReferenceResearchAction>(libraryReferenceResearchActionEvent, { bubbles: true, detail: action }),
    );
  }

  private renderPrivateRow(
    data: LibraryReferenceResearchData,
    kind: "note" | "highlight" | "web-snapshot",
    resourceId: string,
    label: string,
    content: TemplateResult | typeof nothing = nothing,
  ): TemplateResult {
    const share = data.researchShares.find((item) => item.kind === kind && item.resourceId === resourceId);
    return html`<div class="rounded-sm border border-app-line p-2">
      <p class="font-sans text-xs leading-5 text-app-text-soft">${label}</p>
      <button
        class="button-secondary mt-2"
        type="button"
        ?disabled=${!data.projectApiBase || (!share && !data.referenceLinked)}
        title=${data.referenceLinked ? "" : "Add the bibliographic reference to this project first"}
        @click=${() =>
          share
            ? void this.changeProjectResearch(data.projectApiBase!, { action: "revoke", shareId: share.id })
            : void this.changeProjectResearch(data.projectApiBase!, {
                action: "share",
                referenceId: data.reference.id,
                kind,
                resourceId,
              })}
      >
        ${share ? "Revoke project share" : "Share snapshot with project"}
      </button>
      ${content}
    </div>`;
  }

  private renderWebSnapshot(
    data: LibraryReferenceResearchData,
    snapshot: ReferenceLibrarySnapshot["webSnapshots"][number],
    prior: ReferenceLibrarySnapshot["webSnapshots"][number] | undefined,
  ): TemplateResult {
    const status = snapshot.complete ? "complete" : "incomplete";
    return this.renderPrivateRow(
      data,
      "web-snapshot",
      snapshot.id,
      `Web capture · ${formatTimestamp(snapshot.accessedAt)} · ${status}`,
      html`
        ${
          snapshot.diagnostics.length > 0
            ? html`<p class="mt-2 font-sans text-xs leading-5 text-app-text-soft">${snapshot.diagnostics.join(" ")}</p>`
            : nothing
        }
        <div class="mt-2 flex flex-wrap gap-2">
          ${
            snapshot.readableObjectKey
              ? html`<a class="button-secondary" href=${`/api/library/web-snapshots/${snapshot.id}/readable`}>Readable text</a>`
              : nothing
          }
          ${
            snapshot.rawObjectKey
              ? html`<a class="button-secondary" href=${`/api/library/web-snapshots/${snapshot.id}/raw`}>Raw capture</a>`
              : nothing
          }
          ${
            prior
              ? html`<button
                  class="button-secondary"
                  type="button"
                  @click=${() => this.emitAction({ action: "compare", priorId: prior.id, currentId: snapshot.id })}
                >
                  Compare with prior
                </button>`
              : nothing
          }
          ${
            data.referenceLinked
              ? html`<button
                  class="button-secondary"
                  type="button"
                  ?disabled=${data.linkedSnapshotId === snapshot.id}
                  title=${
                    data.linkedSnapshotId === snapshot.id
                      ? "This version is pinned to the project"
                      : "Pin this exact capture to future citations and milestones"
                  }
                  @click=${() =>
                    void this.changeProjectResearch(data.projectApiBase!, {
                      action: "pin",
                      referenceId: data.reference.id,
                      snapshotId: snapshot.id,
                    })}
                >
                  Use for project
                </button>`
              : nothing
          }
        </div>
      `,
    );
  }
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

if (typeof customElements !== "undefined" && !customElements.get("library-reference-research-rows")) {
  customElements.define("library-reference-research-rows", LibraryReferenceResearchRows);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-reference-research-rows": LibraryReferenceResearchRows;
  }
}

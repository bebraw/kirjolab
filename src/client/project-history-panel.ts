import { html, LitElement, nothing, type TemplateResult } from "lit";
import type { ProjectRevisionContent, ProjectRevisionDiff, ProjectRevisionSummary } from "../domain/project-history";
import type { ProjectHistoryOperation } from "./project-history-machine";

export const projectHistoryActionEvent = "project-history-action";
export const projectHistoryCloseEvent = "project-history-close";

type ProjectHistoryInspector =
  | { readonly kind: "revision"; readonly value: ProjectRevisionContent }
  | { readonly kind: "comparison"; readonly value: ProjectRevisionDiff };

export class ProjectHistoryPanel extends LitElement {
  static override properties = {
    busy: { state: true },
    fromRevision: { state: true },
    inspector: { state: true },
    revisions: { state: true },
    status: { state: true },
    toRevision: { state: true },
  };

  declare private busy: boolean;
  declare private fromRevision: string;
  declare private inspector: ProjectHistoryInspector | null;
  declare private revisions: readonly ProjectRevisionSummary[];
  declare private status: string;
  declare private toRevision: string;

  constructor() {
    super();
    this.busy = false;
    this.fromRevision = "";
    this.inspector = null;
    this.revisions = [];
    this.status = "Loading revision history…";
    this.toRevision = "";
  }

  showLoading(): void {
    this.status = "Loading revision history…";
  }

  showTimeline(revisions: readonly ProjectRevisionSummary[]): void {
    this.revisions = revisions;
    this.status = "";
    this.fromRevision = String(revisions[1]?.revision ?? revisions[0]?.revision ?? "");
    this.toRevision = String(revisions[0]?.revision ?? "");
  }

  showError(message: string): void {
    this.status = message;
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
  }

  showRevision(value: ProjectRevisionContent): void {
    this.inspector = { kind: "revision", value };
  }

  showComparison(value: ProjectRevisionDiff): void {
    this.inspector = { kind: "comparison", value };
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`
      <div class="p-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="eyebrow">Project record</p>
            <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Revision history</h2>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-app-text-soft">Browse, compare, restore, or branch from saved versions.</p>
          </div>
          <button class="button-secondary" id="close-project-history" type="button" @click=${this.close}>Close</button>
        </div>
        <form
          class="mt-5 grid gap-3 border-y border-app-line py-4 sm:grid-cols-[1fr_1fr_auto]"
          id="project-history-compare-form"
          @submit=${this.compare}
        >
          <label class="field-label"
            >From<select
              class="field"
              id="project-history-from"
              ?disabled=${this.busy}
              .value=${this.fromRevision}
              @change=${this.updateFromRevision}
            >
              ${this.revisionOptions()}
            </select></label
          >
          <label class="field-label"
            >To<select
              class="field"
              id="project-history-to"
              ?disabled=${this.busy}
              .value=${this.toRevision}
              @change=${this.updateToRevision}
            >
              ${this.revisionOptions()}
            </select></label
          >
          <div class="flex items-end">
            <button
              class="button-primary w-full justify-center"
              type="submit"
              ?disabled=${this.busy || !this.fromRevision || !this.toRevision}
            >
              Compare
            </button>
          </div>
        </form>
        ${this.inspector
          ? html`<section class="mt-5 border border-app-line bg-app-paper p-4" id="project-history-inspector" aria-live="polite">
              ${this.renderInspector(this.inspector)}
            </section>`
          : html`<section
              class="mt-5 hidden border border-app-line bg-app-paper p-4"
              id="project-history-inspector"
              aria-live="polite"
            ></section>`}
        <div class="mt-5 space-y-3" id="project-history-list">
          ${this.status
            ? html`<p class="ui-status">${this.status}</p>`
            : this.revisions.map((revision, index) => this.revisionCard(revision, index === 0))}
        </div>
      </div>
    `;
  }

  protected close(): void {
    this.dispatchEvent(new CustomEvent(projectHistoryCloseEvent, { bubbles: true, composed: true }));
  }

  protected compare(event: SubmitEvent): void {
    event.preventDefault();
    this.requestAction({
      kind: "compare",
      from: Number(this.fromRevision),
      to: Number(this.toRevision),
    });
  }

  protected requestAction(operation: ProjectHistoryOperation): void {
    this.dispatchEvent(
      new CustomEvent<ProjectHistoryOperation>(projectHistoryActionEvent, {
        bubbles: true,
        composed: true,
        detail: operation,
      }),
    );
  }

  protected updateFromRevision(event: Event): void {
    this.fromRevision = (event.currentTarget as HTMLSelectElement).value;
  }

  protected updateToRevision(event: Event): void {
    this.toRevision = (event.currentTarget as HTMLSelectElement).value;
  }

  private revisionOptions(): readonly TemplateResult[] {
    return this.revisions.map((revision) => html`<option value=${revision.revision}>v${revision.revision} · ${revision.reason}</option>`);
  }

  private revisionCard(revision: ProjectRevisionSummary, head: boolean): TemplateResult {
    return html`
      <article class="rounded-sm border border-app-line bg-app-paper p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="font-sans text-sm font-bold">v${revision.revision} · ${revision.reason}</h3>
            <p class="mt-1 text-xs text-app-text-soft">
              ${formatTimestamp(revision.createdAt)} · ${revision.fileCount} file${revision.fileCount === 1 ? "" : "s"}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            ${this.actionButton("Inspect", { kind: "inspect", revision: revision.revision })}
            ${this.actionButton("Name milestone", { kind: "milestone", revision: revision.revision })}
            ${this.actionButton("Branch", { kind: "branch", revision: revision.revision })}
            ${head ? nothing : this.actionButton("Restore as new head", { kind: "restore", revision: revision.revision })}
          </div>
        </div>
        ${revision.milestones.length > 0
          ? html`<div class="mt-3 flex flex-wrap gap-2">
              ${revision.milestones.map(
                (milestone) => html`
                  <span class="eyebrow block" title=${milestone.description || `Immutable milestone for v${revision.revision}`}
                    >${milestone.name}</span
                  >
                `,
              )}
            </div>`
          : nothing}
      </article>
    `;
  }

  private actionButton(label: string, operation: ProjectHistoryOperation): TemplateResult {
    return html`<button class="button-secondary" type="button" ?disabled=${this.busy} @click=${() => this.requestAction(operation)}>
      ${label}
    </button>`;
  }

  private renderInspector(inspector: ProjectHistoryInspector): TemplateResult {
    return inspector.kind === "revision" ? renderRevision(inspector.value) : renderComparison(inspector.value);
  }
}

export function renderRevision(value: ProjectRevisionContent): TemplateResult {
  return html`
    <h3 class="font-sans text-sm font-bold">Read-only v${value.revision} · ${value.title}</h3>
    <p class="mt-2 text-xs leading-5 text-app-text-soft">
      ${value.files.length} files · ${value.projectReferences.length} references · ${value.pdfs.length} PDFs · ${value.claims.length} claims
    </p>
    <pre class="mt-4 max-h-80 overflow-auto whitespace-pre-wrap border-t border-app-line pt-4 text-xs leading-5">${value.source}</pre>
  `;
}

export function renderComparison(value: ProjectRevisionDiff): TemplateResult {
  const wordDelta = value.composed.wordDelta >= 0 ? `+${value.composed.wordDelta}` : String(value.composed.wordDelta);
  const files = value.files.filter((item) => item.status !== "unchanged");
  const binaryChanges = value.binaries.filter((item) => item.status !== "unchanged").length;
  return html`
    <h3 class="font-sans text-sm font-bold">v${value.fromRevision} → v${value.toRevision}</h3>
    <p class="mt-2 text-sm text-app-text-soft">
      Composed manuscript: +${value.composed.addedLines} / −${value.composed.removedLines} lines ·
      ${value.composed.beforeWords.toLocaleString()} → ${value.composed.afterWords.toLocaleString()} words (${wordDelta})
    </p>
    <ul class="mt-3 space-y-1 font-sans text-xs">
      ${files.map(
        (file) => html`
          <li>${file.status}: ${file.beforePath ?? "∅"} → ${file.afterPath ?? "∅"} (+${file.addedLines}/−${file.removedLines})</li>
        `,
      )}
    </ul>
    <p class="mt-3 text-xs text-app-text-soft">${binaryChanges} binary identity change(s)</p>
  `;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

if (typeof customElements !== "undefined" && !customElements.get("project-history-panel")) {
  customElements.define("project-history-panel", ProjectHistoryPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-history-panel": ProjectHistoryPanel;
  }
}

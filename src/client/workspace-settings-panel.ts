import { html, LitElement, type TemplateResult } from "lit";
import type { ProjectPublicationProfile } from "../domain/workspace";
import {
  GitHubSyncReview,
  gitHubPublishConfirmEvent,
  gitHubPublishPreviewEvent,
  gitHubPullConfirmEvent,
  gitHubPullPreviewEvent,
  gitHubSyncDisconnectEvent,
} from "./github-sync-review";

export const workspaceSettingsActionEvent = "workspace-settings-action";

export interface WorkspaceSettingsValue {
  readonly entryFileId: string;
  readonly publicationProfile: ProjectPublicationProfile;
  readonly title: string;
}

export type WorkspaceSettingsAction =
  | { readonly action: "archive" }
  | { readonly action: "delete"; readonly title: string }
  | { readonly action: "duplicate"; readonly title: string }
  | { readonly action: "save"; readonly value: WorkspaceSettingsValue }
  | { readonly action: "save-template" };

export interface WorkspaceSettingsView extends WorkspaceSettingsValue {
  readonly archived: boolean;
  readonly files: readonly { readonly id: string; readonly path: string }[];
  readonly templateAllowed: boolean;
}

export class WorkspaceSettingsPanel extends LitElement {
  static override properties = {
    gitHubStatus: { state: true },
    view: { state: true },
  };

  declare private gitHubStatus: string;
  declare private view: WorkspaceSettingsView;

  constructor() {
    super();
    this.gitHubStatus = "Checking connection…";
    this.view = {
      archived: false,
      entryFileId: "",
      files: [],
      publicationProfile: {
        citationStyle: "apa",
        locale: "en-US",
        paperSize: "a4",
        submissionTemplate: "article",
      },
      templateAllowed: true,
      title: "",
    };
  }

  get open(): boolean {
    return this.dialog.open;
  }

  get value(): WorkspaceSettingsValue {
    return {
      entryFileId: this.select("workspace-entry-file").value,
      publicationProfile: {
        citationStyle: this.select("workspace-citation-style").value as ProjectPublicationProfile["citationStyle"],
        locale: this.select("workspace-citation-locale").value as ProjectPublicationProfile["locale"],
        paperSize: this.select("workspace-paper-size").value as ProjectPublicationProfile["paperSize"],
        submissionTemplate: this.select("workspace-submission-template").value as ProjectPublicationProfile["submissionTemplate"],
      },
      title: this.titleInput.value,
    };
  }

  get gitHubReview(): GitHubSyncReview {
    const review = this.querySelector<GitHubSyncReview>("#github-sync-review");
    if (!review) throw new Error("GitHub sync review is unavailable");
    return review;
  }

  async show(view: WorkspaceSettingsView): Promise<void> {
    this.setView(view);
    await this.updateComplete;
    if (!this.dialog.open) this.dialog.showModal();
  }

  close(): void {
    this.dialog.close();
  }

  setGitHubStatus(status: string): void {
    this.gitHubStatus = status;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected setView(view: WorkspaceSettingsView): void {
    this.view = view;
  }

  protected override firstUpdated(): void {
    for (const eventName of [
      gitHubPullPreviewEvent,
      gitHubPullConfirmEvent,
      gitHubPublishPreviewEvent,
      gitHubPublishConfirmEvent,
      gitHubSyncDisconnectEvent,
    ]) {
      this.gitHubReview.addEventListener(eventName, (event) => {
        this.dispatchEvent(new CustomEvent(eventName, { detail: (event as CustomEvent<unknown>).detail }));
      });
    }
  }

  protected override render(): TemplateResult {
    const profile = this.view.publicationProfile;
    return html`
      <dialog class="new-workspace-dialog ui-dialog" id="workspace-settings-dialog">
        <form class="p-5" id="workspace-settings-form" @submit=${this.save}>
          <p class="eyebrow">Project settings</p>
          <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Manage this project</h2>
          <label class="field-label mt-5"
            >Project title<input class="field" id="workspace-settings-title" maxlength="120" required .value=${this.view.title}
          /></label>
          <label class="field-label mt-4"
            >Entry file<select class="field" id="workspace-entry-file" .value=${this.view.entryFileId}>
              ${this.view.files.map((file) => html`<option value=${file.id}>${file.path}</option>`)}
            </select></label
          >
          <p class="mt-2 text-xs leading-5 text-app-text-soft">Preview, statistics, and publication exports compose from this file.</p>
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <label class="field-label"
              >Citation style<select class="field" id="workspace-citation-style" .value=${profile.citationStyle}>
                <option value="apa">APA</option>
                <option value="chicago-author-date">Chicago author-date</option>
                <option value="ieee">IEEE numeric</option>
              </select></label
            >
            <label class="field-label"
              >Citation locale<select class="field" id="workspace-citation-locale" .value=${profile.locale}>
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="fi-FI">Finnish</option>
              </select></label
            >
            <label class="field-label"
              >Submission template<select class="field" id="workspace-submission-template" .value=${profile.submissionTemplate}>
                <option value="article">Standard article</option>
                <option value="preprint">Preprint</option>
                <option value="anonymous-review">Anonymous review</option>
                <option value="journal-two-column">Journal two-column</option>
              </select></label
            >
            <label class="field-label"
              >Paper size<select class="field" id="workspace-paper-size" .value=${profile.paperSize}>
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
              </select></label
            >
          </div>
          <p class="mt-2 text-xs leading-5 text-app-text-soft">
            These settings affect preview and exports without changing the manuscript.
          </p>
          <div class="mt-5 flex flex-wrap gap-2">
            <button class="button-primary" type="submit">Save title</button>
            <button
              class="button-secondary"
              id="save-workspace-template"
              type="button"
              ?hidden=${!this.view.templateAllowed}
              @click=${this.saveTemplate}
            >
              Save as template
            </button>
            <button class="button-secondary" id="duplicate-workspace" type="button" @click=${this.duplicate}>Duplicate</button>
            <button class="button-secondary" id="archive-workspace" type="button" data-destructive="true" @click=${this.archive}>
              ${this.view.archived ? "Restore" : "Archive"}
            </button>
          </div>
          <section class="mt-6 border-t border-app-line pt-5">
            <p class="eyebrow">GitHub sync</p>
            <p class="mt-2 text-sm leading-6 text-app-text-soft" id="github-sync-status">${this.gitHubStatus}</p>
            <github-sync-review id="github-sync-review">
              <div class="mt-4" id="github-pull-review" aria-live="polite"></div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button class="button-secondary" id="preview-github-pull" type="button">Preview pull</button>
                <button class="button-primary" id="confirm-github-pull" type="button" disabled>Pull changes</button>
              </div>
              <label class="field-label mt-4"
                >Commit message<input class="field" id="github-publish-message" maxlength="900" value="Publish from Kirjolab"
              /></label>
              <div class="mt-3" id="github-publish-review" aria-live="polite"></div>
              <div class="mt-4 flex flex-wrap gap-2">
                <button class="button-secondary" id="preview-github-publish" type="button">Preview publish</button>
                <button class="button-primary" id="confirm-github-publish" type="button" disabled>Publish commit</button>
                <button class="button-secondary" id="disconnect-github" type="button" data-destructive="true">Disconnect</button>
              </div>
            </github-sync-review>
          </section>
          <section class="mt-6 border-t border-app-line pt-5">
            <p class="eyebrow">Danger zone</p>
            <p class="mt-2 text-sm leading-6 text-app-text-soft">
              Permanent deletion removes project revisions, collaborators, project PDFs, and project links. Private library references
              remain.
            </p>
            <button
              class="button-secondary mt-3"
              id="delete-workspace"
              type="button"
              data-destructive="true"
              @click=${this.deleteWorkspace}
            >
              Delete permanently
            </button>
          </section>
          <div class="mt-5 flex justify-end">
            <button class="button-secondary" id="close-workspace-settings" type="button" @click=${this.close}>Close</button>
          </div>
        </form>
      </dialog>
    `;
  }

  protected save(event: SubmitEvent): void {
    event.preventDefault();
    this.emit({ action: "save", value: this.value });
  }

  protected saveTemplate(): void {
    this.emit({ action: "save-template" });
  }

  protected duplicate(): void {
    this.emit({ action: "duplicate", title: this.titleInput.value });
  }

  protected archive(): void {
    this.emit({ action: "archive" });
  }

  protected deleteWorkspace(): void {
    this.emit({ action: "delete", title: this.titleInput.value });
  }

  protected emit(detail: WorkspaceSettingsAction): void {
    this.dispatchEvent(new CustomEvent<WorkspaceSettingsAction>(workspaceSettingsActionEvent, { bubbles: true, detail }));
  }

  protected get dialog(): HTMLDialogElement {
    const dialog = this.querySelector<HTMLDialogElement>("#workspace-settings-dialog");
    if (!dialog) throw new Error("Workspace settings dialog is unavailable");
    return dialog;
  }

  protected get titleInput(): HTMLInputElement {
    const input = this.querySelector<HTMLInputElement>("#workspace-settings-title");
    if (!input) throw new Error("Workspace settings title is unavailable");
    return input;
  }

  protected select(id: string): HTMLSelectElement {
    const select = this.querySelector<HTMLSelectElement>(`#${id}`);
    if (!select) throw new Error(`Workspace settings select ${id} is unavailable`);
    return select;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("workspace-settings-panel")) {
  customElements.define("workspace-settings-panel", WorkspaceSettingsPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-settings-panel": WorkspaceSettingsPanel;
  }
}

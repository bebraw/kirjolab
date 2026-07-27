import { html, LitElement, nothing, type TemplateResult } from "lit";
import type {
  AnnotationResource,
  ClaimEvidenceLink,
  ClaimPassageLink,
  ClaimResource,
  CreateClaimPassageLinkInput,
  ManuscriptAnchorSelector,
  WorkspaceSnapshot,
} from "../domain/workspace";
import { errorMessage, expectOk, jsonFetch } from "./http";
import "./claim-dialog";
import type { ClaimDialog } from "./claim-dialog";
import { focusFirstModelEvidence } from "./model-evidence-focus";
import { accessibleEvidenceExcerpt, anchorActionLabel, anchorMatchState, modelEvidenceKey } from "./research-resource-presentation";

export interface ClaimListBinding {
  readonly completeMutation: (message: string) => void;
  readonly linkPassage: (claimId: string) => void;
  readonly openAnnotation: (annotationId: string) => void;
  readonly openPassage: (anchor: ManuscriptAnchorSelector) => void;
}

interface ClaimListData {
  readonly annotations: readonly AnnotationResource[];
  readonly claims: readonly ClaimResource[];
  readonly evidenceLinks: readonly ClaimEvidenceLink[];
  readonly passageLinks: readonly ClaimPassageLink[];
  readonly selectedEvidenceKeys: ReadonlySet<string>;
}

export class ClaimListPanel extends LitElement {
  static override properties = {
    data: { state: true },
    deletingClaimId: { state: true },
    status: { state: true },
  };

  declare private data: ClaimListData;
  declare private deletingClaimId: string;
  declare private status: string;
  private apiBase = "";
  private binding: ClaimListBinding | undefined;
  private selectModelEvidence: ((key: string, selected: boolean) => void) | undefined;

  constructor() {
    super();
    this.data = { annotations: [], claims: [], evidenceLinks: [], passageLinks: [], selectedEvidenceKeys: new Set() };
    this.deletingClaimId = "";
    this.status = "";
  }

  configure(apiBase: string): void {
    this.apiBase = apiBase;
    void this.updateComplete.then(() => this.dialog.configure(apiBase));
  }

  bind(binding: ClaimListBinding): void {
    this.binding = binding;
  }

  bindEvidenceSelection(selectEvidence: (key: string, selected: boolean) => void): void {
    this.selectModelEvidence = selectEvidence;
  }

  setWorkspace(
    snapshot: Pick<WorkspaceSnapshot, "annotations" | "claims" | "claimEvidenceLinks" | "claimLinks">,
    selectedEvidenceKeys: ReadonlySet<string>,
  ): void {
    this.data = {
      annotations: snapshot.annotations,
      claims: snapshot.claims,
      evidenceLinks: snapshot.claimEvidenceLinks,
      passageLinks: snapshot.claimLinks,
      selectedEvidenceKeys,
    };
  }

  setPassageLinks(passageLinks: readonly ClaimPassageLink[]): void {
    this.data = { ...this.data, passageLinks };
  }

  focusEvidence(): boolean {
    return focusFirstModelEvidence(this);
  }

  revealClaim(claimId: string, focus = false): boolean {
    const card = [...this.querySelectorAll<HTMLElement>("[data-claim-resource-id]")].find(
      ({ dataset }) => dataset.claimResourceId === claimId,
    );
    if (!card) return false;
    if (focus) card.focus({ preventScroll: true });
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }

  async linkPassage(input: CreateClaimPassageLinkInput): Promise<void> {
    this.status = "Linking claim to passage…";
    try {
      const response = await jsonFetch(`${this.apiBase}/claim-links`, input);
      await expectOk(response);
      this.status = "";
      this.binding?.completeMutation("Claim linked to the selected manuscript passage.");
    } catch (error) {
      this.status = errorMessage(error, "Could not link the claim to the selected passage.");
    }
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const annotations = new Map(this.data.annotations.map((annotation) => [annotation.id, annotation]));
    return html`
      <details class="rail-collection">
        <summary><span>Claims</span><span class="count-badge" id="claim-count">${this.data.claims.length}</span></summary>
        <div class="px-1 pt-3">
          <button
            class="button-secondary w-full justify-center"
            id="new-claim"
            type="button"
            ?disabled=${annotations.size === 0}
            @click=${this.createClaim}
          >
            New claim
          </button>
        </div>
        <div class="rail-collection-body" id="claim-list">
          ${this.data.claims.length === 0
            ? html`<div class="empty-state">Evidence-backed claims appear here.</div>`
            : this.data.claims.map((claim) => this.renderClaim(claim, annotations))}
        </div>
        <p class="status-line px-1" role="status" ?hidden=${!this.status}>${this.status}</p>
      </details>
      <claim-dialog-panel @claim-dialog-saved=${this.claimSaved}></claim-dialog-panel>
    `;
  }

  protected createClaim(): void {
    void this.openClaim();
  }

  protected selectEvidence(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const key = input.dataset.modelEvidenceKey;
    if (key) this.selectModelEvidence?.(key, input.checked);
  }

  protected actOnClaim(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const claim = this.data.claims.find((item) => item.id === button.dataset.claimId);
    if (!claim) return;
    const action = button.dataset.claimAction;
    if (action === "edit") void this.openClaim(claim);
    else if (action === "delete") void this.deleteClaim(claim);
    else if (action === "link-passage") this.binding?.linkPassage(claim.id);
  }

  protected async deleteClaim(claim: ClaimResource): Promise<void> {
    if (this.deletingClaimId || !globalThis.confirm("Delete this claim and its links? Source annotations and manuscript text will remain."))
      return;
    this.deletingClaimId = claim.id;
    this.status = "Deleting claim…";
    try {
      const response = await fetch(`${this.apiBase}/claims/${encodeURIComponent(claim.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      await expectOk(response);
      this.status = "";
      this.binding?.completeMutation("Claim removed; source evidence remains intact.");
    } catch (error) {
      this.status = errorMessage(error, "Could not delete the claim.");
    } finally {
      this.deletingClaimId = "";
    }
  }

  protected openAnnotation(event: Event): void {
    const annotationId = (event.currentTarget as HTMLButtonElement).dataset.annotationId;
    if (annotationId) this.binding?.openAnnotation(annotationId);
  }

  protected openPassage(event: Event): void {
    const claimId = (event.currentTarget as HTMLButtonElement).dataset.claimId;
    const link = this.data.passageLinks.find((item) => item.claimId === claimId);
    if (link) this.binding?.openPassage(link.anchor);
  }

  protected claimSaved(event: CustomEvent<string>): void {
    this.binding?.completeMutation(event.detail);
  }

  private async openClaim(claim?: ClaimResource): Promise<void> {
    if (this.data.annotations.length === 0) {
      this.status = "Create an evidence annotation before adding a claim.";
      return;
    }
    const evidence = claim ? this.data.evidenceLinks.filter((link) => link.claimId === claim.id) : [];
    const dialog = this.dialog;
    await dialog.updateComplete;
    dialog.open(claim, this.data.annotations, evidence);
  }

  private get dialog(): ClaimDialog {
    const dialog = this.querySelector<ClaimDialog>("claim-dialog-panel");
    if (!dialog) throw new Error("Claim editor is unavailable");
    return dialog;
  }

  private renderClaim(claim: ClaimResource, annotations: ReadonlyMap<string, AnnotationResource>): TemplateResult {
    const evidence = this.data.evidenceLinks.filter((link) => link.claimId === claim.id);
    const passage = this.data.passageLinks.find((link) => link.claimId === claim.id);
    const evidenceKey = modelEvidenceKey("claim", claim.id);
    return html`
      <article class="resource-card" data-claim-resource-id=${claim.id} tabindex="-1">
        <label class="flex items-start gap-2">
          <input
            type="checkbox"
            class="mt-1 accent-app-accent"
            data-model-evidence-key=${evidenceKey}
            aria-label=${`Use claim “${accessibleEvidenceExcerpt(claim.text)}” as model evidence`}
            .checked=${this.data.selectedEvidenceKeys.has(evidenceKey)}
            @change=${this.selectEvidence}
          />
          <span class="min-w-0">
            <span class="eyebrow">Claim · ${evidence.length} ${evidence.length === 1 ? "source" : "sources"}</span>
            <strong class="mt-2 block font-sans">${claim.text}</strong>
          </span>
        </label>
        ${claim.note ? html`<p class="mt-2 font-sans text-xs leading-5 text-app-text-soft">${claim.note}</p>` : nothing}
        ${evidence.length === 0
          ? nothing
          : html`<div class="mt-3 space-y-1">
              ${evidence.map((link) => {
                const annotation = annotations.get(link.annotationId);
                return annotation
                  ? html`<button
                      type="button"
                      class="block w-full text-left font-sans text-xs font-bold text-app-accent-strong underline decoration-app-border underline-offset-4"
                      data-annotation-id=${annotation.id}
                      @click=${this.openAnnotation}
                    >
                      ${link.relation} · ${annotation.comment || `page ${annotation.page}`}
                    </button>`
                  : nothing;
              })}
            </div>`}
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="button-secondary justify-center"
            data-claim-id=${claim.id}
            data-claim-action="edit"
            @click=${this.actOnClaim}
          >
            Edit
          </button>
          <button
            type="button"
            class="button-secondary justify-center"
            data-claim-id=${claim.id}
            data-claim-action="delete"
            ?disabled=${Boolean(this.deletingClaimId)}
            @click=${this.actOnClaim}
          >
            ${this.deletingClaimId === claim.id ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            class="button-secondary col-span-2 justify-center"
            data-claim-id=${claim.id}
            data-claim-action="link-passage"
            @click=${this.actOnClaim}
          >
            Link selected prose
          </button>
          ${passage
            ? html`<button
                type="button"
                class="button-secondary col-span-2 justify-center"
                data-claim-id=${claim.id}
                data-anchor-status=${passage.resolution.status}
                data-anchor-match=${anchorMatchState(passage.resolution)}
                ?disabled=${passage.resolution.status !== "resolved"}
                @click=${this.openPassage}
              >
                ${anchorActionLabel(passage.resolution)}
              </button>`
            : nothing}
        </div>
      </article>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("claim-list-panel")) {
  customElements.define("claim-list-panel", ClaimListPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "claim-list-panel": ClaimListPanel;
  }
}

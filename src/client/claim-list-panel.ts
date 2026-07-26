import { html, LitElement, nothing, type TemplateResult } from "lit";
import type { AnnotationResource, ClaimEvidenceLink, ClaimPassageLink, ClaimResource, ManuscriptAnchorSelector } from "../domain/workspace";
import { accessibleEvidenceExcerpt, anchorActionLabel, anchorMatchState, modelEvidenceKey } from "./research-resource-presentation";

export const claimListActionEvent = "claim-list-action";

export type ClaimListAction =
  | { readonly action: "create" }
  | { readonly action: "delete"; readonly claim: ClaimResource }
  | { readonly action: "edit"; readonly claim: ClaimResource }
  | { readonly action: "evidence"; readonly key: string; readonly selected: boolean }
  | { readonly action: "link-passage"; readonly claimId: string }
  | { readonly action: "open-annotation"; readonly annotationId: string }
  | { readonly action: "open-passage"; readonly anchor: ManuscriptAnchorSelector };

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
  };

  declare private data: ClaimListData;

  constructor() {
    super();
    this.data = { annotations: [], claims: [], evidenceLinks: [], passageLinks: [], selectedEvidenceKeys: new Set() };
  }

  setClaims(data: ClaimListData): void {
    this.data = data;
  }

  setPassageLinks(passageLinks: readonly ClaimPassageLink[]): void {
    this.data = { ...this.data, passageLinks };
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
      </details>
    `;
  }

  protected createClaim(): void {
    this.emit({ action: "create" });
  }

  protected selectEvidence(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const key = input.dataset.modelEvidenceKey;
    if (key) this.emit({ action: "evidence", key, selected: input.checked });
  }

  protected actOnClaim(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const claim = this.data.claims.find((item) => item.id === button.dataset.claimId);
    if (!claim) return;
    const action = button.dataset.claimAction;
    if (action === "edit" || action === "delete") this.emit({ action, claim });
    else if (action === "link-passage") this.emit({ action, claimId: claim.id });
  }

  protected openAnnotation(event: Event): void {
    const annotationId = (event.currentTarget as HTMLButtonElement).dataset.annotationId;
    if (annotationId) this.emit({ action: "open-annotation", annotationId });
  }

  protected openPassage(event: Event): void {
    const claimId = (event.currentTarget as HTMLButtonElement).dataset.claimId;
    const link = this.data.passageLinks.find((item) => item.claimId === claimId);
    if (link) this.emit({ action: "open-passage", anchor: link.anchor });
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
            @click=${this.actOnClaim}
          >
            Delete
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
                data-anchor-link-id=${passage.id}
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

  private emit(detail: ClaimListAction): void {
    this.dispatchEvent(new CustomEvent(claimListActionEvent, { bubbles: true, composed: true, detail }));
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

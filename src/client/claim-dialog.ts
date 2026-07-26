import { html, LitElement, type TemplateResult } from "lit";
import type { AnnotationResource, ClaimEvidenceRelation, ClaimResource } from "../domain/workspace";
import { errorMessage, expectOk } from "./http";

export const claimDialogSavedEvent = "claim-dialog-saved";

export interface ClaimDialogEvidence {
  readonly annotationId: string;
  readonly relation: ClaimEvidenceRelation;
}

export class ClaimDialog extends LitElement {
  static override properties = {
    annotations: { state: true },
    claimId: { state: true },
    note: { state: true },
    relation: { state: true },
    saving: { state: true },
    selected: { state: true },
    status: { state: true },
    text: { state: true },
  };

  declare private annotations: readonly AnnotationResource[];
  declare private claimId: string | undefined;
  declare private note: string;
  declare private relation: ClaimEvidenceRelation;
  declare private saving: boolean;
  declare private selected: ReadonlySet<string>;
  declare private status: string;
  declare private text: string;
  private apiBase = "";

  constructor() {
    super();
    this.annotations = [];
    this.claimId = undefined;
    this.note = "";
    this.relation = "supports";
    this.saving = false;
    this.selected = new Set();
    this.status = "";
    this.text = "";
  }

  configure(apiBase: string): void {
    this.apiBase = apiBase;
  }

  open(claim: ClaimResource | undefined, annotations: readonly AnnotationResource[], evidence: readonly ClaimDialogEvidence[]): void {
    this.annotations = annotations;
    this.claimId = claim?.id;
    this.note = claim?.note ?? "";
    this.relation = evidence[0]?.relation ?? "supports";
    this.saving = false;
    this.selected = new Set(evidence.map(({ annotationId }) => annotationId));
    this.status = "";
    this.text = claim?.text ?? "";
    void this.updateComplete.then(() => {
      const dialog = this.querySelector<HTMLDialogElement>("#claim-dialog");
      const text = this.querySelector<HTMLTextAreaElement>("#claim-text");
      if (dialog && text) {
        dialog.showModal();
        text.focus();
      }
    });
  }

  close(): void {
    this.querySelector<HTMLDialogElement>("#claim-dialog")?.close();
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
      <dialog class="new-workspace-dialog ui-dialog" id="claim-dialog">
        <form class="p-5" id="claim-form" @submit=${this.save}>
          <p class="eyebrow">Evidence synthesis</p>
          <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]" id="claim-dialog-title">
            ${this.claimId ? "Edit claim" : "Create claim"}
          </h2>
          <label class="field-label mt-5"
            >Proposition
            <textarea
              class="field min-h-24"
              id="claim-text"
              maxlength="2000"
              required
              placeholder="State one concise, defensible claim"
              .value=${this.text}
              @input=${this.changeText}
            ></textarea>
          </label>
          <label class="field-label mt-3"
            >Working note
            <textarea
              class="field min-h-20"
              id="claim-note"
              maxlength="8000"
              placeholder="Interpretation, caveats, or next questions"
              .value=${this.note}
              @input=${this.changeNote}
            ></textarea>
          </label>
          <label class="field-label mt-3"
            >Evidence relationship
            <select class="field" id="claim-relation" .value=${this.relation} @change=${this.changeRelation}>
              <option value="supports">Supports</option>
              <option value="contradicts">Contradicts</option>
              <option value="extends">Extends</option>
            </select>
          </label>
          <fieldset class="mt-4">
            <legend class="field-label">Source annotations</legend>
            <div class="mt-2 max-h-48 space-y-2 overflow-auto" id="claim-evidence-options">
              ${this.annotations.map(
                (annotation) => html`
                  <label class="resource-card flex cursor-pointer items-start gap-2 font-sans text-xs">
                    <input
                      class="mt-0.5 accent-app-accent"
                      type="checkbox"
                      value=${annotation.id}
                      .checked=${this.selected.has(annotation.id)}
                      @change=${this.toggleEvidence}
                    />
                    <span>${annotation.comment || `Page ${annotation.page}: ${annotation.quote}`}</span>
                  </label>
                `,
              )}
            </div>
          </fieldset>
          <div class="mt-5 flex justify-end gap-2">
            <button class="button-secondary" id="cancel-claim" type="button" @click=${this.close}>Cancel</button>
            <button class="button-primary" type="submit" ?disabled=${this.saving}>${this.saving ? "Saving…" : "Save claim"}</button>
          </div>
          <p class="status-line" role="status" ?hidden=${!this.status}>${this.status}</p>
        </form>
      </dialog>
    `;
  }

  protected changeText(event: Event): void {
    this.text = controlValue(event);
  }

  protected changeNote(event: Event): void {
    this.note = controlValue(event);
  }

  protected changeRelation(event: Event): void {
    this.relation = claimEvidenceRelation(controlValue(event));
  }

  protected toggleEvidence(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const selected = new Set(this.selected);
    if (input.checked) selected.add(input.value);
    else selected.delete(input.value);
    this.selected = selected;
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving) return;
    if (this.selected.size === 0) {
      this.status = "Select at least one source annotation.";
      return;
    }
    this.saving = true;
    this.status = "";
    try {
      const response = await fetch(this.claimId ? `${this.apiBase}/claims/${encodeURIComponent(this.claimId)}` : `${this.apiBase}/claims`, {
        method: this.claimId ? "PUT" : "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: this.text,
          note: this.note,
          evidence: [...this.selected].map((annotationId) => ({ annotationId, relation: this.relation })),
        }),
      });
      await expectOk(response);
      this.close();
      this.dispatchEvent(
        new CustomEvent<string>(claimDialogSavedEvent, { bubbles: true, detail: "Claim and evidence relationships saved." }),
      );
    } catch (error) {
      this.status = errorMessage(error, "Could not save the claim.");
    } finally {
      this.saving = false;
    }
  }
}

function controlValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
}

function claimEvidenceRelation(value: string): ClaimEvidenceRelation {
  if (value === "contradicts" || value === "extends") return value;
  return "supports";
}

if (typeof customElements !== "undefined" && !customElements.get("claim-dialog-panel")) {
  customElements.define("claim-dialog-panel", ClaimDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    "claim-dialog-panel": ClaimDialog;
  }
}

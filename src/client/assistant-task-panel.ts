import { html, LitElement, type TemplateResult } from "lit";
import { isPhrasingPurposeId, phrasingPurposes, type PhrasingPurpose } from "../domain/phrasing-guidance";
import type { ClaimEvidenceRelation } from "../domain/workspace";
import {
  assistantOperationDefinition,
  assistantOperationDefinitions,
  assistantTargetScopeLabel,
  type AssistantOperationDefinition,
  type AssistantTargetScope,
} from "./assistant-operations";
import { maximumModelEvidenceItems } from "./model-provider";
import { parseTableRequirements, type TableRequirements } from "./structured-syntax";

export const assistantTaskChangeEvent = "assistant-task-change";
export const assistantTaskGenerateEvent = "assistant-task-generate";
export type AssistantTaskChange = "input" | "operation" | "target";

export interface AssistantTaskValue {
  readonly instruction: string;
  readonly operation: AssistantOperationDefinition;
  readonly phrasingPurposeId: string;
  readonly relation: string;
  readonly tableCaption: string;
  readonly tableColumns: string;
  readonly tableRows: string;
  readonly targetScope: AssistantTargetScope;
}

export interface AssistantTargetPreview {
  readonly passage: string | null;
  readonly scope: AssistantTargetScope;
  readonly target: { readonly start: number; readonly end: number } | null;
}

export interface AssistantGenerationAvailability {
  readonly annotationEvidenceCount: number;
  readonly discoveryBusy: boolean;
  readonly evidenceCount: number;
  readonly hasInsertionTarget: boolean;
  readonly hasPassage: boolean;
  readonly modelAvailable: boolean;
  readonly selectedEvidenceCount: number;
  readonly stableDocument: boolean;
  readonly workflowBusy: boolean;
}

export class AssistantTaskPanel extends LitElement {
  static override properties = {
    generateDisabled: { state: true },
    instruction: { state: true },
    operationId: { state: true },
    phrasingPurposeId: { state: true },
    relation: { state: true },
    tableCaption: { state: true },
    tableColumns: { state: true },
    tableRows: { state: true },
    targetPreview: { state: true },
    targetScope: { state: true },
  };

  declare private generateDisabled: boolean;
  declare private instruction: string;
  declare private operationId: string;
  declare private phrasingPurposeId: string;
  declare private relation: string;
  declare private tableCaption: string;
  declare private tableColumns: string;
  declare private tableRows: string;
  declare protected targetPreview: string;
  declare private targetScope: AssistantTargetScope;

  constructor() {
    super();
    const operation = assistantOperationDefinition("");
    this.generateDisabled = true;
    this.instruction = operation.defaultInstruction;
    this.operationId = operation.id;
    this.phrasingPurposeId = phrasingPurposes()[0]?.id ?? "";
    this.relation = "supports";
    this.tableCaption = "";
    this.tableColumns = "";
    this.tableRows = "";
    this.targetPreview = "Place the caret in a sentence or select the exact text to revise.";
    this.targetScope = operation.defaultScope ?? "selection";
  }

  get value(): AssistantTaskValue {
    return {
      instruction: this.instruction,
      operation: assistantOperationDefinition(this.operationId),
      phrasingPurposeId: this.phrasingPurposeId,
      relation: this.relation,
      tableCaption: this.tableCaption,
      tableColumns: this.tableColumns,
      tableRows: this.tableRows,
      targetScope: this.targetScope,
    };
  }

  get claimEvidenceRelation(): ClaimEvidenceRelation {
    return this.relation === "contradicts" || this.relation === "extends" ? this.relation : "supports";
  }

  get phrasingPurpose(): PhrasingPurpose {
    const purposes = phrasingPurposes();
    return (
      (isPhrasingPurposeId(this.phrasingPurposeId) ? purposes.find(({ id }) => id === this.phrasingPurposeId) : undefined) ?? purposes[0]!
    );
  }

  get tableRequirements(): TableRequirements {
    return parseTableRequirements(this.tableCaption, this.tableColumns, this.tableRows);
  }

  get tableRequirementsValid(): boolean {
    try {
      void this.tableRequirements;
      return true;
    } catch {
      return false;
    }
  }

  setGenerationAvailability(availability: AssistantGenerationAvailability): void {
    const operation = assistantOperationDefinition(this.operationId);
    const evidenceAvailable =
      operation.evidence === "none" || operation.evidence === "optional"
        ? true
        : operation.evidence === "annotations"
          ? availability.annotationEvidenceCount > 0
          : availability.evidenceCount > 0;
    const targetAvailable =
      operation.id === "draft-claim" ||
      (operation.id === "build-table" ? availability.hasInsertionTarget && this.tableRequirementsValid : availability.hasPassage);
    this.generateDisabled =
      availability.discoveryBusy ||
      availability.workflowBusy ||
      (!availability.stableDocument && operation.id !== "draft-claim") ||
      !operation.enabled ||
      !evidenceAvailable ||
      availability.selectedEvidenceCount > maximumModelEvidenceItems ||
      !availability.modelAvailable ||
      !targetAvailable ||
      !this.instruction.trim();
  }

  showTarget({ passage, scope, target }: AssistantTargetPreview): void {
    const operation = assistantOperationDefinition(this.operationId);
    if (operation.id === "draft-claim") {
      this.targetPreview = "This operation uses selected annotation snapshots rather than a manuscript target.";
      return;
    }
    if (operation.id === "build-table") {
      this.targetPreview = target
        ? target.start === target.end
          ? "The reviewed table syntax will be inserted at the visible caret."
          : `The reviewed table syntax will replace ${target.end - target.start} selected characters.`
        : "Place the caret where the table should be inserted, or select text to replace.";
      return;
    }
    if (!passage) {
      this.targetPreview = "Place the caret in manuscript text or select the exact passage to target.";
      return;
    }
    const excerpt = passage.replace(/\s+/gu, " ").trim();
    this.targetPreview = `${assistantTargetScopeLabel(scope)} · “${excerpt.slice(0, 180)}${excerpt.length > 180 ? "…" : ""}”`;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const operation = assistantOperationDefinition(this.operationId);
    const draftsClaim = operation.id === "draft-claim";
    const phrasesPassage = operation.id === "phrase-passage";
    return html`
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="eyebrow" id="assistant-operation-eyebrow">${operation.eyebrow}</p>
          <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]" id="assistant-operation-title">${operation.title}</h2>
        </div>
        <p class="max-w-lg text-xs leading-5 text-app-text-soft" id="assistant-operation-description">${operation.description}</p>
      </div>
      <div class="assistant-workflow">
        <label class="field-label"
          >Task
          <select class="field" id="model-operation" .value=${operation.id} @change=${this.changeOperation}>
            ${assistantOperationDefinitions().map(
              (definition) => html`
                <option value=${definition.id} ?disabled=${!definition.enabled}>
                  ${definition.enabled ? definition.label : `${definition.label} · coming next`}
                </option>
              `,
            )}
          </select>
        </label>
        <label class="field-label" id="assistant-target-scope-field" ?hidden=${operation.scopes.length === 0}
          >Target
          <select class="field" id="assistant-target-scope" .value=${this.targetScope} @change=${this.changeTargetScope}>
            ${operation.scopes.map((scope) => html`<option value=${scope}>${assistantTargetScopeLabel(scope)}</option>`)}
          </select>
        </label>
        <label class="field-label" id="model-claim-relation-field" ?hidden=${!draftsClaim}
          >Evidence relation
          <select class="field" id="model-claim-relation" .value=${this.relation} @input=${this.changeRelation}>
            <option value="supports">Supports</option>
            <option value="contradicts">Contradicts</option>
            <option value="extends">Extends</option>
          </select>
        </label>
        <label class="field-label" id="assistant-phrasing-purpose-field" ?hidden=${!phrasesPassage}
          >Rhetorical purpose
          <select class="field" id="assistant-phrasing-purpose" .value=${this.phrasingPurposeId} @input=${this.changePurpose}>
            ${phrasingPurposes().map((purpose) => html`<option value=${purpose.id}>${purpose.label}</option>`)}
          </select>
        </label>
        <fieldset class="contents" id="assistant-table-fields" ?hidden=${operation.id !== "build-table"}>
          <label class="field-label"
            >Caption
            <input
              class="field"
              id="assistant-table-caption"
              type="text"
              maxlength="500"
              placeholder="Optional table caption"
              .value=${this.tableCaption}
              @input=${this.changeTableCaption}
          /></label>
          <label class="field-label"
            >Columns · one per line
            <textarea
              class="field"
              id="assistant-table-columns"
              rows="3"
              maxlength="4000"
              placeholder="Method&#10;Dataset&#10;Score"
              .value=${this.tableColumns}
              @input=${this.changeTableColumns}
            ></textarea>
          </label>
          <label class="field-label"
            >Rows · one per line, cells separated by |
            <textarea
              class="field"
              id="assistant-table-rows"
              rows="5"
              maxlength="20000"
              placeholder="Baseline | Dataset A | 0.71&#10;Proposed | Dataset A | 0.83"
              .value=${this.tableRows}
              @input=${this.changeTableRows}
            ></textarea>
          </label>
        </fieldset>
        <label class="field-label model-instruction-field" for="model-instruction"
          ><span id="model-instruction-label">${operation.instructionLabel}</span>
          <textarea
            class="field model-instruction"
            id="model-instruction"
            maxlength="4000"
            rows="2"
            .value=${this.instruction}
            @input=${this.changeInstruction}
          ></textarea>
        </label>
        <button
          class="button-primary model-generate-action justify-center"
          id="generate-candidate"
          type="button"
          ?disabled=${this.generateDisabled}
          @click=${this.generate}
        >
          ${operation.actionLabel}
        </button>
      </div>
      <p class="mt-2 text-xs leading-5 text-app-text-soft" id="assistant-target-preview" aria-live="polite">${this.targetPreview}</p>
    `;
  }

  protected changeOperation(event: Event): void {
    const operation = assistantOperationDefinition((event.currentTarget as HTMLSelectElement).value);
    this.operationId = operation.id;
    this.instruction = operation.defaultInstruction;
    this.targetScope = operation.defaultScope ?? "selection";
    this.emitChange("operation");
  }

  protected changeTargetScope(event: Event): void {
    this.targetScope = (event.currentTarget as HTMLSelectElement).value as AssistantTargetScope;
    this.emitChange("target");
  }

  protected changeInstruction(event: Event): void {
    this.instruction = (event.currentTarget as HTMLTextAreaElement).value;
    this.emitChange("input");
  }

  protected changeRelation(event: Event): void {
    this.relation = (event.currentTarget as HTMLSelectElement).value;
    this.emitChange("input");
  }

  protected changePurpose(event: Event): void {
    this.phrasingPurposeId = (event.currentTarget as HTMLSelectElement).value;
    this.emitChange("input");
  }

  protected changeTableCaption(event: Event): void {
    this.tableCaption = (event.currentTarget as HTMLInputElement).value;
    this.emitChange("input");
  }

  protected changeTableColumns(event: Event): void {
    this.tableColumns = (event.currentTarget as HTMLTextAreaElement).value;
    this.emitChange("input");
  }

  protected changeTableRows(event: Event): void {
    this.tableRows = (event.currentTarget as HTMLTextAreaElement).value;
    this.emitChange("input");
  }

  protected generate(): void {
    if (!this.generateDisabled) this.dispatchEvent(new CustomEvent(assistantTaskGenerateEvent, { bubbles: true, composed: true }));
  }

  private emitChange(detail: AssistantTaskChange): void {
    this.dispatchEvent(new CustomEvent(assistantTaskChangeEvent, { bubbles: true, composed: true, detail }));
  }
}

if (typeof customElements !== "undefined" && !customElements.get("assistant-task-panel")) {
  customElements.define("assistant-task-panel", AssistantTaskPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "assistant-task-panel": AssistantTaskPanel;
  }
}

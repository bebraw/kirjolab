import { html, LitElement, type TemplateResult } from "lit";
import { resolveAssistantTarget, type AssistantOperationDefinition, type AssistantTargetScope } from "./assistant-operations";
import { AssistantResultPanel, type AssistantAuthoringPassage } from "./assistant-result-panel";
import { AssistantTaskPanel } from "./assistant-task-panel";
import { AssistantWorkflowStatus, type SelectedModelEvidence } from "./assistant-workflow-status";
import { CandidateListPanel } from "./candidate-list-panel";
import { CandidateReviewPanel } from "./candidate-review-panel";
import { ModelProviderSettings } from "./model-provider-settings";
import type { ModelProvider } from "./model-provider";
import type { ModelCandidate } from "../domain/workspace";

type InteractiveProvider = Pick<
  ModelProvider,
  | "buildTable"
  | "continueClarityDrill"
  | "draftClaim"
  | "formulateReferenceQuery"
  | "ideate"
  | "phrasePassage"
  | "reviseSelection"
  | "startClarityDrill"
>;

export interface AssistantGenerationInput {
  readonly evidence: SelectedModelEvidence;
  readonly insertionTarget: AssistantAuthoringPassage | null;
  readonly instruction: string;
  readonly manuscript: string;
  readonly operation: AssistantOperationDefinition;
  readonly passage: AssistantAuthoringPassage | null;
  readonly provider: InteractiveProvider;
  readonly sourceRevision: number;
}

export interface AssistantGenerationPresentation {
  readonly candidate?: ModelCandidate;
  readonly status: string;
  readonly workflow: "AWAIT_INPUT" | "COMPLETE" | "REVIEW";
}

export interface AssistantAvailabilityInput {
  readonly candidateDecisionBusy: boolean;
  readonly hasInsertionTarget: boolean;
  readonly hasPassage: boolean;
  readonly stableDocument: boolean;
  readonly workflowBusy: boolean;
}

export class AssistantGenerationPresenter extends LitElement {
  presentTask(resetResult = false): void {
    const task = this.element("assistant-task-panel", AssistantTaskPanel);
    if (!task) return;
    this.element("assistant-workflow-status", AssistantWorkflowStatus)?.setOperation(task.value.operation.id);
    if (resetResult) this.element("assistant-interactive-result", AssistantResultPanel)?.clear();
  }

  presentTarget(passage: string | null, target: { readonly start: number; readonly end: number } | null): void {
    this.element("assistant-task-panel", AssistantTaskPanel)?.showTarget({
      passage,
      scope: target && target.start !== target.end ? "selection" : this.targetScope(),
      target,
    });
  }

  targetScope(): AssistantTargetScope {
    const task = this.element("assistant-task-panel", AssistantTaskPanel);
    if (!task) return "selection";
    const { operation, targetScope } = task.value;
    return operation.scopes.includes(targetScope) ? targetScope : (operation.defaultScope ?? "selection");
  }

  presentAvailability(input: AssistantAvailabilityInput): void {
    const settings = this.element("model-provider-settings", ModelProviderSettings);
    settings?.setDiscoveryAvailable(!input.workflowBusy);
    const status = this.element("assistant-workflow-status", AssistantWorkflowStatus);
    const evidence = status?.modelEvidence();
    this.element("assistant-task-panel", AssistantTaskPanel)?.setGenerationAvailability({
      annotationEvidenceCount: evidence?.annotationItems.length ?? 0,
      discoveryBusy: settings?.discoveryBusy ?? false,
      evidenceCount: evidence?.items.length ?? 0,
      hasInsertionTarget: input.hasInsertionTarget,
      hasPassage: input.hasPassage,
      modelAvailable: Boolean(settings?.value.model.trim()),
      selectedEvidenceCount: status?.selectedEvidenceKeys.size ?? 0,
      stableDocument: input.stableDocument,
      workflowBusy: input.workflowBusy,
    });
    this.element("candidate-review-panel", CandidateReviewPanel)?.setAvailability(input.stableDocument, input.candidateDecisionBusy);
  }

  async generate(input: AssistantGenerationInput): Promise<AssistantGenerationPresentation | null> {
    const task = this.element("assistant-task-panel", AssistantTaskPanel);
    if (!task) return null;
    const candidates = this.element("candidate-list-panel", CandidateListPanel);
    if (input.operation.id === "draft-claim") {
      if (!candidates) return null;
      const candidate = await candidates.generateClaim(input.provider, {
        evidence: input.evidence.annotationReferences,
        instruction: input.instruction,
        promptEvidence: input.evidence.annotationItems,
        relation: task.claimEvidenceRelation,
      });
      return {
        candidate,
        status: "Claim draft ready. Review its proposition, note, and annotation snapshots in Context.",
        workflow: "COMPLETE",
      };
    }
    if (input.operation.id === "revise-selection") {
      if (!candidates || !input.passage) return null;
      const candidate = await candidates.generateRevision(input.provider, {
        evidence: input.evidence.references,
        instruction: input.instruction,
        promptEvidence: input.evidence.items,
        target: { ...input.passage, sourceRevision: input.sourceRevision },
      });
      return {
        candidate,
        status: "Candidate ready. Review its exact replacement and evidence in Context.",
        workflow: "COMPLETE",
      };
    }
    const result = this.element("assistant-interactive-result", AssistantResultPanel);
    if (!result) return null;
    if (input.operation.id === "build-table") {
      if (!input.insertionTarget) throw new Error("Place the manuscript caret first");
      const manuscriptContext = resolveAssistantTarget(
        input.manuscript,
        input.insertionTarget.end,
        input.insertionTarget.end,
        "paragraph",
      ).text;
      await result.generateTable(
        input.provider,
        { instruction: input.instruction, ...task.tableRequirements, manuscriptContext },
        { sourceRevision: input.sourceRevision, target: input.insertionTarget },
      );
      return { status: "Table syntax ready. Review it before inserting at the visible target.", workflow: "REVIEW" };
    }
    if (!input.passage) throw new Error("Select manuscript text first");
    const context = {
      passage: input.passage,
      evidence: input.evidence,
      instruction: input.instruction,
      sourceRevision: input.sourceRevision,
    };
    if (input.operation.id === "phrase-passage") {
      await result.generatePhrasing(input.provider, context, task.phrasingPurpose);
      return { status: "Choose one alternative to open exact before-and-after review.", workflow: "REVIEW" };
    }
    if (input.operation.id === "find-references") {
      const count = await result.discoverReferences(input.provider, {
        evidence: input.evidence.items,
        instruction: input.instruction,
        selectedPassage: input.passage.excerpt,
      });
      return {
        status: count
          ? `Found ${count} verifiable registry record${count === 1 ? "" : "s"}. Review before saving.`
          : "No verifiable registry records matched this query. Refine the search focus and try again.",
        workflow: "REVIEW",
      };
    }
    if (input.operation.id === "ideate") {
      await result.generateIdeas(input.provider, context);
      return { status: "Choose a direction to open its complete draft for exact review.", workflow: "REVIEW" };
    }
    if (input.operation.id === "clarity-drill") {
      await result.startClarityDrill(input.provider, context);
      return { status: "Answer one focused question to make the intended meaning explicit.", workflow: "AWAIT_INPUT" };
    }
    return null;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html``;
  }

  protected element<T extends HTMLElement>(id: string, constructor: abstract new () => T): T | null {
    const element = this.ownerDocument.getElementById(id);
    return element instanceof constructor ? element : null;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("assistant-generation-presenter")) {
  customElements.define("assistant-generation-presenter", AssistantGenerationPresenter);
}

declare global {
  interface HTMLElementTagNameMap {
    "assistant-generation-presenter": AssistantGenerationPresenter;
  }
}

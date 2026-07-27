import { html, LitElement, type TemplateResult } from "lit";
import { resolveAssistantTarget, type AssistantOperationDefinition, type AssistantTargetScope } from "./assistant-operations";
import {
  AssistantResultPanel,
  assistantReferenceRefreshEvent,
  assistantResultActionEvent,
  type AssistantAuthoringPassage,
  type AssistantReferenceRefresh,
  type AssistantResultActionDetail,
} from "./assistant-result-panel";
import { AssistantTaskPanel, assistantTaskChangeEvent, assistantTaskGenerateEvent, type AssistantTaskChange } from "./assistant-task-panel";
import {
  AssistantWorkflowStatus,
  assistantWorkflowActionEvent,
  type AssistantWorkflowAction,
  type SelectedModelEvidence,
} from "./assistant-workflow-status";
import { CandidateListPanel, candidateListOpenEvent } from "./candidate-list-panel";
import {
  CandidateReviewPanel,
  candidateDecisionEvent,
  candidateDecisionOutcomeEvent,
  candidateEvidenceEvent,
  type CandidateDecisionOutcome,
  type CandidateDecisionRequest,
} from "./candidate-review-panel";
import { ClaimListPanel, claimListActionEvent, type ClaimListAction } from "./claim-list-panel";
import { ModelProviderSettings, modelProviderChangeEvent } from "./model-provider-settings";
import type { ModelProvider } from "./model-provider";
import { ProjectEvidencePanel, projectEvidenceActionEvent, type ProjectEvidenceAction } from "./project-evidence-panel";
import type {
  ModelCandidate,
  ModelEvidence,
  ModelEvidenceReference,
  ModelRevisionCandidate,
  PdfResource,
  WorkspaceSnapshot,
} from "../domain/workspace";

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

export type AssistantGenerationContext = Omit<AssistantGenerationInput, "manuscript">;

export interface AssistantGenerationPreparation {
  readonly insertionTarget: AssistantAuthoringPassage | null;
  readonly passage: AssistantAuthoringPassage | null;
  readonly snapshotAvailable: boolean;
  readonly sourceRevision: number;
  readonly stableDocument: boolean;
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

export interface AssistantControlCallbacks {
  readonly completeGeneration: (workflow: AssistantGenerationPresentation["workflow"]) => void;
  readonly failGeneration: (message: string) => void;
  readonly generationBusy: () => boolean;
  readonly generationInput: () => AssistantGenerationInput | null;
  readonly openEvidenceRail: () => void;
  readonly openGeneratedCandidate: (candidate: ModelCandidate) => Promise<void>;
  readonly refreshAvailability: () => void;
  readonly refreshTarget: () => void;
  readonly reportNoEvidence: () => void;
  readonly startGeneration: (operation: AssistantOperationDefinition["id"], sourceRevision: number) => void;
}

export interface AssistantResultCallbacks {
  readonly clarityState: () => "busy" | "ready" | "stale";
  readonly completeClarity: () => void;
  readonly failClarity: (message: string) => void;
  readonly handleAction: (detail: Exclude<AssistantResultActionDetail, { readonly action: "continue-clarity" }>) => void;
  readonly refreshLibrary: () => Promise<void>;
  readonly startClarity: () => void;
}

export interface AssistantCandidateCallbacks {
  readonly completeDecision: (detail: CandidateDecisionOutcome) => void;
  readonly openCandidate: (candidate: ModelCandidate) => void;
  readonly openPaper: (pdf: PdfResource, evidence: Extract<ModelEvidence, { readonly kind: "annotation" }>) => void;
  readonly snapshot: () => WorkspaceSnapshot | null;
  readonly startDecision: (detail: CandidateDecisionRequest) => void;
}

export interface AssistantRevisionCandidateInput {
  readonly evidence: readonly ModelEvidenceReference[];
  readonly instruction: string;
  readonly model: string;
  readonly passage: AssistantAuthoringPassage;
  readonly providerLabel: string;
  readonly replacement: string;
  readonly sourceRevision: number;
}

export class AssistantGenerationPresenter extends LitElement {
  bindCandidate(apiBase: string, callbacks: AssistantCandidateCallbacks): void {
    const candidates = this.element("candidate-list-panel", CandidateListPanel);
    const review = this.element("candidate-review-panel", CandidateReviewPanel);
    candidates?.configure(apiBase);
    review?.configure(apiBase);
    candidates?.addEventListener(candidateListOpenEvent, (event) => {
      callbacks.openCandidate((event as CustomEvent<ModelCandidate>).detail);
    });
    review?.addEventListener(candidateDecisionEvent, (event) => {
      callbacks.startDecision((event as CustomEvent<CandidateDecisionRequest>).detail);
    });
    review?.addEventListener(candidateDecisionOutcomeEvent, (event) => {
      callbacks.completeDecision((event as CustomEvent<CandidateDecisionOutcome>).detail);
    });
    review?.addEventListener(candidateEvidenceEvent, (event) => {
      const evidence = (event as CustomEvent<ModelEvidence>).detail;
      const snapshot = callbacks.snapshot();
      if (evidence.kind === "annotation") {
        const pdf = snapshot?.pdfs.find(({ id }) => id === evidence.pdfId);
        if (pdf && snapshot?.annotations.some(({ id }) => id === evidence.id)) callbacks.openPaper(pdf, evidence);
      } else if (snapshot?.claims.some(({ id }) => id === evidence.id)) {
        this.element("claim-list-panel", ClaimListPanel)?.revealClaim(evidence.id, true);
      }
    });
  }

  async createRevisionCandidate(input: AssistantRevisionCandidateInput): Promise<ModelRevisionCandidate> {
    const candidates = this.element("candidate-list-panel", CandidateListPanel);
    if (!candidates) throw new Error("Candidate list is not available");
    return await candidates.createRevision({
      evidence: [...input.evidence],
      instruction: input.instruction,
      model: input.model,
      proposedReplacement: input.replacement,
      providerLabel: input.providerLabel,
      target: { ...input.passage, sourceRevision: input.sourceRevision },
    });
  }

  prepareGeneration(input: AssistantGenerationPreparation): AssistantGenerationContext | null {
    const settings = this.element("model-provider-settings", ModelProviderSettings);
    const status = this.element("assistant-workflow-status", AssistantWorkflowStatus);
    const task = this.element("assistant-task-panel", AssistantTaskPanel);
    if (!settings || !status || !task) return null;
    const { instruction, operation } = task.value;
    const evidence = status.modelEvidence();
    const insertionTarget = operation.id === "build-table" ? input.insertionTarget : null;
    if (
      !status.validateGeneration({
        evidence,
        hasInsertionTarget: insertionTarget !== null,
        hasPassage: input.passage !== null,
        operation,
        snapshotAvailable: input.snapshotAvailable,
        stableDocument: input.stableDocument,
      })
    ) {
      return null;
    }
    try {
      return {
        evidence,
        insertionTarget,
        instruction,
        operation,
        passage: input.passage,
        provider: settings.provider(),
        sourceRevision: input.sourceRevision,
      };
    } catch (error) {
      status.status = error instanceof Error ? error.message : "Enter a valid local model endpoint.";
      return null;
    }
  }

  bindResults(callbacks: AssistantResultCallbacks): void {
    const result = this.element("assistant-interactive-result", AssistantResultPanel);
    const status = this.element("assistant-workflow-status", AssistantWorkflowStatus);
    result?.addEventListener(assistantResultActionEvent, (event) => {
      const detail = (event as CustomEvent<AssistantResultActionDetail>).detail;
      if (detail.action === "continue-clarity") {
        void this.continueClarity(result, status, detail, callbacks);
      } else callbacks.handleAction(detail);
    });
    result?.addEventListener(assistantReferenceRefreshEvent, (event) => {
      const detail = (event as CustomEvent<AssistantReferenceRefresh>).detail;
      void callbacks
        .refreshLibrary()
        .then(() => {
          if (status) status.status = detail.message;
        })
        .catch(() => {
          if (status) status.status = "The reference was saved, but the refreshed Library could not be loaded.";
        })
        .finally(() => result.completeReferenceSave(detail.index, detail.requestId));
    });
  }

  private async continueClarity(
    result: AssistantResultPanel,
    status: AssistantWorkflowStatus | null,
    detail: Extract<AssistantResultActionDetail, { readonly action: "continue-clarity" }>,
    callbacks: AssistantResultCallbacks,
  ): Promise<void> {
    const answer = detail.answer.trim();
    const state = callbacks.clarityState();
    if (!answer || state !== "ready") {
      if (status) {
        status.status = !answer
          ? "Answer the clarity question first."
          : state === "stale"
            ? "The manuscript changed. Start the clarity drill again for the current target."
            : "The local model is already working.";
      }
      return;
    }
    callbacks.startClarity();
    if (status) status.status = "Turning that meaning into a few precise alternatives…";
    try {
      await result.completeClarityDrill(detail.context, answer);
      if (status) status.status = "Choose the wording that best matches your meaning; it will still open for review.";
      callbacks.completeClarity();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Local model request failed";
      if (status) status.status = message;
      callbacks.failClarity(message);
    }
  }

  bindControls(callbacks: AssistantControlCallbacks): void {
    const settings = this.element("model-provider-settings", ModelProviderSettings);
    const status = this.element("assistant-workflow-status", AssistantWorkflowStatus);
    const task = this.element("assistant-task-panel", AssistantTaskPanel);
    settings?.addEventListener(modelProviderChangeEvent, (event) => {
      const message = (event as CustomEvent<string | null>).detail;
      if (message && status) status.status = message;
      callbacks.refreshAvailability();
    });
    status?.addEventListener(assistantWorkflowActionEvent, (event) => {
      const action = (event as CustomEvent<AssistantWorkflowAction>).detail;
      if (action === "choose-evidence") this.chooseEvidence(status, callbacks);
      else settings?.open();
    });
    task?.addEventListener(assistantTaskChangeEvent, (event) => {
      const change = (event as CustomEvent<AssistantTaskChange>).detail;
      if (change === "operation") this.presentTask(true);
      if (change === "operation" || change === "target") callbacks.refreshTarget();
      callbacks.refreshAvailability();
    });
    task?.addEventListener(assistantTaskGenerateEvent, () => void this.runGeneration(status, callbacks));
    const selectEvidence = (detail: ProjectEvidenceAction | ClaimListAction): void => {
      if (detail.action !== "evidence") return;
      status?.setEvidenceSelected(detail.key, detail.selected);
      callbacks.refreshAvailability();
    };
    this.element("project-evidence-panel", ProjectEvidencePanel)?.addEventListener(projectEvidenceActionEvent, (event) => {
      selectEvidence((event as CustomEvent<ProjectEvidenceAction>).detail);
    });
    this.element("claim-list-panel", ClaimListPanel)?.addEventListener(claimListActionEvent, (event) => {
      selectEvidence((event as CustomEvent<ClaimListAction>).detail);
    });
    this.presentTask();
    callbacks.refreshTarget();
    callbacks.refreshAvailability();
  }

  private chooseEvidence(status: AssistantWorkflowStatus | null, callbacks: AssistantControlCallbacks): void {
    callbacks.openEvidenceRail();
    const focused =
      this.element("project-evidence-panel", ProjectEvidencePanel)?.focusEvidence() ||
      this.element("claim-list-panel", ClaimListPanel)?.focusEvidence();
    if (!focused) {
      if (status) status.status = "Add a PDF highlight or researcher-authored claim before choosing model evidence.";
      callbacks.reportNoEvidence();
      return;
    }
    if (status) status.status = "Choose one or more evidence resources in the Research rail, then return to the assistant.";
  }

  private async runGeneration(status: AssistantWorkflowStatus | null, callbacks: AssistantControlCallbacks): Promise<void> {
    if (callbacks.generationBusy()) return;
    const input = callbacks.generationInput();
    if (!input) return;
    callbacks.startGeneration(input.operation.id, input.sourceRevision);
    callbacks.refreshAvailability();
    status?.generationStarted(input.operation.id);
    try {
      const presentation = await this.generate(input);
      if (!presentation) throw new Error("Assistant generation is unavailable");
      if (presentation.candidate) await callbacks.openGeneratedCandidate(presentation.candidate);
      if (status) status.status = presentation.status;
      callbacks.completeGeneration(presentation.workflow);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Local model request failed";
      if (status) status.status = message;
      callbacks.failGeneration(message);
    } finally {
      callbacks.refreshAvailability();
    }
  }

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

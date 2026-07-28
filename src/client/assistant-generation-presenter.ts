import { html, LitElement, type TemplateResult } from "lit";
import { resolveAssistantTarget, type AssistantOperationDefinition, type AssistantTargetScope } from "./assistant-operations";
import {
  AssistantResultPanel,
  assistantReferenceRefreshEvent,
  assistantResultActionEvent,
  type AssistantAuthoringPassage,
  type AssistantReferenceRefresh,
  type AssistantResultActionDetail,
  type AssistantTableContext,
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
import { ClaimListPanel } from "./claim-list-panel";
import { ModelProviderSettings, modelProviderChangeEvent } from "./model-provider-settings";
import type { ModelProvider } from "./model-provider";
import { ProjectEvidencePanel } from "./project-evidence-panel";
import { RESEARCH_ASSISTANT_KEY } from "./research-context";
import { assistantWorkflowBusy, createAssistantWorkflowActor, type AssistantCandidateDecision } from "./assistant-workflow-machine";
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
  readonly hasInsertionTarget: boolean;
  readonly hasPassage: boolean;
  readonly stableDocument: boolean;
}

export interface AssistantAuthoringOwners {
  readonly editorStatus: {
    readonly authoringTarget: Pick<AssistantAuthoringPassage, "start" | "end"> | null;
    readonly manuscript: string;
  };
  readonly projectHistoryTrigger: { readonly value: number };
  readonly projectFileDialog: { readonly activeFileId: string | null };
}

export interface AssistantWorkflowOwners {
  readonly contextResourcePresenter: {
    activateContext(key: string): void;
    presentBoundContext(updateHistory?: boolean): void;
  };
  readonly editorInsertMenu: { replacePassage(target: AssistantAuthoringPassage, insertion: string): void };
  readonly toast: { show(message: string): void };
  readonly workspaceRailTabs: { navigate(tab: "research"): void };
}

export interface AssistantResourceRoutes {
  readonly focusAssistant: () => void;
  readonly openCandidate: (candidate: ModelCandidate) => void;
  readonly openPaper: (pdf: PdfResource, evidence: Extract<ModelEvidence, { readonly kind: "annotation" }>) => void;
  readonly project: () => WorkspaceSnapshot | null;
  readonly refreshLibrary: () => Promise<void>;
  readonly reportNoEvidence: () => void;
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
  private readonly workflow = createAssistantWorkflowActor();
  private authoring: AssistantAuthoringOwners | null = null;
  private collaboration: { readonly stable: boolean } | null = null;
  private workflowBinding: {
    readonly owners: AssistantWorkflowOwners;
    readonly resources: { request(): Promise<void> };
  } | null = null;
  private resources: AssistantResourceRoutes | null = null;

  bindAuthoring(collaboration: { readonly stable: boolean }, authoring: AssistantAuthoringOwners): void {
    this.collaboration = collaboration;
    this.authoring = authoring;
  }

  bindWorkflow(resources: { request(): Promise<void> }, owners: AssistantWorkflowOwners): void {
    this.workflowBinding = { owners, resources };
  }

  bindResources(resources: AssistantResourceRoutes): void {
    this.resources = resources;
  }

  private get resourceRoutes(): AssistantResourceRoutes {
    if (!this.resources) throw new Error("Assistant resource routes are not bound");
    return this.resources;
  }

  private get authoringSources(): AssistantAuthoringOwners {
    if (!this.authoring) throw new Error("Assistant authoring sources are not bound");
    return this.authoring;
  }

  private authoringPassage(kind: "insertion" | "scope"): AssistantAuthoringPassage | null {
    const authoring = this.authoringSources;
    const fileId = authoring.projectFileDialog.activeFileId;
    const target = authoring.editorStatus.authoringTarget;
    if (!fileId || !target) return null;
    const source = authoring.editorStatus.manuscript;
    const { start, end, text } =
      kind === "scope"
        ? resolveAssistantTarget(source, target.start, target.end, this.targetScope())
        : { start: target.start, end: target.end, text: source.slice(target.start, target.end) };
    if (kind === "scope" && !text.trim()) return null;
    return { fileId, start, end, excerpt: text };
  }

  private get boundWorkflow() {
    if (!this.workflowBinding) throw new Error("Assistant workflow owners are not bound");
    return this.workflowBinding;
  }

  bindWorkspace(apiBase: string): void {
    const candidates = this.element("candidate-list-panel", CandidateListPanel);
    const review = this.element("candidate-review-panel", CandidateReviewPanel);
    candidates?.configure(apiBase);
    review?.configure(apiBase);
    candidates?.addEventListener(candidateListOpenEvent, (event) => {
      this.resourceRoutes.openCandidate((event as CustomEvent<ModelCandidate>).detail);
    });
    review?.addEventListener(candidateDecisionEvent, (event) => {
      const detail = (event as CustomEvent<CandidateDecisionRequest>).detail;
      this.workflow.send({ type: "DECIDE", id: detail.candidateId, action: detail.action });
      this.decisionChanged();
    });
    review?.addEventListener(candidateDecisionOutcomeEvent, (event) => {
      void this.completeDecision((event as CustomEvent<CandidateDecisionOutcome>).detail);
    });
    review?.addEventListener(candidateEvidenceEvent, (event) => {
      const evidence = (event as CustomEvent<ModelEvidence>).detail;
      const snapshot = this.resourceRoutes.project();
      if (evidence.kind === "annotation") {
        const pdf = snapshot?.pdfs.find(({ id }) => id === evidence.pdfId);
        if (pdf && snapshot?.annotations.some(({ id }) => id === evidence.id)) this.resourceRoutes.openPaper(pdf, evidence);
      } else if (snapshot?.claims.some(({ id }) => id === evidence.id)) {
        this.element("claim-list-panel", ClaimListPanel)?.revealClaim(evidence.id, true);
      }
    });
    this.bindResults();
    this.bindControls();
  }

  private async completeDecision(detail: CandidateDecisionOutcome): Promise<void> {
    const workflow = this.boundWorkflow;
    let failure = detail.failure;
    if (failure) {
      await workflow.resources.request().catch(() => undefined);
      workflow.owners.toast.show(failure);
    } else {
      try {
        await workflow.resources.request();
        if (detail.action === "reject") workflow.owners.contextResourcePresenter.activateContext(RESEARCH_ASSISTANT_KEY);
        workflow.owners.toast.show(detail.message);
      } catch (error) {
        failure = error instanceof Error ? error.message : "Candidate decision failed";
        await workflow.resources.request().catch(() => undefined);
        workflow.owners.toast.show(failure);
      }
    }
    this.workflow.send(failure ? { type: "DECISION_FAILED", message: failure } : { type: "DECISION_DONE" });
    this.decisionChanged();
    if (!failure && detail.action === "reject") this.resourceRoutes.focusAssistant();
  }

  private async openGeneratedCandidate(candidate: ModelCandidate): Promise<void> {
    await this.boundWorkflow.resources.request();
    this.resourceRoutes.openCandidate(candidate);
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

  private generationInput(): AssistantGenerationInput | null {
    const authoring = this.authoringSources;
    const input = this.prepareGeneration({
      insertionTarget: this.authoringPassage("insertion"),
      passage: this.authoringPassage("scope"),
      snapshotAvailable: this.resourceRoutes.project() !== null,
      sourceRevision: authoring.projectHistoryTrigger.value,
      stableDocument: this.collaboration?.stable ?? false,
    });
    return input ? { ...input, manuscript: authoring.editorStatus.manuscript } : null;
  }

  private bindResults(): void {
    const result = this.element("assistant-interactive-result", AssistantResultPanel);
    const status = this.element("assistant-workflow-status", AssistantWorkflowStatus);
    result?.addEventListener(assistantResultActionEvent, (event) => {
      const detail = (event as CustomEvent<AssistantResultActionDetail>).detail;
      if (detail.action === "continue-clarity") {
        void this.continueClarity(result, status, detail);
      } else if (detail.action === "insert-table") this.insertTable(status, detail.context, detail.markdown);
      else void this.chooseRevision(status, detail);
    });
    result?.addEventListener(assistantReferenceRefreshEvent, (event) => {
      const detail = (event as CustomEvent<AssistantReferenceRefresh>).detail;
      void this.resourceRoutes
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

  private async chooseRevision(
    status: AssistantWorkflowStatus | null,
    detail: Extract<AssistantResultActionDetail, { readonly action: "choose-revision" }>,
  ): Promise<void> {
    if (!this.workflow.getSnapshot().matches("reviewing")) return;
    this.workflow.send({ type: "CONTINUE" });
    this.refreshAvailability();
    try {
      const { choice, context } = detail;
      const candidate = await this.createRevisionCandidate({
        evidence: context.evidence.references,
        instruction: choice.instruction,
        model: choice.model,
        passage: context.passage,
        providerLabel: choice.providerLabel,
        replacement: choice.replacement,
        sourceRevision: context.sourceRevision,
      });
      await this.openGeneratedCandidate(candidate);
      if (status) status.status = choice.successMessage;
      this.workflow.send({ type: "COMPLETE" });
    } catch (error) {
      const message = error instanceof Error ? error.message : detail.choice.failureMessage;
      if (status) status.status = message;
      this.workflow.send({ type: "FAIL", message });
    } finally {
      this.refreshAvailability();
    }
  }

  private insertTable(status: AssistantWorkflowStatus | null, context: AssistantTableContext, markdown: string): void {
    const authoring = this.authoringSources;
    const source = authoring.editorStatus.manuscript;
    if (
      !this.workflow.getSnapshot().matches("reviewing") ||
      !this.collaboration?.stable ||
      authoring.projectHistoryTrigger.value !== context.sourceRevision ||
      source.slice(context.target.start, context.target.end) !== context.target.excerpt
    ) {
      if (status) status.status = "The manuscript changed. Generate the table again for the current target.";
      return;
    }
    const prefix = context.target.start > 0 && source[context.target.start - 1] !== "\n" ? "\n\n" : "";
    const suffix = context.target.end < source.length && source[context.target.end] !== "\n" ? "\n\n" : "\n";
    this.workflow.send({ type: "COMPLETE" });
    this.boundWorkflow.owners.editorInsertMenu.replacePassage(context.target, `${prefix}${markdown}${suffix}`);
    if (status) status.status = "Table inserted into the manuscript.";
  }

  private async continueClarity(
    result: AssistantResultPanel,
    status: AssistantWorkflowStatus | null,
    detail: Extract<AssistantResultActionDetail, { readonly action: "continue-clarity" }>,
  ): Promise<void> {
    const answer = detail.answer.trim();
    const workflow = this.workflow.getSnapshot();
    if (!answer || !workflow.matches("awaitingInput")) {
      if (status) {
        status.status = !answer
          ? "Answer the clarity question first."
          : workflow.matches("stale")
            ? "The manuscript changed. Start the clarity drill again for the current target."
            : "The local model is already working.";
      }
      return;
    }
    this.workflow.send({ type: "CONTINUE" });
    this.refreshAvailability();
    if (status) status.status = "Turning that meaning into a few precise alternatives…";
    try {
      await result.completeClarityDrill(detail.context, answer);
      if (status) status.status = "Choose the wording that best matches your meaning; it will still open for review.";
      this.workflow.send({ type: "REVIEW" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Local model request failed";
      if (status) status.status = message;
      this.workflow.send({ type: "FAIL", message });
    } finally {
      this.refreshAvailability();
    }
  }

  private bindControls(): void {
    const settings = this.element("model-provider-settings", ModelProviderSettings);
    const status = this.element("assistant-workflow-status", AssistantWorkflowStatus);
    const task = this.element("assistant-task-panel", AssistantTaskPanel);
    settings?.addEventListener(modelProviderChangeEvent, (event) => {
      const message = (event as CustomEvent<string | null>).detail;
      if (message && status) status.status = message;
      this.refreshAvailability();
    });
    status?.addEventListener(assistantWorkflowActionEvent, (event) => {
      const action = (event as CustomEvent<AssistantWorkflowAction>).detail;
      if (action === "choose-evidence") this.chooseEvidence(status);
      else settings?.open();
    });
    task?.addEventListener(assistantTaskChangeEvent, (event) => {
      const change = (event as CustomEvent<AssistantTaskChange>).detail;
      if (change === "operation") this.presentTask(true);
      if (change === "operation" || change === "target") this.refreshTarget();
      this.refreshAvailability();
    });
    task?.addEventListener(assistantTaskGenerateEvent, () => void this.runGeneration(status));
    const selectEvidence = (key: string, selected: boolean): void => {
      status?.setEvidenceSelected(key, selected);
      this.refreshAvailability();
    };
    this.element("project-evidence-panel", ProjectEvidencePanel)?.bindEvidenceSelection(selectEvidence);
    this.element("claim-list-panel", ClaimListPanel)?.bindEvidenceSelection(selectEvidence);
    this.presentTask();
    this.refreshTarget();
    this.refreshAvailability();
  }

  private chooseEvidence(status: AssistantWorkflowStatus | null): void {
    this.boundWorkflow.owners.workspaceRailTabs.navigate("research");
    const focused =
      this.element("project-evidence-panel", ProjectEvidencePanel)?.focusEvidence() ||
      this.element("claim-list-panel", ClaimListPanel)?.focusEvidence();
    if (!focused) {
      if (status) status.status = "Add a PDF highlight or researcher-authored claim before choosing model evidence.";
      this.resourceRoutes.reportNoEvidence();
      return;
    }
    if (status) status.status = "Choose one or more evidence resources in the Research rail, then return to the assistant.";
  }

  private async runGeneration(status: AssistantWorkflowStatus | null): Promise<void> {
    if (assistantWorkflowBusy(this.workflow.getSnapshot())) return;
    const input = this.generationInput();
    if (!input) return;
    this.workflow.send({ type: "START", operation: input.operation.id, sourceRevision: input.sourceRevision });
    this.refreshAvailability();
    status?.generationStarted(input.operation.id);
    try {
      const presentation = await this.generate(input);
      if (!presentation) throw new Error("Assistant generation is unavailable");
      if (presentation.candidate) await this.openGeneratedCandidate(presentation.candidate);
      if (status) status.status = presentation.status;
      this.workflow.send({ type: presentation.workflow });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Local model request failed";
      if (status) status.status = message;
      this.workflow.send({ type: "FAIL", message });
    } finally {
      this.refreshAvailability();
    }
  }

  refreshAvailability(): void {
    this.presentAvailability({
      hasInsertionTarget: this.authoringPassage("insertion") !== null,
      hasPassage: this.authoringPassage("scope") !== null,
      stableDocument: this.collaboration?.stable ?? false,
    });
  }

  refreshTarget(): void {
    const target = this.authoringPassage("insertion");
    this.presentTarget(this.authoringPassage("scope")?.excerpt ?? null, target);
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
    const workflow = this.workflow.getSnapshot();
    const workflowBusy = assistantWorkflowBusy(workflow);
    const settings = this.element("model-provider-settings", ModelProviderSettings);
    settings?.setDiscoveryAvailable(!workflowBusy);
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
      workflowBusy,
    });
    this.element("candidate-review-panel", CandidateReviewPanel)?.setAvailability(
      input.stableDocument,
      workflow.context.candidateDecision !== null,
    );
  }

  candidateDecision(): AssistantCandidateDecision | null {
    return this.workflow.getSnapshot().context.candidateDecision;
  }

  presentCandidate(candidateId: string, snapshot: WorkspaceSnapshot, scrollPosition: number): void {
    const panel = this.element("candidate-review-panel", CandidateReviewPanel);
    panel?.setCandidate({
      candidateId,
      decision: this.candidateDecision(),
      snapshot,
      sourceRevision: this.authoringSources.projectHistoryTrigger.value,
      stableDocument: this.collaboration?.stable ?? false,
    });
    if (panel) panel.scrollPosition = scrollPosition;
  }

  private decisionChanged(): void {
    this.boundWorkflow.owners.contextResourcePresenter.presentBoundContext(false);
    this.refreshAvailability();
  }

  sourceChanged(): void {
    this.workflow.send({ type: "SOURCE_CHANGED" });
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

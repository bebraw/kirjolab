import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AssistantGenerationPresenter,
  type AssistantAuthoringOwners,
  type AssistantGenerationInput,
  type AssistantGenerationPresentation,
  type AssistantResourceRoutes,
} from "./assistant-generation-presenter";
import { assistantOperationDefinition } from "./assistant-operations";
import {
  AssistantResultPanel,
  assistantReferenceRefreshEvent,
  assistantResultActionEvent,
  type AssistantAuthoringPassage,
} from "./assistant-result-panel";
import { AssistantTaskPanel, assistantTaskChangeEvent, assistantTaskGenerateEvent } from "./assistant-task-panel";
import { AssistantWorkflowStatus, assistantWorkflowActionEvent } from "./assistant-workflow-status";
import { CandidateListPanel, candidateListOpenEvent } from "./candidate-list-panel";
import {
  CandidateReviewPanel,
  candidateDecisionEvent,
  candidateDecisionOutcomeEvent,
  candidateEvidenceEvent,
  type CandidateDecisionOutcome,
} from "./candidate-review-panel";
import { ClaimListPanel } from "./claim-list-panel";
import { OpenAICompatibleBrowserProvider } from "./model-provider";
import { ModelProviderSettings, modelProviderChangeEvent } from "./model-provider-settings";
import { ProjectEvidencePanel } from "./project-evidence-panel";
import type { ModelAnnotationEvidence, ModelClaimCandidate, ModelClaimEvidence, ModelRevisionCandidate } from "../domain/workspace";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";

const passage = { end: 18, excerpt: "Target manuscript", fileId: "main.md", start: 1 };
const provider = new OpenAICompatibleBrowserProvider({
  endpoint: "http://127.0.0.1:1234/v1",
  fetcher: vi.fn(),
  model: "local-model",
  providerLabel: "Local",
});
const revisionCandidate: ModelRevisionCandidate = {
  createdAt: "created",
  evidence: [],
  id: "candidate:revision",
  instruction: "Revise",
  model: "local-model",
  operation: "revise-selection",
  promptVersion: "revise-selection-v1",
  proposedReplacement: "Revised passage",
  providerAdapter: "openai-compatible",
  providerLabel: "Local",
  sourceRevision: 7,
  status: "pending",
  target: {
    anchor: {
      anchoredRevision: 7,
      exact: passage.excerpt,
      fileId: passage.fileId,
      originalRange: { end: passage.end, start: passage.start },
      prefix: "",
      relativeEnd: "AQ",
      relativeStart: "AA",
      suffix: "",
      version: 1,
    },
    resolution: { end: passage.end, exactMatch: true, start: passage.start, status: "resolved", text: passage.excerpt },
  },
};
const claimCandidate: ModelClaimCandidate = {
  createdAt: "created",
  evidence: [],
  id: "candidate:claim",
  instruction: "Draft claim",
  model: "local-model",
  operation: "draft-claim",
  promptVersion: "draft-claim-v1",
  proposedNote: "",
  proposedText: "Grounded claim",
  providerAdapter: "openai-compatible",
  providerLabel: "Local",
  relation: "supports",
  status: "pending",
};
const annotationEvidence: ModelAnnotationEvidence = {
  comment: "Working note",
  createdAt: "created",
  id: "annotation:1",
  kind: "annotation",
  page: 2,
  pdfId: "pdf:1",
  prefix: "Before",
  quote: "Evidence",
  rects: [],
  suffix: "After",
  updatedAt: "updated",
  version: "updated",
};
const claimEvidence: ModelClaimEvidence = {
  createdAt: "created",
  id: "claim:1",
  kind: "claim",
  note: "",
  text: "Grounded claim",
  updatedAt: "updated",
  version: "updated",
};

function input(operationId: string): AssistantGenerationInput {
  return {
    evidence: { annotationItems: [], annotationReferences: [], items: [], references: [] },
    insertionTarget: passage,
    instruction: "Keep the result precise.",
    manuscript: "\nTarget manuscript\n\nAfter",
    operation: assistantOperationDefinition(operationId),
    passage,
    provider,
    sourceRevision: 7,
  };
}

function setup() {
  const presenter = new AssistantGenerationPresenter();
  const elements = {
    "assistant-interactive-result": new AssistantResultPanel(),
    "assistant-task-panel": new AssistantTaskPanel(),
    "assistant-workflow-status": new AssistantWorkflowStatus(),
    "candidate-list-panel": new CandidateListPanel(),
    "candidate-review-panel": new CandidateReviewPanel(),
    "claim-list-panel": new ClaimListPanel(),
    "model-provider-settings": new ModelProviderSettings(),
    "project-evidence-panel": new ProjectEvidencePanel(),
  };
  Object.defineProperty(presenter, "ownerDocument", {
    value: { getElementById: (id: string) => elements[id as keyof typeof elements] ?? null },
  });
  const resources = resourceRoutes();
  const coordinator = workflowCoordinator();
  bindAuthoring(presenter);
  bindTestWorkflow(presenter, coordinator, resources);
  return { coordinator, elements, presenter, resources };
}

interface TestAuthoringValues {
  readonly fileId: string | null;
  readonly manuscript: string;
  readonly sourceRevision: number;
  readonly stableDocument: boolean;
  readonly target: Pick<AssistantAuthoringPassage, "start" | "end"> | null;
}

function authoringSources(overrides: Partial<TestAuthoringValues> = {}): {
  readonly collaboration: { readonly stable: boolean };
  readonly owners: AssistantAuthoringOwners;
} {
  const values: TestAuthoringValues = {
    fileId: passage.fileId,
    manuscript: input("revise-selection").manuscript,
    sourceRevision: 7,
    stableDocument: true,
    target: { end: passage.end, start: passage.start },
    ...overrides,
  };
  return {
    collaboration: { stable: values.stableDocument },
    owners: {
      editorStatus: { authoringTarget: values.target, manuscript: values.manuscript },
      projectFileDialog: { activeFileId: values.fileId },
      projectHistoryTrigger: { value: values.sourceRevision },
    },
  };
}

function bindAuthoring(presenter: AssistantGenerationPresenter, overrides: Partial<TestAuthoringValues> = {}): void {
  const { collaboration, owners } = authoringSources(overrides);
  presenter.bindAuthoring(collaboration, owners);
}

function resourceRoutes(overrides: Partial<AssistantResourceRoutes> = {}): AssistantResourceRoutes {
  return {
    focusAssistant: vi.fn(),
    openCandidate: vi.fn(),
    openPaper: vi.fn(),
    project: () => workspaceSnapshotFixture,
    refreshLibrary: vi.fn().mockResolvedValue(undefined),
    reportNoEvidence: vi.fn(),
    ...overrides,
  };
}

interface AssistantWorkflowCoordinator {
  readonly applyTable: (target: AssistantAuthoringPassage, insertion: string) => void;
  readonly context: { activateContext(key: string): void; presentBoundContext(updateHistory?: boolean): void };
  readonly openEvidenceRail: () => void;
  readonly presentNotice: (message: string) => void;
  readonly refreshResources: () => Promise<void>;
}

function workflowCoordinator(overrides: Partial<AssistantWorkflowCoordinator> = {}): AssistantWorkflowCoordinator {
  return {
    applyTable: vi.fn(),
    context: { activateContext: vi.fn(), presentBoundContext: vi.fn() },
    openEvidenceRail: vi.fn(),
    presentNotice: vi.fn(),
    refreshResources: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function bindTestWorkflow(
  presenter: AssistantGenerationPresenter,
  coordinator: AssistantWorkflowCoordinator,
  resources = resourceRoutes(),
): void {
  presenter.bindWorkflow(
    { request: coordinator.refreshResources },
    {
      contextResourcePresenter: { ...coordinator.context, assistantResources: () => resources },
      editorInsertMenu: { replacePassage: coordinator.applyTable },
      toast: { show: coordinator.presentNotice },
      workspaceRailTabs: { navigate: () => coordinator.openEvidenceRail() },
    },
  );
}

const resultCallbacks = workflowCoordinator;
const controlCallbacks = workflowCoordinator;

async function enterWorkflow(
  presenter: AssistantGenerationPresenter,
  elements: ReturnType<typeof setup>["elements"],
  workflow: AssistantGenerationPresentation["workflow"],
): Promise<ReturnType<typeof vi.spyOn>> {
  const generate = vi.spyOn(presenter, "generate").mockResolvedValue({ status: "Workflow ready", workflow });
  const { manuscript: _manuscript, ...context } = input("revise-selection");
  vi.spyOn(presenter, "prepareGeneration").mockReturnValue(context);
  bindTestWorkflow(presenter, controlCallbacks());
  presenter.bindWorkspace("/api/workspaces/workspace");
  elements["assistant-task-panel"].dispatchEvent(new CustomEvent(assistantTaskGenerateEvent));
  await vi.waitFor(() => expect(elements["assistant-workflow-status"].status).toBe("Workflow ready"));
  return generate;
}

describe("assistant generation presenter", () => {
  beforeEach(() => vi.stubGlobal("HTMLElement", class {}));
  afterEach(() => vi.unstubAllGlobals());

  it("binds application sources and child controls atomically", () => {
    const { coordinator, presenter, resources } = setup();
    const authoring = authoringSources();
    const owners = {
      ...authoring.owners,
      contextResourcePresenter: { ...coordinator.context, assistantResources: () => resources },
      editorInsertMenu: { replacePassage: coordinator.applyTable },
      toast: { show: coordinator.presentNotice },
      workspaceRailTabs: { navigate: () => coordinator.openEvidenceRail() },
    };
    const bindAuthoring = vi.spyOn(presenter, "bindAuthoring");
    const bindWorkflow = vi.spyOn(presenter, "bindWorkflow");
    const bindWorkspace = vi.spyOn(presenter, "bindWorkspace");

    presenter.bindApplication("/api/workspaces/workspace", authoring.collaboration, { request: coordinator.refreshResources }, owners);

    expect(bindAuthoring).toHaveBeenCalledWith(authoring.collaboration, owners);
    expect(bindWorkflow).toHaveBeenCalledWith({ request: coordinator.refreshResources }, owners);
    expect(bindWorkspace).toHaveBeenCalledWith("/api/workspaces/workspace");
  });

  it("routes table generation and returns review presentation", async () => {
    const { elements, presenter } = setup();
    vi.spyOn(elements["assistant-task-panel"], "tableRequirements", "get").mockReturnValue({
      caption: "Results",
      columns: ["Measure", "Value"],
      rows: [
        ["", ""],
        ["", ""],
      ],
    });
    const generateTable = vi.spyOn(elements["assistant-interactive-result"], "generateTable").mockResolvedValue();

    await expect(presenter.generate(input("build-table"))).resolves.toEqual({
      status: "Table syntax ready. Review it before inserting at the visible target.",
      workflow: "REVIEW",
    });
    expect(generateTable).toHaveBeenCalledWith(
      provider,
      expect.objectContaining({ caption: "Results", instruction: "Keep the result precise.", manuscriptContext: "Target manuscript" }),
      { sourceRevision: 7, target: passage },
    );
  });

  it("routes phrasing, ideas, and clarity generation", async () => {
    const { elements, presenter } = setup();
    const result = elements["assistant-interactive-result"];
    const generatePhrasing = vi.spyOn(result, "generatePhrasing").mockResolvedValue();
    const generateIdeas = vi.spyOn(result, "generateIdeas").mockResolvedValue();
    const startClarityDrill = vi.spyOn(result, "startClarityDrill").mockResolvedValue();

    await expect(presenter.generate(input("phrase-passage"))).resolves.toMatchObject({ workflow: "REVIEW" });
    await expect(presenter.generate(input("ideate"))).resolves.toMatchObject({ workflow: "REVIEW" });
    await expect(presenter.generate(input("clarity-drill"))).resolves.toEqual({
      status: "Answer one focused question to make the intended meaning explicit.",
      workflow: "AWAIT_INPUT",
    });
    expect(generatePhrasing).toHaveBeenCalledOnce();
    expect(generateIdeas).toHaveBeenCalledOnce();
    expect(startClarityDrill).toHaveBeenCalledOnce();
  });

  it("projects reference discovery counts", async () => {
    const { elements, presenter } = setup();
    const discoverReferences = vi
      .spyOn(elements["assistant-interactive-result"], "discoverReferences")
      .mockResolvedValueOnce(1)
      .mockResolvedValue(0);

    await expect(presenter.generate(input("find-references"))).resolves.toMatchObject({
      status: "Found 1 verifiable registry record. Review before saving.",
    });
    await expect(presenter.generate(input("find-references"))).resolves.toMatchObject({
      status: "No verifiable registry records matched this query. Refine the search focus and try again.",
    });
    expect(discoverReferences).toHaveBeenCalledTimes(2);
  });

  it("routes revision and claim candidates for coordinator refresh", async () => {
    const { elements, presenter } = setup();
    const candidates = elements["candidate-list-panel"];
    const generateRevision = vi.spyOn(candidates, "generateRevision").mockResolvedValue(revisionCandidate);
    const generateClaim = vi.spyOn(candidates, "generateClaim").mockResolvedValue(claimCandidate);

    await expect(presenter.generate(input("revise-selection"))).resolves.toMatchObject({
      candidate: revisionCandidate,
      workflow: "COMPLETE",
    });
    await expect(presenter.generate(input("draft-claim"))).resolves.toMatchObject({
      candidate: claimCandidate,
      workflow: "COMPLETE",
    });

    expect(generateRevision).toHaveBeenCalledWith(provider, expect.objectContaining({ target: { ...passage, sourceRevision: 7 } }));
    expect(generateClaim).toHaveBeenCalledWith(provider, expect.objectContaining({ relation: "supports" }));
  });

  it("persists a promoted revision through the candidate owner", async () => {
    const { elements, presenter } = setup();
    const createRevision = vi.spyOn(elements["candidate-list-panel"], "createRevision").mockResolvedValue(revisionCandidate);

    await expect(
      presenter.createRevisionCandidate({
        evidence: [{ id: annotationEvidence.id, kind: "annotation", version: annotationEvidence.version }],
        instruction: revisionCandidate.instruction,
        model: revisionCandidate.model,
        passage,
        providerLabel: revisionCandidate.providerLabel,
        replacement: revisionCandidate.proposedReplacement,
        sourceRevision: revisionCandidate.sourceRevision,
      }),
    ).resolves.toBe(revisionCandidate);
    expect(createRevision).toHaveBeenCalledWith({
      evidence: [{ id: annotationEvidence.id, kind: "annotation", version: annotationEvidence.version }],
      instruction: revisionCandidate.instruction,
      model: revisionCandidate.model,
      proposedReplacement: revisionCandidate.proposedReplacement,
      providerLabel: revisionCandidate.providerLabel,
      target: { ...passage, sourceRevision: revisionCandidate.sourceRevision },
    });
  });

  it("projects canonical availability across assistant owners", () => {
    const { elements, presenter } = setup();
    const settings = elements["model-provider-settings"];
    const task = elements["assistant-task-panel"];
    const review = elements["candidate-review-panel"];
    const setDiscoveryAvailable = vi.spyOn(settings, "setDiscoveryAvailable");
    const setGenerationAvailability = vi.spyOn(task, "setGenerationAvailability");
    const setReviewAvailability = vi.spyOn(review, "setAvailability");

    presenter.presentAvailability({
      hasInsertionTarget: true,
      hasPassage: false,
      stableDocument: true,
    });

    expect(setDiscoveryAvailable).toHaveBeenCalledWith(true);
    expect(setGenerationAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        hasInsertionTarget: true,
        hasPassage: false,
        stableDocument: true,
        workflowBusy: false,
      }),
    );
    expect(setReviewAvailability).toHaveBeenCalledWith(true, false);
  });

  it("prepares validated generation context from assistant-owned controls", () => {
    const { elements, presenter } = setup();
    const operation = assistantOperationDefinition("revise-selection");
    const evidence = { annotationItems: [], annotationReferences: [], items: [], references: [] };
    vi.spyOn(elements["assistant-task-panel"], "value", "get").mockReturnValue({
      instruction: "Clarify the passage",
      operation,
      phrasingPurposeId: "",
      relation: "supports",
      tableCaption: "",
      tableColumns: "",
      tableRows: "",
      targetScope: "selection",
    });
    vi.spyOn(elements["assistant-workflow-status"], "modelEvidence").mockReturnValue(evidence);
    const validateGeneration = vi.spyOn(elements["assistant-workflow-status"], "validateGeneration").mockReturnValue(true);
    vi.spyOn(elements["model-provider-settings"], "provider").mockReturnValue(provider);

    expect(
      presenter.prepareGeneration({
        insertionTarget: passage,
        passage,
        snapshotAvailable: true,
        sourceRevision: 7,
        stableDocument: true,
      }),
    ).toEqual({
      evidence,
      insertionTarget: null,
      instruction: "Clarify the passage",
      operation,
      passage,
      provider,
      sourceRevision: 7,
    });
    expect(validateGeneration).toHaveBeenCalledWith({
      evidence,
      hasInsertionTarget: false,
      hasPassage: true,
      operation,
      snapshotAvailable: true,
      stableDocument: true,
    });
  });

  it("owns assistant task reset, scope, and target presentation", () => {
    const { elements, presenter } = setup();
    const task = elements["assistant-task-panel"];
    const result = elements["assistant-interactive-result"];
    const status = elements["assistant-workflow-status"];
    const setOperation = vi.spyOn(status, "setOperation");
    const clear = vi.spyOn(result, "clear");
    const showTarget = vi.spyOn(task, "showTarget");

    presenter.presentTask(true);
    presenter.presentTarget("Selected target", { end: 12, start: 3 });

    expect(setOperation).toHaveBeenCalledWith("revise-selection");
    expect(clear).toHaveBeenCalledOnce();
    expect(showTarget).toHaveBeenCalledWith({ passage: "Selected target", scope: "selection", target: { end: 12, start: 3 } });
    expect(presenter.targetScope()).toBe("sentence");
  });

  it("owns local assistant control wiring", () => {
    const { elements, presenter, resources } = setup();
    const callbacks = controlCallbacks();
    const prepareGeneration = vi.spyOn(presenter, "prepareGeneration").mockReturnValue(null);
    const refreshAvailability = vi.spyOn(presenter, "refreshAvailability");
    const refreshTarget = vi.spyOn(presenter, "refreshTarget");
    const openSettings = vi.spyOn(elements["model-provider-settings"], "open").mockImplementation(() => undefined);
    const clearResult = vi.spyOn(elements["assistant-interactive-result"], "clear");
    const setEvidenceSelected = vi.spyOn(elements["assistant-workflow-status"], "setEvidenceSelected");
    const bindAnnotationSelection = vi.spyOn(elements["project-evidence-panel"], "bindEvidenceSelection");
    const bindClaimSelection = vi.spyOn(elements["claim-list-panel"], "bindEvidenceSelection");
    vi.spyOn(elements["project-evidence-panel"], "focusEvidence").mockReturnValue(false);
    const focusClaimEvidence = vi.spyOn(elements["claim-list-panel"], "focusEvidence").mockReturnValue(true);
    bindTestWorkflow(presenter, callbacks, resources);
    presenter.bindWorkspace("/api/workspaces/workspace");
    for (const callback of Object.values(callbacks)) {
      if (typeof callback === "function") callback.mockClear();
    }
    refreshAvailability.mockClear();
    refreshTarget.mockClear();
    vi.mocked(resources.reportNoEvidence).mockClear();

    elements["model-provider-settings"].dispatchEvent(new CustomEvent(modelProviderChangeEvent, { detail: "Provider ready" }));
    expect(elements["assistant-workflow-status"].status).toBe("Provider ready");
    elements["assistant-workflow-status"].dispatchEvent(new CustomEvent(assistantWorkflowActionEvent, { detail: "choose-evidence" }));
    elements["assistant-workflow-status"].dispatchEvent(new CustomEvent(assistantWorkflowActionEvent, { detail: "open-settings" }));
    elements["assistant-task-panel"].dispatchEvent(new CustomEvent(assistantTaskChangeEvent, { detail: "operation" }));
    elements["assistant-task-panel"].dispatchEvent(new CustomEvent(assistantTaskGenerateEvent));
    bindAnnotationSelection.mock.calls[0]![0]("annotation:1", true);
    bindClaimSelection.mock.calls[0]![0]("claim:1", false);

    expect(prepareGeneration).toHaveBeenCalledOnce();
    expect(callbacks.openEvidenceRail).toHaveBeenCalledOnce();
    expect(resources.reportNoEvidence).not.toHaveBeenCalled();
    expect(refreshAvailability).toHaveBeenCalledTimes(4);
    expect(refreshTarget).toHaveBeenCalledOnce();
    expect(setEvidenceSelected).toHaveBeenNthCalledWith(1, "annotation:1", true);
    expect(setEvidenceSelected).toHaveBeenNthCalledWith(2, "claim:1", false);
    expect(openSettings).toHaveBeenCalledOnce();
    expect(clearResult).toHaveBeenCalledOnce();

    focusClaimEvidence.mockReturnValue(false);
    elements["assistant-workflow-status"].dispatchEvent(new CustomEvent(assistantWorkflowActionEvent, { detail: "choose-evidence" }));
    expect(resources.reportNoEvidence).toHaveBeenCalledOnce();
    expect(elements["assistant-workflow-status"].status).toBe(
      "Add a PDF highlight or researcher-authored claim before choosing model evidence.",
    );
  });

  it("derives generation, availability, and target inputs from bound authoring sources", async () => {
    const { coordinator, elements, presenter } = setup();
    const { manuscript: _manuscript, ...context } = input("revise-selection");
    const prepareGeneration = vi.spyOn(presenter, "prepareGeneration").mockReturnValue(context);
    const generate = vi.spyOn(presenter, "generate").mockResolvedValue(null);
    const presentAvailability = vi.spyOn(presenter, "presentAvailability");
    const presentTarget = vi.spyOn(presenter, "presentTarget");
    bindAuthoring(presenter, {
      manuscript: input("revise-selection").manuscript,
      sourceRevision: 11,
      stableDocument: false,
    });
    bindTestWorkflow(presenter, coordinator, resourceRoutes({ project: () => null }));

    presenter.refreshAvailability();
    presenter.refreshTarget();
    presenter.bindWorkspace("/api/workspaces/workspace");
    elements["assistant-task-panel"].dispatchEvent(new CustomEvent(assistantTaskGenerateEvent));
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());

    expect(presentAvailability).toHaveBeenCalledWith({ hasInsertionTarget: true, hasPassage: true, stableDocument: false });
    expect(presentTarget).toHaveBeenCalledWith(passage.excerpt, passage);
    expect(prepareGeneration).toHaveBeenCalledWith({
      insertionTarget: passage,
      passage,
      snapshotAvailable: false,
      sourceRevision: 11,
      stableDocument: false,
    });
    expect(generate).toHaveBeenCalledWith({ ...context, manuscript: input("revise-selection").manuscript });
  });

  it("owns generation workflow and status orchestration", async () => {
    const { coordinator, elements, presenter, resources } = setup();
    const { manuscript: _manuscript, ...context } = input("revise-selection");
    const prepareGeneration = vi.spyOn(presenter, "prepareGeneration").mockReturnValue(context);
    const refreshAvailability = vi.spyOn(presenter, "refreshAvailability");
    let resolveGeneration: ((presentation: AssistantGenerationPresentation) => void) | undefined;
    const pendingGeneration = new Promise<AssistantGenerationPresentation>((resolve) => {
      resolveGeneration = resolve;
    });
    const generate = vi.spyOn(presenter, "generate").mockReturnValueOnce(pendingGeneration);
    presenter.bindWorkspace("/api/workspaces/workspace");
    vi.mocked(coordinator.refreshResources).mockClear();
    vi.mocked(resources.openCandidate).mockClear();
    refreshAvailability.mockClear();

    elements["assistant-task-panel"].dispatchEvent(new CustomEvent(assistantTaskGenerateEvent));
    elements["assistant-task-panel"].dispatchEvent(new CustomEvent(assistantTaskGenerateEvent));
    expect(prepareGeneration).toHaveBeenCalledOnce();
    resolveGeneration?.({ candidate: revisionCandidate, status: "Candidate ready.", workflow: "COMPLETE" });
    await vi.waitFor(() => expect(elements["assistant-workflow-status"].status).toBe("Candidate ready."));

    expect(coordinator.refreshResources).toHaveBeenCalledOnce();
    expect(resources.openCandidate).toHaveBeenCalledWith(revisionCandidate);
    expect(refreshAvailability).toHaveBeenCalledTimes(2);

    generate.mockResolvedValueOnce(null);
    elements["assistant-task-panel"].dispatchEvent(new CustomEvent(assistantTaskGenerateEvent));
    await vi.waitFor(() => expect(elements["assistant-workflow-status"].status).toBe("Assistant generation is unavailable"));
    expect(refreshAvailability).toHaveBeenCalledTimes(4);
  });

  it("owns transient result and reference-refresh wiring", async () => {
    const { elements, presenter } = setup();
    await enterWorkflow(presenter, elements, "REVIEW");
    const result = elements["assistant-interactive-result"];
    const applyTable = vi.fn();
    const refreshLibrary = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("offline"));
    const completeReferenceSave = vi.spyOn(result, "completeReferenceSave").mockImplementation(() => undefined);
    bindAuthoring(presenter, { manuscript: `x${passage.excerpt}` });
    bindTestWorkflow(presenter, resultCallbacks({ applyTable }), resourceRoutes({ refreshLibrary }));
    const action = { action: "insert-table", context: { sourceRevision: 7, target: passage }, markdown: "| Result |" } as const;

    result.dispatchEvent(new CustomEvent(assistantResultActionEvent, { detail: action }));
    result.dispatchEvent(
      new CustomEvent(assistantReferenceRefreshEvent, { detail: { index: 2, message: "Reference saved.", requestId: 4 } }),
    );
    await vi.waitFor(() => expect(completeReferenceSave).toHaveBeenCalledWith(2, 4));
    expect(elements["assistant-workflow-status"].status).toBe("Reference saved.");

    result.dispatchEvent(new CustomEvent(assistantReferenceRefreshEvent, { detail: { index: 3, message: "Saved again.", requestId: 5 } }));
    await vi.waitFor(() => expect(completeReferenceSave).toHaveBeenCalledWith(3, 5));

    expect(applyTable).toHaveBeenCalledWith(passage, "\n\n| Result |\n");
    expect(refreshLibrary).toHaveBeenCalledTimes(2);
    expect(elements["assistant-workflow-status"].status).toBe("The reference was saved, but the refreshed Library could not be loaded.");

    bindAuthoring(presenter, { manuscript: `x${passage.excerpt}`, stableDocument: false });
    result.dispatchEvent(new CustomEvent(assistantResultActionEvent, { detail: action }));
    expect(elements["assistant-workflow-status"].status).toBe("The manuscript changed. Generate the table again for the current target.");
  });

  it("owns clarity continuation and status presentation", async () => {
    const { elements, presenter } = setup();
    await enterWorkflow(presenter, elements, "AWAIT_INPUT");
    const result = elements["assistant-interactive-result"];
    const refreshAvailability = vi.spyOn(presenter, "refreshAvailability");
    const completeClarityDrill = vi.spyOn(result, "completeClarityDrill").mockResolvedValue();
    bindTestWorkflow(presenter, resultCallbacks());
    const context = {
      evidence: { items: [], references: [] },
      instruction: "Clarify",
      passage,
      provider,
      question: {
        issue: "The subject is vague.",
        model: "local-model",
        providerLabel: "Local",
        question: "Who performs the review?",
      },
      sourceRevision: 7,
    };

    result.dispatchEvent(new CustomEvent(assistantResultActionEvent, { detail: { action: "continue-clarity", answer: "  ", context } }));
    expect(elements["assistant-workflow-status"].status).toBe("Answer the clarity question first.");
    result.dispatchEvent(
      new CustomEvent(assistantResultActionEvent, { detail: { action: "continue-clarity", answer: " Editors do. ", context } }),
    );
    await vi.waitFor(() => expect(completeClarityDrill).toHaveBeenCalledOnce());

    expect(completeClarityDrill).toHaveBeenCalledWith(context, "Editors do.");
    expect(elements["assistant-workflow-status"].status).toBe(
      "Choose the wording that best matches your meaning; it will still open for review.",
    );
    expect(refreshAvailability).toHaveBeenCalledTimes(2);

    presenter.sourceChanged();
    result.dispatchEvent(
      new CustomEvent(assistantResultActionEvent, { detail: { action: "continue-clarity", answer: "Editors do.", context } }),
    );
    expect(elements["assistant-workflow-status"].status).toBe(
      "The manuscript changed. Start the clarity drill again for the current target.",
    );
  });

  it("projects clarity provider failure from the owned workflow", async () => {
    const { elements, presenter } = setup();
    await enterWorkflow(presenter, elements, "AWAIT_INPUT");
    const result = elements["assistant-interactive-result"];
    const refreshAvailability = vi.spyOn(presenter, "refreshAvailability");
    const failure = new Error("offline");
    vi.spyOn(result, "completeClarityDrill").mockRejectedValue(failure);
    bindTestWorkflow(presenter, resultCallbacks());
    const context = {
      evidence: { items: [], references: [] },
      instruction: "Clarify",
      passage,
      provider,
      question: { issue: "Vague.", model: "local-model", providerLabel: "Local", question: "Who?" },
      sourceRevision: 7,
    };

    result.dispatchEvent(
      new CustomEvent(assistantResultActionEvent, { detail: { action: "continue-clarity", answer: "Editors.", context } }),
    );
    await vi.waitFor(() => expect(elements["assistant-workflow-status"].status).toBe(failure.message));
    expect(refreshAvailability).toHaveBeenCalledTimes(2);
  });

  it("owns promoted revision workflow and status", async () => {
    const { coordinator, elements, presenter, resources } = setup();
    await enterWorkflow(presenter, elements, "REVIEW");
    const refreshAvailability = vi.spyOn(presenter, "refreshAvailability");
    vi.spyOn(presenter, "createRevisionCandidate").mockResolvedValueOnce(revisionCandidate);
    bindTestWorkflow(presenter, coordinator, resources);
    const detail = {
      action: "choose-revision",
      choice: {
        failureMessage: "Could not save revision",
        instruction: "Clarify",
        model: "local-model",
        providerLabel: "Local",
        replacement: "Revised passage",
        successMessage: "Revision ready.",
      },
      context: {
        evidence: { items: [], references: [] },
        instruction: "Clarify",
        passage,
        sourceRevision: 7,
      },
    } as const;

    elements["assistant-interactive-result"].dispatchEvent(new CustomEvent(assistantResultActionEvent, { detail }));
    await vi.waitFor(() => expect(resources.openCandidate).toHaveBeenCalledOnce());
    expect(coordinator.refreshResources).toHaveBeenCalledOnce();
    expect(resources.openCandidate).toHaveBeenCalledWith(revisionCandidate);
    expect(elements["assistant-workflow-status"].status).toBe("Revision ready.");
    expect(refreshAvailability).toHaveBeenCalledTimes(2);
  });

  it("projects promoted revision failure from the owned workflow", async () => {
    const { elements, presenter } = setup();
    await enterWorkflow(presenter, elements, "REVIEW");
    const failure = new Error("offline");
    vi.spyOn(presenter, "createRevisionCandidate").mockRejectedValue(failure);
    const refreshAvailability = vi.spyOn(presenter, "refreshAvailability");
    bindTestWorkflow(presenter, resultCallbacks());
    const detail = {
      action: "choose-revision",
      choice: {
        failureMessage: "Could not save revision",
        instruction: "Clarify",
        model: "local-model",
        providerLabel: "Local",
        replacement: "Revised passage",
        successMessage: "Revision ready.",
      },
      context: { evidence: { items: [], references: [] }, instruction: "Clarify", passage, sourceRevision: 7 },
    } as const;
    elements["assistant-interactive-result"].dispatchEvent(new CustomEvent(assistantResultActionEvent, { detail }));
    await vi.waitFor(() => expect(elements["assistant-workflow-status"].status).toBe(failure.message));
    expect(refreshAvailability).toHaveBeenCalledTimes(2);
  });

  it("owns candidate decision and evidence wiring", async () => {
    const { elements, presenter } = setup();
    const review = elements["candidate-review-panel"];
    const outcome: CandidateDecisionOutcome = { action: "reject", failure: null, message: "Candidate rejected." };
    const pdf = {
      contentType: "application/pdf" as const,
      createdAt: "created",
      fingerprint: "fingerprint",
      id: annotationEvidence.pdfId,
      name: "paper.pdf",
      objectKey: "pdfs/paper.pdf",
      size: 1024,
    };
    const snapshot = {
      ...workspaceSnapshotFixture,
      annotations: [{ ...annotationEvidence, fragments: [], rects: [...annotationEvidence.rects] }],
      claims: [{ ...claimEvidence }],
      pdfs: [pdf],
    };
    const callbacks = workflowCoordinator();
    const resources = resourceRoutes({ project: () => snapshot });
    const revealClaim = vi.spyOn(elements["claim-list-panel"], "revealClaim").mockReturnValue(true);
    const configureCandidates = vi.spyOn(elements["candidate-list-panel"], "configure");
    const configureReview = vi.spyOn(review, "configure");
    bindTestWorkflow(presenter, callbacks, resources);
    presenter.bindWorkspace("/api/workspaces/workspace");

    elements["candidate-list-panel"].dispatchEvent(new CustomEvent(candidateListOpenEvent, { detail: revisionCandidate }));
    review.dispatchEvent(new CustomEvent(candidateDecisionEvent, { detail: { action: "reject", candidateId: revisionCandidate.id } }));
    expect(presenter.candidateDecision()).toEqual({ action: "reject", id: revisionCandidate.id });
    const setCandidate = vi.spyOn(review, "setCandidate");
    const candidateScroll = { scrollTop: 0 };
    Object.defineProperty(review, "querySelector", { configurable: true, value: () => candidateScroll });
    presenter.presentCandidate(revisionCandidate.id, snapshot, 24);
    expect(setCandidate).toHaveBeenCalledWith({
      candidateId: revisionCandidate.id,
      decision: { action: "reject", id: revisionCandidate.id },
      snapshot,
      sourceRevision: 7,
      stableDocument: true,
    });
    expect(candidateScroll.scrollTop).toBe(24);
    review.dispatchEvent(new CustomEvent(candidateDecisionOutcomeEvent, { detail: outcome }));
    review.dispatchEvent(new CustomEvent(candidateEvidenceEvent, { detail: annotationEvidence }));
    review.dispatchEvent(new CustomEvent(candidateEvidenceEvent, { detail: claimEvidence }));

    expect(configureCandidates).toHaveBeenCalledWith("/api/workspaces/workspace");
    expect(configureReview).toHaveBeenCalledWith("/api/workspaces/workspace");
    expect(resources.openCandidate).toHaveBeenCalledWith(revisionCandidate);
    await vi.waitFor(() => expect(callbacks.context.presentBoundContext).toHaveBeenCalledTimes(2));
    expect(callbacks.refreshResources).toHaveBeenCalledOnce();
    expect(callbacks.presentNotice).toHaveBeenCalledWith(outcome.message);
    expect(callbacks.context.activateContext).toHaveBeenCalledWith("assistant");
    expect(resources.focusAssistant).toHaveBeenCalledOnce();
    expect(presenter.candidateDecision()).toBeNull();
    expect(resources.openPaper).toHaveBeenCalledWith(pdf, annotationEvidence);
    expect(revealClaim).toHaveBeenCalledWith(claimEvidence.id, true);
  });

  it.each([
    {
      expected: "Provider rejected the decision.",
      outcome: { action: "apply", failure: "Provider rejected the decision.", message: "Candidate applied." },
      refreshes: 1,
    },
    {
      expected: "Could not refresh candidates",
      outcome: { action: "apply", failure: null, message: "Candidate applied." },
      refreshes: 2,
    },
  ] satisfies readonly { expected: string; outcome: CandidateDecisionOutcome; refreshes: number }[])(
    "owns candidate decision recovery when $expected",
    async ({ expected, outcome, refreshes }) => {
      const { elements, presenter, resources } = setup();
      const callbacks = workflowCoordinator({
        context: { activateContext: vi.fn(), presentBoundContext: vi.fn() },
        refreshResources: vi.fn().mockRejectedValue(new Error("Could not refresh candidates")),
      });
      bindTestWorkflow(presenter, callbacks, resources);
      presenter.bindWorkspace("/api/workspaces/workspace");

      elements["candidate-review-panel"].dispatchEvent(
        new CustomEvent(candidateDecisionEvent, { detail: { action: "apply", candidateId: revisionCandidate.id } }),
      );
      elements["candidate-review-panel"].dispatchEvent(new CustomEvent(candidateDecisionOutcomeEvent, { detail: outcome }));

      await vi.waitFor(() => expect(callbacks.context.presentBoundContext).toHaveBeenCalledTimes(2));
      expect(callbacks.refreshResources).toHaveBeenCalledTimes(refreshes);
      expect(callbacks.presentNotice).toHaveBeenCalledWith(expected);
      expect(callbacks.context.activateContext).not.toHaveBeenCalled();
      expect(resources.focusAssistant).not.toHaveBeenCalled();
    },
  );
});

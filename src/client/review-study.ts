import {
  parseReviewStudySnapshot,
  type ReviewConceptGroup,
  type ReviewProtocolContent,
  type ReviewResearchQuestion,
  type ReviewSearchSource,
  type ReviewStudySnapshot,
  type SearchDialect,
  type SearchFieldScope,
} from "../domain/review-study";
import {
  parseReviewImportPreview,
  parseReviewSearchSnapshot,
  type ReviewDuplicateCandidate,
  type ReviewImportPreview,
  type ReviewRecord,
  type ReviewSearchSnapshot,
} from "../domain/review-search";
import {
  fullTextScreeningAllowed,
  parseReviewScreeningSnapshot,
  type ReviewScreeningSnapshot,
  type ScreeningDecisionValue,
  type ScreeningRecordState,
  type ScreeningStage,
} from "../domain/review-screening";
import {
  parseReviewEvidenceSnapshot,
  type EvidenceRecordState,
  type ExtractionValue,
  type ReviewEvidenceSnapshot,
} from "../domain/review-evidence";
import { parseReviewSynthesis, type ReviewSynthesis } from "../domain/review-synthesis";
import {
  parseReviewModelSnapshot,
  type ExtractionModelResult,
  type ReviewModelCandidate,
  type ReviewModelSnapshot,
  type ScreeningModelResult,
} from "../domain/review-model";
import { OpenAICompatibleBrowserProvider, type ModelReasoningEffort } from "./model-provider";

const facets = ["population", "intervention", "comparison", "outcome", "context"] as const;

export function bindReviewStudyPlanning(apiBase: string): void {
  const open = required("open-review-study", HTMLButtonElement);
  const close = required("close-review-study", HTMLButtonElement);
  const dialog = required("review-study-dialog", HTMLDialogElement);
  const form = required("review-protocol-form", HTMLFormElement);
  const freeze = required("freeze-review-protocol", HTMLButtonElement);
  const planStep = required("review-step-plan", HTMLButtonElement);
  const searchStep = required("review-step-search", HTMLButtonElement);
  const screenStep = required("review-step-screen", HTMLButtonElement);
  const appraiseStep = required("review-step-appraise", HTMLButtonElement);
  const extractStep = required("review-step-extract", HTMLButtonElement);
  const synthesizeStep = required("review-step-synthesize", HTMLButtonElement);
  const reportStep = required("review-step-report", HTMLButtonElement);
  const searchContent = required("review-search-content", HTMLElement);
  const screenContent = required("review-screen-content", HTMLElement);
  const appraiseContent = required("review-appraise-content", HTMLElement);
  const extractContent = required("review-extract-content", HTMLElement);
  const synthesisContent = required("review-synthesis-content", HTMLElement);
  const reportContent = required("review-report-content", HTMLElement);
  let snapshot: ReviewStudySnapshot | null = null;
  let searchSnapshot: ReviewSearchSnapshot | null = null;
  let importPreview: ReviewImportPreview | null = null;
  let screeningSnapshot: ReviewScreeningSnapshot | null = null;
  let evidenceSnapshot: ReviewEvidenceSnapshot | null = null;
  let synthesis: ReviewSynthesis | null = null;
  let modelSnapshot: ReviewModelSnapshot | null = null;

  open.addEventListener("click", () => {
    dialog.showModal();
    void load();
  });
  close.addEventListener("click", () => dialog.close());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void save();
  });
  freeze.addEventListener("click", () => void freezeProtocol());
  planStep.addEventListener("click", showPlan);
  required("back-to-review-plan", HTMLButtonElement).addEventListener("click", showPlan);
  searchStep.addEventListener("click", () => void showSearch());
  screenStep.addEventListener("click", () => void showScreen());
  appraiseStep.addEventListener("click", () => void showEvidence("appraise"));
  extractStep.addEventListener("click", () => void showEvidence("extract"));
  synthesizeStep.addEventListener("click", () => void showSynthesis());
  reportStep.addEventListener("click", showReport);
  required("back-to-review-search", HTMLButtonElement).addEventListener("click", () => void showSearch());
  required("back-to-review-screen", HTMLButtonElement).addEventListener("click", () => void showScreen());
  required("back-to-review-appraise", HTMLButtonElement).addEventListener("click", () => void showEvidence("appraise"));
  required("back-to-review-extract", HTMLButtonElement).addEventListener("click", () => void showEvidence("extract"));
  required("back-to-review-synthesis", HTMLButtonElement).addEventListener("click", () => void showSynthesis());
  required("publish-review-synthesis", HTMLButtonElement).addEventListener("click", () => void publishSynthesis());
  required("review-screen-stage", HTMLSelectElement).addEventListener("change", renderScreening);
  required("review-screen-filter", HTMLSelectElement).addEventListener("change", renderScreening);
  required("review-search-source", HTMLSelectElement).addEventListener("change", () => {
    if (snapshot) syncSourceQuery(snapshot);
  });
  required("preview-review-import", HTMLButtonElement).addEventListener("click", () => void previewImport());
  required("confirm-review-import", HTMLButtonElement).addEventListener("click", () => void confirmImport());
  required("review-search-bibtex", HTMLTextAreaElement).addEventListener("input", clearImportPreview);

  async function load(): Promise<void> {
    setStatus("Loading protocol…");
    try {
      const response = await fetch(`${apiBase}/review-study`, { credentials: "same-origin" });
      await expectOk(response);
      snapshot = parseReviewStudySnapshot(await response.json());
      render(snapshot);
      await loadSearchSnapshot();
      setStatus(`Protocol revision ${snapshot.revision} loaded.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function save(): Promise<void> {
    if (!snapshot) return;
    try {
      const content = readContent(snapshot.protocol);
      let endpoint = "/review-study/protocol";
      let method: "PUT" | "POST" = "PUT";
      let rationale: string | undefined;
      if (snapshot.protocol.status === "frozen") {
        rationale = window.prompt("Why is the frozen protocol changing?")?.trim();
        if (!rationale) return setStatus("A frozen protocol can change only with an amendment rationale.");
        endpoint = "/review-study/protocol/amend";
        method = "POST";
      }
      setStatus("Saving protocol…");
      const response = await fetch(`${apiBase}${endpoint}`, {
        method,
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: currentRevision(snapshot, searchSnapshot, screeningSnapshot, evidenceSnapshot, modelSnapshot),
          content,
          ...(rationale ? { rationale } : {}),
        }),
      });
      await expectOk(response);
      snapshot = parseReviewStudySnapshot(await response.json());
      render(snapshot);
      setStatus(snapshot.protocol.status === "frozen" ? "Protocol amendment recorded." : "Protocol saved.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function freezeProtocol(): Promise<void> {
    if (!snapshot || snapshot.protocol.status === "frozen") return;
    setStatus("Freezing protocol…");
    try {
      const response = await fetch(`${apiBase}/review-study/protocol/freeze`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: currentRevision(snapshot, searchSnapshot, screeningSnapshot, evidenceSnapshot, modelSnapshot),
        }),
      });
      await expectOk(response);
      snapshot = parseReviewStudySnapshot(await response.json());
      render(snapshot);
      setStatus("Protocol frozen. Future changes will be recorded as amendments.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function showPlan(): void {
    form.hidden = false;
    searchContent.hidden = true;
    screenContent.hidden = true;
    appraiseContent.hidden = true;
    extractContent.hidden = true;
    synthesisContent.hidden = true;
    reportContent.hidden = true;
    planStep.setAttribute("aria-current", "step");
    searchStep.removeAttribute("aria-current");
    screenStep.removeAttribute("aria-current");
    appraiseStep.removeAttribute("aria-current");
    extractStep.removeAttribute("aria-current");
    synthesizeStep.removeAttribute("aria-current");
    reportStep.removeAttribute("aria-current");
  }

  async function showSearch(): Promise<void> {
    if (!snapshot || snapshot.protocol.status !== "frozen") return;
    form.hidden = true;
    searchContent.hidden = false;
    screenContent.hidden = true;
    appraiseContent.hidden = true;
    extractContent.hidden = true;
    synthesisContent.hidden = true;
    reportContent.hidden = true;
    planStep.removeAttribute("aria-current");
    searchStep.setAttribute("aria-current", "step");
    screenStep.removeAttribute("aria-current");
    appraiseStep.removeAttribute("aria-current");
    extractStep.removeAttribute("aria-current");
    synthesizeStep.removeAttribute("aria-current");
    reportStep.removeAttribute("aria-current");
    populateSearchSources(snapshot);
    await loadSearchSnapshot();
  }

  async function loadSearchSnapshot(): Promise<void> {
    setSearchStatus("Loading search runs…");
    try {
      const response = await fetch(`${apiBase}/review-study/search-runs`, { credentials: "same-origin" });
      await expectOk(response);
      searchSnapshot = parseReviewSearchSnapshot(await response.json());
      renderSearchSnapshot(searchSnapshot);
      screenStep.disabled = searchSnapshot.counts.unique === 0;
      setSearchStatus("Search runs preserve the exact source, query, date, and import digest.");
    } catch (error) {
      setSearchStatus(errorMessage(error));
    }
  }

  async function showScreen(): Promise<void> {
    if (screenStep.disabled) return;
    form.hidden = true;
    searchContent.hidden = true;
    screenContent.hidden = false;
    appraiseContent.hidden = true;
    extractContent.hidden = true;
    synthesisContent.hidden = true;
    reportContent.hidden = true;
    planStep.removeAttribute("aria-current");
    searchStep.removeAttribute("aria-current");
    screenStep.setAttribute("aria-current", "step");
    appraiseStep.removeAttribute("aria-current");
    extractStep.removeAttribute("aria-current");
    synthesizeStep.removeAttribute("aria-current");
    reportStep.removeAttribute("aria-current");
    await loadScreening();
  }

  async function loadScreening(): Promise<void> {
    setScreenStatus("Loading screening decisions…");
    try {
      const response = await fetch(`${apiBase}/review-study/screening`, { credentials: "same-origin" });
      await expectOk(response);
      screeningSnapshot = parseReviewScreeningSnapshot(await response.json());
      await loadModelSnapshot();
      renderScreening();
      const hasIncluded = screeningSnapshot.counts.fullTextIncluded > 0;
      appraiseStep.disabled = !hasIncluded;
      extractStep.disabled = !hasIncluded;
      setScreenStatus("Decisions are append-only and attributed to the signed-in reviewer.");
    } catch (error) {
      setScreenStatus(errorMessage(error));
    }
  }

  async function showEvidence(mode: "appraise" | "extract"): Promise<void> {
    if ((mode === "appraise" ? appraiseStep : extractStep).disabled) return;
    form.hidden = true;
    searchContent.hidden = true;
    screenContent.hidden = true;
    appraiseContent.hidden = mode !== "appraise";
    extractContent.hidden = mode !== "extract";
    synthesisContent.hidden = true;
    reportContent.hidden = true;
    for (const step of [planStep, searchStep, screenStep, appraiseStep, extractStep, synthesizeStep, reportStep])
      step.removeAttribute("aria-current");
    (mode === "appraise" ? appraiseStep : extractStep).setAttribute("aria-current", "step");
    await loadEvidence();
  }

  async function loadEvidence(): Promise<void> {
    setEvidenceStatus("appraise", "Loading quality assessments…");
    setEvidenceStatus("extract", "Loading extracted data…");
    try {
      const response = await fetch(`${apiBase}/review-study/evidence`, { credentials: "same-origin" });
      await expectOk(response);
      evidenceSnapshot = parseReviewEvidenceSnapshot(await response.json());
      await loadModelSnapshot();
      renderEvidence();
      synthesizeStep.disabled = evidenceSnapshot.records.length === 0;
      setEvidenceStatus("appraise", "Scores are derived from the frozen checklist.");
      setEvidenceStatus("extract", "Extraction remains traceable to each study.");
    } catch (error) {
      setEvidenceStatus("appraise", errorMessage(error));
      setEvidenceStatus("extract", errorMessage(error));
    }
  }

  async function loadModelSnapshot(): Promise<void> {
    const response = await fetch(`${apiBase}/review-study/model-candidates`, { credentials: "same-origin" });
    await expectOk(response);
    modelSnapshot = parseReviewModelSnapshot(await response.json());
  }

  async function showSynthesis(): Promise<void> {
    if (synthesizeStep.disabled) return;
    form.hidden = true;
    searchContent.hidden = true;
    screenContent.hidden = true;
    appraiseContent.hidden = true;
    extractContent.hidden = true;
    synthesisContent.hidden = false;
    reportContent.hidden = true;
    for (const step of [planStep, searchStep, screenStep, appraiseStep, extractStep, synthesizeStep, reportStep])
      step.removeAttribute("aria-current");
    synthesizeStep.setAttribute("aria-current", "step");
    setSynthesisStatus("Deriving analysis from the current review revision…");
    try {
      const response = await fetch(`${apiBase}/review-study/synthesis`, { credentials: "same-origin" });
      await expectOk(response);
      synthesis = parseReviewSynthesis(await response.json());
      renderSynthesis(synthesis);
      reportStep.disabled = false;
      setSynthesisStatus(`Synthesis derived from review revision ${synthesis.revision}.`);
    } catch (error) {
      setSynthesisStatus(errorMessage(error));
    }
  }

  function showReport(): void {
    if (reportStep.disabled) return;
    form.hidden = true;
    searchContent.hidden = true;
    screenContent.hidden = true;
    appraiseContent.hidden = true;
    extractContent.hidden = true;
    synthesisContent.hidden = true;
    reportContent.hidden = false;
    for (const step of [planStep, searchStep, screenStep, appraiseStep, extractStep, synthesizeStep, reportStep])
      step.removeAttribute("aria-current");
    reportStep.setAttribute("aria-current", "step");
  }

  async function publishSynthesis(): Promise<void> {
    if (!synthesis) return;
    setSynthesisStatus("Publishing review/synthesis.md…");
    try {
      const projectResponse = await fetch(apiBase, { credentials: "same-origin" });
      await expectOk(projectResponse);
      const projectValue: unknown = await projectResponse.json();
      if (!isRevisionRecord(projectValue)) throw new Error("Project revision is unavailable");
      const response = await fetch(`${apiBase}/review-study/synthesis/publish`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedProjectRevision: projectValue.revision, path: "review/synthesis.md" }),
      });
      await expectOk(response);
      setSynthesisStatus(`Published review/synthesis.md from review revision ${synthesis.revision}.`);
    } catch (error) {
      setSynthesisStatus(errorMessage(error));
    }
  }

  async function previewImport(): Promise<void> {
    const bibtex = required("review-search-bibtex", HTMLTextAreaElement).value;
    setImportStatus("Validating BibTeX without changing the review…");
    try {
      const response = await fetch(`${apiBase}/review-study/search-import-previews`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bibtex }),
      });
      await expectOk(response);
      importPreview = parseReviewImportPreview(await response.json());
      renderImportPreview(importPreview);
      required("confirm-review-import", HTMLButtonElement).disabled = false;
      setImportStatus("Preview ready. Confirm only if the source, query, date, and record counts are correct.");
    } catch (error) {
      clearImportPreview();
      setImportStatus(errorMessage(error));
    }
  }

  async function confirmImport(): Promise<void> {
    if (!snapshot || !searchSnapshot || !importPreview) return;
    const sourceId = required("review-search-source", HTMLSelectElement).value;
    const searchedAt = required("review-searched-at", HTMLInputElement).value;
    if (!searchedAt) return setImportStatus("Record when this source search was executed.");
    setImportStatus("Recording immutable search run…");
    try {
      const response = await fetch(`${apiBase}/review-study/search-runs`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: searchSnapshot.revision,
          sourceId,
          query: required("review-search-query", HTMLTextAreaElement).value,
          searchedAt: new Date(searchedAt).toISOString(),
          bibtex: required("review-search-bibtex", HTMLTextAreaElement).value,
          digest: importPreview.digest,
        }),
      });
      await expectOk(response);
      searchSnapshot = parseReviewSearchSnapshot(await response.json());
      clearImportPreview();
      required("review-search-bibtex", HTMLTextAreaElement).value = "";
      renderSearchSnapshot(searchSnapshot);
      screenStep.disabled = searchSnapshot.counts.unique === 0;
      setImportStatus("Immutable search run recorded.");
    } catch (error) {
      setImportStatus(errorMessage(error));
    }
  }

  async function resolveDuplicate(
    candidate: ReviewDuplicateCandidate,
    action: "merge" | "distinct",
    canonicalRecordId: string | null,
  ): Promise<void> {
    if (!searchSnapshot) return;
    setSearchStatus("Recording duplicate review…");
    try {
      const response = await fetch(`${apiBase}/review-study/duplicate-candidates/${candidate.id}/resolve`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: searchSnapshot.revision, action, canonicalRecordId }),
      });
      await expectOk(response);
      searchSnapshot = parseReviewSearchSnapshot(await response.json());
      renderSearchSnapshot(searchSnapshot);
      screenStep.disabled = searchSnapshot.counts.unique === 0;
      setSearchStatus(
        action === "merge" ? "Duplicate merged; both source occurrences remain in provenance." : "Records marked as distinct.",
      );
    } catch (error) {
      setSearchStatus(errorMessage(error));
    }
  }

  async function submitDecision(recordId: string, stage: ScreeningStage, formElement: HTMLFormElement): Promise<void> {
    if (!screeningSnapshot) return;
    const data = new FormData(formElement);
    setScreenStatus("Recording screening decision…");
    try {
      const response = await fetch(`${apiBase}/review-study/records/${recordId}/screening-decisions`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: latestReviewRevision(screeningSnapshot.revision, modelSnapshot?.revision),
          stage,
          decision: screeningDecisionValue(data.get("decision")),
          criterion: String(data.get("criterion") ?? ""),
          reason: String(data.get("reason") ?? ""),
        }),
      });
      await expectOk(response);
      screeningSnapshot = parseReviewScreeningSnapshot(await response.json());
      await loadModelSnapshot();
      renderScreening();
      setScreenStatus("Screening decision recorded.");
    } catch (error) {
      setScreenStatus(errorMessage(error));
    }
  }

  async function generateScreeningCandidate(state: ScreeningRecordState): Promise<void> {
    if (!snapshot || !screeningSnapshot || snapshot.protocol.modelAssistance.mode === "off") return;
    setScreenStatus("Asking the configured local model for a reviewable screening candidate…");
    try {
      const provider = reviewModelProvider();
      const suggestion = await provider.screenReviewRecord({
        title: state.record.metadata.title,
        abstract: state.record.metadata.abstract,
        inclusionCriteria: snapshot.protocol.inclusionCriteria,
        exclusionCriteria: snapshot.protocol.exclusionCriteria,
      });
      const response = await fetch(`${apiBase}/review-study/model-candidates`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: latestReviewRevision(screeningSnapshot.revision, modelSnapshot?.revision),
          operation: "screen-record",
          recordId: state.record.id,
          stage: "title-abstract",
          provider: suggestion.providerLabel,
          model: suggestion.model,
          promptTemplateVersion: "review-screening-v1",
          sourceScope: ["bibliographic title", "bibliographic abstract", "frozen eligibility criteria"],
          result: {
            decision: suggestion.decision,
            criterion: suggestion.criterion,
            rationale: suggestion.rationale,
            evidence: suggestion.evidence,
          },
        }),
      });
      await expectOk(response);
      modelSnapshot = parseReviewModelSnapshot(await response.json());
      renderScreening();
      setScreenStatus(
        snapshot.protocol.modelAssistance.mode === "human-first"
          ? "Candidate recorded and hidden until your initial decision."
          : "Candidate recorded. Accept or reject it explicitly.",
      );
    } catch (error) {
      setScreenStatus(errorMessage(error));
    }
  }

  async function generateExtractionCandidate(
    record: EvidenceRecordState,
    field: ReviewEvidenceSnapshot["protocol"]["extractionFields"][number],
    formElement: HTMLFormElement,
  ): Promise<void> {
    if (!snapshot || !evidenceSnapshot || snapshot.protocol.modelAssistance.mode === "off") return;
    const data = new FormData(formElement);
    const pointer = evidenceFromForm(data);
    if (!pointer.quote.trim()) return setEvidenceStatus("extract", "Paste the exact authorized quotation before asking the model.");
    setEvidenceStatus("extract", "Asking the configured local model for a typed extraction candidate…");
    try {
      const provider = reviewModelProvider();
      const suggestion = await provider.extractReviewField({
        title: record.record.metadata.title,
        fieldId: field.id,
        fieldLabel: field.label,
        fieldType: field.type,
        allowedValues: field.values,
        quote: pointer.quote,
        page: pointer.page,
        location: pointer.location,
      });
      const response = await fetch(`${apiBase}/review-study/model-candidates`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: latestReviewRevision(evidenceSnapshot.revision, modelSnapshot?.revision),
          operation: "extract-field",
          recordId: record.record.id,
          stage: null,
          provider: suggestion.providerLabel,
          model: suggestion.model,
          promptTemplateVersion: "review-extraction-v1",
          sourceScope: ["researcher-authorized exact quotation", "frozen extraction field"],
          result: {
            fieldId: suggestion.fieldId,
            value: suggestion.value,
            missingReason: suggestion.missingReason,
            evidence: suggestion.evidence,
            rationale: suggestion.rationale,
          },
        }),
      });
      await expectOk(response);
      modelSnapshot = parseReviewModelSnapshot(await response.json());
      renderEvidence();
      setEvidenceStatus(
        "extract",
        snapshot.protocol.modelAssistance.mode === "human-first"
          ? "Candidate recorded and hidden until your initial extraction."
          : "Candidate recorded. Accept or reject it explicitly.",
      );
    } catch (error) {
      setEvidenceStatus("extract", errorMessage(error));
    }
  }

  async function resolveModelCandidate(candidate: ReviewModelCandidate, action: "accept" | "reject"): Promise<void> {
    if (!modelSnapshot) return;
    try {
      const response = await fetch(`${apiBase}/review-study/model-candidates/${candidate.id}/${action}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: modelSnapshot.revision }),
      });
      await expectOk(response);
      modelSnapshot = parseReviewModelSnapshot(await response.json());
      if (candidate.operation === "screen-record") await loadScreening();
      else await loadEvidence();
    } catch (error) {
      if (candidate.operation === "screen-record") setScreenStatus(errorMessage(error));
      else setEvidenceStatus("extract", errorMessage(error));
    }
  }

  async function adjudicate(recordId: string, stage: ScreeningStage, outcome: "include" | "exclude"): Promise<void> {
    if (!screeningSnapshot) return;
    const reason = window.prompt("Record the consensus rationale:")?.trim();
    if (!reason) return;
    setScreenStatus("Recording adjudication…");
    try {
      const response = await fetch(`${apiBase}/review-study/records/${recordId}/screening-adjudications`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: screeningSnapshot.revision, stage, outcome, reason }),
      });
      await expectOk(response);
      screeningSnapshot = parseReviewScreeningSnapshot(await response.json());
      renderScreening();
      setScreenStatus("Conflict adjudicated without replacing reviewer decisions.");
    } catch (error) {
      setScreenStatus(errorMessage(error));
    }
  }

  function renderScreening(): void {
    if (!screeningSnapshot || !snapshot) return;
    const protocolSnapshot = snapshot;
    const stage = screeningStageValue(required("review-screen-stage", HTMLSelectElement).value);
    const filter = required("review-screen-filter", HTMLSelectElement).value;
    const states = screeningSnapshot.records.filter((state) => {
      if (stage === "full-text" && !fullTextScreeningAllowed(state)) return false;
      const outcome = screeningStateFor(state, stage).outcome;
      return filter === "all" || outcome === filter;
    });
    required("review-screen-policy", HTMLElement).textContent =
      `${screeningSnapshot.reviewersPerStage === 2 ? "Two independent reviewers" : "One reviewer"} per stage${screeningSnapshot.blinded ? " · pending decisions blinded" : ""}`;
    required("review-screen-counts", HTMLElement).textContent =
      `${stage === "title-abstract" ? screeningSnapshot.counts.titleAbstractPending : screeningSnapshot.counts.fullTextPending} pending · ${screeningSnapshot.counts.conflicts} conflicts`;
    const list = required("review-screen-list", HTMLElement);
    list.replaceChildren(
      ...(states.length
        ? states.map((state) =>
            screeningCard(
              state,
              stage,
              protocolSnapshot,
              (recordId, formElement) => submitDecision(recordId, stage, formElement),
              (recordId, outcome) => adjudicate(recordId, stage, outcome),
              stage === "title-abstract" && protocolSnapshot.protocol.modelAssistance.mode !== "off"
                ? (record) => generateScreeningCandidate(record)
                : null,
              modelSnapshot?.candidates.filter(
                (candidate) =>
                  candidate.operation === "screen-record" && candidate.recordId === state.record.id && candidate.stage === stage,
              ) ?? [],
              resolveModelCandidate,
            ),
          )
        : [emptyState("No records match this screening view.")]),
    );
    syncEvidenceSteps(screeningSnapshot, appraiseStep, extractStep);
  }

  async function submitQuality(recordId: string, questionId: string, formElement: HTMLFormElement): Promise<void> {
    if (!evidenceSnapshot) return;
    const data = new FormData(formElement);
    setEvidenceStatus("appraise", "Recording quality answer…");
    try {
      const response = await fetch(`${apiBase}/review-study/records/${recordId}/quality-values`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: latestReviewRevision(evidenceSnapshot.revision, modelSnapshot?.revision),
          questionId,
          answerId: String(data.get("answer") ?? ""),
          evidence: evidenceFromForm(data),
        }),
      });
      await expectOk(response);
      evidenceSnapshot = parseReviewEvidenceSnapshot(await response.json());
      await loadModelSnapshot();
      renderEvidence();
      setEvidenceStatus("appraise", "Quality answer recorded with evidence.");
    } catch (error) {
      setEvidenceStatus("appraise", errorMessage(error));
    }
  }

  async function submitExtraction(recordId: string, fieldId: string, fieldType: string, formElement: HTMLFormElement): Promise<void> {
    if (!evidenceSnapshot) return;
    const data = new FormData(formElement);
    const missingReason = String(data.get("missingReason") ?? "").trim();
    setEvidenceStatus("extract", "Recording extracted value…");
    try {
      const response = await fetch(`${apiBase}/review-study/records/${recordId}/extraction-values`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: latestReviewRevision(evidenceSnapshot.revision, modelSnapshot?.revision),
          fieldId,
          value: missingReason ? null : extractionValueFromForm(data.get("value"), fieldType),
          missingReason: missingReason || null,
          evidence: missingReason ? null : evidenceFromForm(data),
        }),
      });
      await expectOk(response);
      evidenceSnapshot = parseReviewEvidenceSnapshot(await response.json());
      await loadModelSnapshot();
      renderEvidence();
      setEvidenceStatus("extract", "Extracted value recorded with provenance.");
    } catch (error) {
      setEvidenceStatus("extract", errorMessage(error));
    }
  }

  function renderEvidence(): void {
    if (!evidenceSnapshot) return;
    const currentEvidence = evidenceSnapshot;
    const appraiseList = required("review-appraise-list", HTMLElement);
    appraiseList.replaceChildren(
      ...(evidenceSnapshot.records.length
        ? currentEvidence.records.map((record) => appraisalCard(record, currentEvidence, submitQuality))
        : [emptyState("No full-text inclusions are ready for appraisal.")]),
    );
    const extractList = required("review-extract-list", HTMLElement);
    extractList.replaceChildren(
      ...(evidenceSnapshot.records.length
        ? currentEvidence.records.map((record) =>
            extractionCard(
              record,
              currentEvidence,
              submitExtraction,
              snapshot?.protocol.modelAssistance.mode === "off" ? null : generateExtractionCandidate,
              modelSnapshot?.candidates.filter(
                (candidate) => candidate.operation === "extract-field" && candidate.recordId === record.record.id,
              ) ?? [],
              resolveModelCandidate,
            ),
          )
        : [emptyState("No full-text inclusions are ready for extraction.")]),
    );
  }

  function renderSearchSnapshot(value: ReviewSearchSnapshot): void {
    required("review-search-run-count", HTMLElement).textContent = String(value.runs.length);
    required("review-search-counts", HTMLElement).textContent = `${value.counts.unique} unique · ${value.counts.duplicatesRemoved} removed`;
    const runs = required("review-search-runs", HTMLElement);
    runs.replaceChildren(...(value.runs.length ? value.runs.map(renderSearchRun) : [emptyState("No source searches imported.")]));
    const candidates = required("review-duplicate-list", HTMLElement);
    const pending = value.duplicateCandidates.filter((candidate) => candidate.status === "pending");
    candidates.replaceChildren(
      ...(pending.length
        ? pending.map((candidate) => renderDuplicateCandidate(candidate, value.records, resolveDuplicate))
        : [emptyState("No unresolved duplicate candidates.")]),
    );
  }
}

function render(snapshot: ReviewStudySnapshot): void {
  const protocol = snapshot.protocol;
  required("review-profile", HTMLSelectElement).value = protocol.profile;
  required("review-objective", HTMLTextAreaElement).value = protocol.objective;
  for (const facet of facets) required(`review-picoc-${facet}`, HTMLInputElement).value = protocol.picoc[facet];
  required("review-questions", HTMLTextAreaElement).value = protocol.researchQuestions.map((question) => question.text).join("\n");
  required("review-concepts", HTMLTextAreaElement).value = protocol.conceptGroups
    .map((group) => `${group.label} :: ${group.terms.join("; ")}`)
    .join("\n");
  required("review-sources", HTMLTextAreaElement).value = protocol.sources
    .map((source) => `${source.name} | ${source.url} | ${source.dialect} | ${source.fieldScope}`)
    .join("\n");
  required("review-known-studies", HTMLTextAreaElement).value = protocol.knownRelevantStudies
    .map((study) => `${study.title} | ${study.abstract.replaceAll(/\s+/gu, " ")}`)
    .join("\n");
  required("review-inclusion-criteria", HTMLTextAreaElement).value = protocol.inclusionCriteria.join("\n");
  required("review-exclusion-criteria", HTMLTextAreaElement).value = protocol.exclusionCriteria.join("\n");
  required("review-reviewer-count", HTMLSelectElement).value = String(protocol.screening.reviewersPerStage);
  required("review-model-mode", HTMLSelectElement).value = protocol.modelAssistance.mode;
  required("review-blinded", HTMLInputElement).checked = protocol.screening.blinded;
  required("review-quality-questions", HTMLTextAreaElement).value = protocol.qualityAssessment.questions
    .map((question) => question.text)
    .join("\n");
  required("review-quality-answers", HTMLTextAreaElement).value = protocol.qualityAssessment.answers
    .map((answer) => `${answer.label} | ${answer.weight} | ${answer.rejects ? "reject" : ""}`)
    .join("\n");
  required("review-quality-minimum", HTMLInputElement).value =
    protocol.qualityAssessment.minimumScore === null ? "" : String(protocol.qualityAssessment.minimumScore);
  required("review-extraction-fields", HTMLTextAreaElement).value = protocol.extractionFields
    .map((field) => `${field.label} | ${field.type} | ${field.values.join("; ")} | ${field.researchQuestionIds.join("; ")}`)
    .join("\n");
  required("review-protocol-state", HTMLElement).textContent =
    `${protocol.status === "frozen" ? "Frozen" : "Draft"} · r${snapshot.revision}`;
  required("freeze-review-protocol", HTMLButtonElement).disabled = protocol.status === "frozen";
  required("review-step-search", HTMLButtonElement).disabled = protocol.status !== "frozen";
  required("review-calibration", HTMLElement).textContent = `${protocol.calibration.matched} / ${protocol.calibration.total} seeds`;
  renderQueries(protocol);
}

function populateSearchSources(snapshot: ReviewStudySnapshot): void {
  const select = required("review-search-source", HTMLSelectElement);
  const selected = select.value;
  select.replaceChildren(
    ...snapshot.protocol.sources.map((source) => {
      const option = document.createElement("option");
      option.value = source.id;
      option.textContent = source.name;
      return option;
    }),
  );
  if (snapshot.protocol.sources.some((source) => source.id === selected)) select.value = selected;
  syncSourceQuery(snapshot);
  const searchedAt = required("review-searched-at", HTMLInputElement);
  if (!searchedAt.value) searchedAt.value = localDateTime(new Date());
}

function syncSourceQuery(snapshot: ReviewStudySnapshot): void {
  const sourceId = required("review-search-source", HTMLSelectElement).value;
  const plan = snapshot.protocol.sourceQueries.find((candidate) => candidate.sourceId === sourceId);
  required("review-search-query", HTMLTextAreaElement).value = plan?.query ?? snapshot.protocol.logicalQuery;
}

function renderImportPreview(preview: ReviewImportPreview): void {
  const container = required("review-import-preview", HTMLElement);
  container.replaceChildren();
  const summary = document.createElement("div");
  summary.className = "review-import-summary";
  summary.append(
    metric(preview.records.length, "valid records"),
    metric(preview.skippedEntries, "skipped entries"),
    metric(preview.records.filter((record) => record.warnings.length > 0).length, "with warnings"),
  );
  container.append(summary);
}

function clearImportPreview(): void {
  required("review-import-preview", HTMLElement).replaceChildren();
  required("confirm-review-import", HTMLButtonElement).disabled = true;
}

function metric(value: number, label: string): HTMLElement {
  const element = document.createElement("span");
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  const small = document.createElement("small");
  small.textContent = label;
  element.append(strong, small);
  return element;
}

function renderSearchRun(run: ReviewSearchSnapshot["runs"][number]): HTMLElement {
  const item = document.createElement("article");
  item.className = "review-query-item";
  const title = document.createElement("strong");
  title.textContent = `${run.sourceName} · ${run.occurrenceCount} records`;
  const meta = document.createElement("p");
  meta.className = "review-field-help";
  meta.textContent = `Searched ${formatDate(run.searchedAt)} · imported by ${run.importedBy} · protocol r${run.protocolRevision}`;
  const query = document.createElement("pre");
  query.textContent = run.query;
  const digest = document.createElement("p");
  digest.className = "review-field-help";
  digest.textContent = `SHA-256 ${run.digest.slice(0, 16)}…`;
  item.append(title, meta, query, digest);
  return item;
}

function renderDuplicateCandidate(
  candidate: ReviewDuplicateCandidate,
  records: readonly ReviewRecord[],
  resolve: (candidate: ReviewDuplicateCandidate, action: "merge" | "distinct", canonicalRecordId: string | null) => Promise<void>,
): HTMLElement {
  const left = records.find((record) => record.id === candidate.leftId);
  const right = records.find((record) => record.id === candidate.rightId);
  const item = document.createElement("article");
  item.className = "review-query-item";
  const title = document.createElement("strong");
  title.textContent = candidate.confidence === "exact" ? "Exact duplicate signal" : "Probable duplicate";
  const comparison = document.createElement("p");
  comparison.className = "review-field-help";
  comparison.textContent = `${recordLabel(left)} ↔ ${recordLabel(right)} · ${candidate.signals.join(", ")}`;
  const actions = document.createElement("div");
  actions.className = "review-duplicate-actions";
  actions.append(
    actionButton("Keep first", () => void resolve(candidate, "merge", candidate.leftId)),
    actionButton("Keep second", () => void resolve(candidate, "merge", candidate.rightId)),
    actionButton("Not duplicates", () => void resolve(candidate, "distinct", null)),
  );
  item.append(title, comparison, actions);
  return item;
}

function screeningCard(
  state: ScreeningRecordState,
  stage: ScreeningStage,
  protocolSnapshot: ReviewStudySnapshot,
  submit: (recordId: string, form: HTMLFormElement) => Promise<void>,
  adjudicate: (recordId: string, outcome: "include" | "exclude") => Promise<void>,
  generateCandidate: ((record: ScreeningRecordState) => Promise<void>) | null,
  candidates: readonly ReviewModelCandidate[],
  resolveCandidate: (candidate: ReviewModelCandidate, action: "accept" | "reject") => Promise<void>,
): HTMLElement {
  const stageState = screeningStateFor(state, stage);
  const card = document.createElement("article");
  card.className = "review-screen-card";
  const header = document.createElement("header");
  const identity = document.createElement("div");
  const title = document.createElement("h4");
  title.textContent = state.record.metadata.title;
  const meta = document.createElement("p");
  meta.className = "review-screen-meta";
  meta.textContent = `${state.record.metadata.authors.join("; ") || "Unknown authors"} · ${state.record.metadata.year || "No year"} · ${state.record.metadata.venue || "No venue"}`;
  identity.append(title, meta);
  const badge = document.createElement("span");
  badge.className = "count-badge";
  badge.textContent = stageState.outcome;
  header.append(identity, badge);
  const abstract = document.createElement("p");
  abstract.className = "review-screen-abstract";
  abstract.textContent = state.record.metadata.abstract || "No abstract was present in the imported record.";
  card.append(header, abstract);

  if (stageState.outcome === "conflict") {
    const actions = document.createElement("div");
    actions.className = "review-duplicate-actions";
    actions.append(
      actionButton("Adjudicate include", () => void adjudicate(state.record.id, "include")),
      actionButton("Adjudicate exclude", () => void adjudicate(state.record.id, "exclude")),
    );
    card.append(actions);
  } else {
    const form = document.createElement("form");
    form.className = "review-screen-form";
    form.append(
      selectField("Decision", "decision", ["include", "exclude", "uncertain"]),
      selectField("Criterion", "criterion", [
        "",
        ...protocolSnapshot.protocol.inclusionCriteria,
        ...protocolSnapshot.protocol.exclusionCriteria,
      ]),
      inputField("Reason", "reason", "Required when excluding"),
    );
    const save = document.createElement("button");
    save.className = "button-primary";
    save.type = "submit";
    save.textContent = stageState.decisions.length > 0 ? "Revise decision" : "Record decision";
    form.append(save);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit(state.record.id, form);
    });
    card.append(form);
  }
  if (generateCandidate) card.append(actionButton("Ask local model", () => void generateCandidate(state)));
  for (const candidate of candidates) card.append(modelCandidateCard(candidate, resolveCandidate));
  if (stageState.decisions.length > 0) {
    const history = document.createElement("p");
    history.className = "review-decision-history";
    history.textContent = stageState.decisions
      .map((decision) => `${decision.reviewer}: ${decision.decision}${decision.reason ? ` — ${decision.reason}` : ""}`)
      .join(" · ");
    card.append(history);
  }
  return card;
}

function screeningStateFor(state: ScreeningRecordState, stage: ScreeningStage) {
  return stage === "title-abstract" ? state.titleAbstract : state.fullText;
}

function selectField(labelText: string, name: string, values: readonly string[]): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = labelText;
  const select = document.createElement("select");
  select.className = "field";
  select.name = name;
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value || "No criterion";
    select.append(option);
  }
  label.append(select);
  return label;
}

function inputField(labelText: string, name: string, placeholder: string): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = labelText;
  const input = document.createElement("input");
  input.className = "field";
  input.name = name;
  input.maxLength = 2_000;
  input.placeholder = placeholder;
  label.append(input);
  return label;
}

function screeningStageValue(value: string): ScreeningStage {
  return value === "full-text" ? "full-text" : "title-abstract";
}

function screeningDecisionValue(value: FormDataEntryValue | null): ScreeningDecisionValue {
  return value === "exclude" || value === "uncertain" ? value : "include";
}

function appraisalCard(
  record: EvidenceRecordState,
  snapshot: ReviewEvidenceSnapshot,
  submit: (recordId: string, questionId: string, form: HTMLFormElement) => Promise<void>,
): HTMLElement {
  const card = evidenceCardHeader(record, `Score ${record.qualityScore}${record.qualityRejected ? " · rejected" : ""}`);
  for (const question of snapshot.protocol.qualityAssessment.questions) {
    const form = document.createElement("form");
    form.className = "review-evidence-form";
    const heading = document.createElement("strong");
    heading.textContent = question.text;
    form.append(
      heading,
      selectField(
        "Answer",
        "answer",
        snapshot.protocol.qualityAssessment.answers.map((answer) => answer.id),
      ),
    );
    const answerSelect = form.querySelector<HTMLSelectElement>('select[name="answer"]')!;
    for (const option of answerSelect.options) {
      const answer = snapshot.protocol.qualityAssessment.answers.find((candidate) => candidate.id === option.value);
      option.textContent = answer ? `${answer.label} (${answer.weight})` : option.value;
    }
    form.append(...evidenceFields());
    const save = actionButton("Save answer", () => undefined);
    save.className = "button-primary";
    save.type = "submit";
    form.append(save);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit(record.record.id, question.id, form);
    });
    card.append(form);
  }
  return card;
}

function extractionCard(
  record: EvidenceRecordState,
  snapshot: ReviewEvidenceSnapshot,
  submit: (recordId: string, fieldId: string, fieldType: string, form: HTMLFormElement) => Promise<void>,
  generateCandidate:
    | ((
        record: EvidenceRecordState,
        field: ReviewEvidenceSnapshot["protocol"]["extractionFields"][number],
        form: HTMLFormElement,
      ) => Promise<void>)
    | null,
  candidates: readonly ReviewModelCandidate[],
  resolveCandidate: (candidate: ReviewModelCandidate, action: "accept" | "reject") => Promise<void>,
): HTMLElement {
  const card = evidenceCardHeader(record, record.extractionComplete ? "Complete" : "In progress");
  for (const field of snapshot.protocol.extractionFields) {
    const form = document.createElement("form");
    form.className = "review-evidence-form";
    const heading = document.createElement("strong");
    heading.textContent = field.label;
    form.append(heading, extractionInput(field));
    form.append(inputField("Missing reason", "missingReason", "Use only when the value is absent"), ...evidenceFields());
    const save = actionButton("Save value", () => undefined);
    save.className = "button-primary";
    save.type = "submit";
    form.append(save);
    if (generateCandidate) {
      form.append(actionButton("Ask local model", () => void generateCandidate(record, field, form)));
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void submit(record.record.id, field.id, field.type, form);
    });
    card.append(form);
    for (const candidate of candidates) {
      if (candidate.operation === "extract-field" && (candidate.result as ExtractionModelResult).fieldId === field.id) {
        card.append(modelCandidateCard(candidate, resolveCandidate));
      }
    }
  }
  return card;
}

function evidenceCardHeader(record: EvidenceRecordState, status: string): HTMLElement {
  const card = document.createElement("article");
  card.className = "review-screen-card";
  const header = document.createElement("header");
  const title = document.createElement("h4");
  title.textContent = record.record.metadata.title;
  const badge = document.createElement("span");
  badge.className = "count-badge";
  badge.textContent = status;
  header.append(title, badge);
  card.append(header);
  return card;
}

function evidenceFields(): [HTMLLabelElement, HTMLLabelElement, HTMLLabelElement] {
  const quote = inputField("Exact quotation", "quote", "Required evidence passage");
  const page = inputField("Page", "page", "Optional page");
  page.querySelector("input")!.type = "number";
  page.querySelector("input")!.min = "1";
  const location = inputField("Location", "location", "Section, URL, or locator");
  return [quote, page, location];
}

function extractionInput(field: ReviewEvidenceSnapshot["protocol"]["extractionFields"][number]): HTMLLabelElement {
  if (field.type === "enum") return selectField("Value", "value", field.values);
  if (field.type === "boolean") return selectField("Value", "value", ["true", "false"]);
  const label = inputField("Value", "value", field.type === "integer" ? "Whole number" : "Extracted value");
  if (field.type === "integer") label.querySelector("input")!.type = "number";
  return label;
}

function evidenceFromForm(data: FormData) {
  const pageValue = String(data.get("page") ?? "").trim();
  return {
    quote: String(data.get("quote") ?? ""),
    page: pageValue ? Number(pageValue) : null,
    location: String(data.get("location") ?? ""),
  };
}

function extractionValueFromForm(value: FormDataEntryValue | null, fieldType: string): ExtractionValue {
  const textValue = String(value ?? "");
  if (fieldType === "integer") return Number(textValue);
  if (fieldType === "boolean") return textValue === "true";
  return textValue;
}

function syncEvidenceSteps(snapshot: ReviewScreeningSnapshot, appraiseStep: HTMLButtonElement, extractStep: HTMLButtonElement): void {
  const disabled = snapshot.counts.fullTextIncluded === 0;
  appraiseStep.disabled = disabled;
  extractStep.disabled = disabled;
}

function renderSynthesis(synthesis: ReviewSynthesis): void {
  const view = required("review-synthesis-view", HTMLElement);
  view.replaceChildren();
  const flow = document.createElement("section");
  flow.className = "review-study-card";
  const heading = document.createElement("h4");
  heading.textContent = "PRISMA flow snapshot";
  const metrics = document.createElement("div");
  metrics.className = "review-import-summary";
  metrics.append(
    metric(synthesis.flow.identified, "identified"),
    metric(synthesis.flow.duplicatesRemoved, "duplicates removed"),
    metric(synthesis.flow.titleAbstractScreened, "screened"),
    metric(synthesis.flow.fullTextAssessed, "full texts"),
    metric(synthesis.flow.included, "included"),
  );
  flow.append(heading, metrics);
  const rq = document.createElement("section");
  rq.className = "review-study-card";
  const rqHeading = document.createElement("h4");
  rqHeading.textContent = "Research-question coverage";
  rq.append(
    rqHeading,
    ...synthesis.rqCoverage.map((coverage) => synthesisStatusText(`${coverage.id} · ${coverage.studies} studies · ${coverage.question}`)),
  );
  const matrix = document.createElement("section");
  matrix.className = "review-study-card review-matrix";
  const matrixHeading = document.createElement("h4");
  matrixHeading.textContent = "Evidence matrix";
  const table = document.createElement("table");
  const columns = ["title", "year", "qualityScore", ...synthesis.extractionColumns];
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of columns) {
    const cell = document.createElement("th");
    cell.textContent = column;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  for (const row of synthesis.matrix) {
    const tableRow = document.createElement("tr");
    for (const column of columns) {
      const cell = document.createElement("td");
      cell.textContent = row[column] === null || row[column] === undefined ? "Not reported" : String(row[column]);
      tableRow.append(cell);
    }
    body.append(tableRow);
  }
  table.append(head, body);
  matrix.append(matrixHeading, table);
  view.append(flow, rq, matrix);
}

function synthesisStatusText(value: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.className = "review-screen-meta";
  paragraph.textContent = value;
  return paragraph;
}

function isRevisionRecord(value: unknown): value is { revision: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "revision" in value &&
    typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision)
  );
}

function actionButton(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "button-secondary";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function modelCandidateCard(
  candidate: ReviewModelCandidate,
  resolve: (candidate: ReviewModelCandidate, action: "accept" | "reject") => Promise<void>,
): HTMLElement {
  const card = document.createElement("aside");
  card.className = "review-model-candidate";
  const heading = document.createElement("strong");
  heading.textContent = `Local-model candidate · ${candidate.disposition}`;
  const result =
    candidate.operation === "screen-record" ? (candidate.result as ScreeningModelResult) : (candidate.result as ExtractionModelResult);
  const summary = document.createElement("p");
  summary.textContent =
    candidate.operation === "screen-record"
      ? `${(result as ScreeningModelResult).decision} · ${(result as ScreeningModelResult).rationale}`
      : `${String((result as ExtractionModelResult).value ?? (result as ExtractionModelResult).missingReason)} · ${(result as ExtractionModelResult).rationale}`;
  const provenance = document.createElement("small");
  provenance.textContent = `${candidate.provider} · ${candidate.model} · ${candidate.promptTemplateVersion} · ${candidate.sourceScope.join(", ")}`;
  card.append(heading, summary, provenance);
  if (candidate.operation === "screen-record") {
    const evidence = document.createElement("blockquote");
    evidence.textContent = (result as ScreeningModelResult).evidence;
    card.append(evidence);
  }
  if (candidate.disposition === "pending") {
    const actions = document.createElement("div");
    actions.className = "review-duplicate-actions";
    actions.append(
      actionButton("Accept candidate", () => void resolve(candidate, "accept")),
      actionButton("Reject candidate", () => void resolve(candidate, "reject")),
    );
    card.append(actions);
  }
  return card;
}

function reviewModelProvider(): OpenAICompatibleBrowserProvider {
  const stored = readReviewModelPreferences();
  if (!stored.model) throw new Error("Choose a local model in Assistant settings first.");
  return new OpenAICompatibleBrowserProvider({
    endpoint: stored.endpoint,
    providerLabel: stored.connection === "companion" ? "Local companion · OpenAI-compatible" : "Browser-local OpenAI-compatible",
    model: stored.model,
    reasoningEffort: stored.reasoningEffort,
  });
}

function readReviewModelPreferences(): {
  connection: "direct" | "companion";
  endpoint: string;
  model: string;
  reasoningEffort: ModelReasoningEffort;
} {
  let value: unknown = null;
  try {
    value = JSON.parse(localStorage.getItem("kirjolab:model-preferences") ?? "null");
  } catch {
    value = null;
  }
  const record = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const effort = record.reasoningEffort;
  return {
    connection: record.connection === "companion" ? "companion" : "direct",
    endpoint: typeof record.endpoint === "string" ? record.endpoint : "http://127.0.0.1:1234/v1/chat/completions",
    model: typeof record.model === "string" ? record.model : "",
    reasoningEffort: effort === "none" || effort === "low" || effort === "medium" || effort === "high" ? effort : "provider-default",
  };
}

function latestReviewRevision(...values: readonly (number | undefined)[]): number {
  return Math.max(...values.map((value) => value ?? 0));
}

function recordLabel(record: ReviewRecord | undefined): string {
  if (!record) return "Unavailable record";
  return `${record.metadata.title}${record.metadata.year ? ` (${record.metadata.year})` : ""}`;
}

function emptyState(message: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "empty-state";
  element.textContent = message;
  return element;
}

function localDateTime(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function currentRevision(
  protocol: ReviewStudySnapshot,
  search: ReviewSearchSnapshot | null,
  screening: ReviewScreeningSnapshot | null,
  evidence: ReviewEvidenceSnapshot | null,
  model: ReviewModelSnapshot | null,
): number {
  return Math.max(protocol.revision, search?.revision ?? 0, screening?.revision ?? 0, evidence?.revision ?? 0, model?.revision ?? 0);
}

function renderQueries(protocol: ReviewStudySnapshot["protocol"]): void {
  const list = required("review-query-list", HTMLElement);
  list.replaceChildren();
  if (!protocol.logicalQuery && protocol.sourceQueries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Add concept groups and sources to generate query variants.";
    list.append(empty);
    return;
  }
  list.append(queryItem("Portable base query", protocol.logicalQuery, []));
  for (const plan of protocol.sourceQueries) {
    const source = protocol.sources.find((candidate) => candidate.id === plan.sourceId);
    list.append(queryItem(source?.name ?? plan.sourceId, plan.query, plan.diagnostics));
  }
  if (protocol.calibration.missedStudyIds.length > 0) {
    list.append(
      queryItem("Calibration misses", protocol.calibration.missedStudyIds.join(", "), [
        "Revise concepts deliberately; do not silently optimize against seed studies.",
      ]),
    );
  }
}

function queryItem(label: string, query: string, diagnostics: readonly string[]): HTMLElement {
  const item = document.createElement("article");
  item.className = "review-query-item";
  const heading = document.createElement("strong");
  heading.textContent = label;
  const content = document.createElement("pre");
  content.textContent = query || "No query generated";
  item.append(heading, content);
  for (const diagnostic of diagnostics) {
    const warning = document.createElement("p");
    warning.className = "review-query-warning";
    warning.textContent = diagnostic;
    item.append(warning);
  }
  return item;
}

function readContent(previous: ReviewStudySnapshot["protocol"]): ReviewProtocolContent {
  const researchQuestions = nonEmptyLines(required("review-questions", HTMLTextAreaElement).value).map<ReviewResearchQuestion>(
    (text, index) => ({
      id: previous.researchQuestions[index]?.id ?? `rq_${crypto.randomUUID()}`,
      text,
    }),
  );
  const conceptGroups = nonEmptyLines(required("review-concepts", HTMLTextAreaElement).value).map<ReviewConceptGroup>((line, index) => {
    const [labelValue, termsValue = ""] = line.split("::", 2);
    const label = labelValue?.trim() ?? "";
    if (!label) throw new Error(`Concept line ${index + 1} needs a label before ::`);
    const terms = termsValue
      .split(";")
      .map((term) => term.trim())
      .filter(Boolean);
    const facet = facets.find((candidate) => candidate === label.toLocaleLowerCase()) ?? null;
    return { id: previous.conceptGroups[index]?.id ?? `concept_${crypto.randomUUID()}`, label, facet, terms };
  });
  const sources = nonEmptyLines(required("review-sources", HTMLTextAreaElement).value).map<ReviewSearchSource>((line, index) => {
    const [name = "", url = "", dialectValue = "", scopeValue = ""] = line.split("|").map((part) => part.trim());
    if (!name || !isDialect(dialectValue) || !isScope(scopeValue))
      throw new Error(`Source line ${index + 1} has an invalid name, dialect, or scope`);
    return { id: previous.sources[index]?.id ?? `source_${crypto.randomUUID()}`, name, url, dialect: dialectValue, fieldScope: scopeValue };
  });
  const knownRelevantStudies = nonEmptyLines(required("review-known-studies", HTMLTextAreaElement).value).map((line, index) => {
    const separator = line.indexOf("|");
    const title = (separator < 0 ? line : line.slice(0, separator)).trim();
    const abstract = separator < 0 ? "" : line.slice(separator + 1).trim();
    return { id: previous.knownRelevantStudies[index]?.id ?? `seed_${crypto.randomUUID()}`, title, abstract };
  });
  const qualityQuestions = nonEmptyLines(required("review-quality-questions", HTMLTextAreaElement).value).map((text, index) => ({
    id: previous.qualityAssessment.questions[index]?.id ?? `quality_${crypto.randomUUID()}`,
    text,
  }));
  const qualityAnswers = nonEmptyLines(required("review-quality-answers", HTMLTextAreaElement).value).map((line, index) => {
    const [label = "", weightValue = "", rejectValue = ""] = line.split("|").map((part) => part.trim());
    const weight = Number(weightValue);
    if (!label || !Number.isFinite(weight)) throw new Error(`Quality answer line ${index + 1} is invalid`);
    return {
      id: previous.qualityAssessment.answers[index]?.id ?? `answer_${crypto.randomUUID()}`,
      label,
      weight,
      rejects: rejectValue.toLocaleLowerCase() === "reject",
    };
  });
  const minimumValue = required("review-quality-minimum", HTMLInputElement).value.trim();
  const extractionFields = nonEmptyLines(required("review-extraction-fields", HTMLTextAreaElement).value).map((line, index) => {
    const [label = "", typeValue = "", valuesValue = "", rqValue = ""] = line.split("|").map((part) => part.trim());
    if (!label || !isExtractionType(typeValue)) throw new Error(`Extraction field line ${index + 1} is invalid`);
    return {
      id: previous.extractionFields[index]?.id ?? `field_${crypto.randomUUID()}`,
      label,
      type: typeValue,
      values: valuesValue
        .split(";")
        .map((value) => value.trim())
        .filter(Boolean),
      researchQuestionIds: rqValue
        .split(";")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  });
  return {
    profile: required("review-profile", HTMLSelectElement).value === "mlr" ? "mlr" : "slr",
    objective: required("review-objective", HTMLTextAreaElement).value,
    picoc: {
      population: required("review-picoc-population", HTMLInputElement).value,
      intervention: required("review-picoc-intervention", HTMLInputElement).value,
      comparison: required("review-picoc-comparison", HTMLInputElement).value,
      outcome: required("review-picoc-outcome", HTMLInputElement).value,
      context: required("review-picoc-context", HTMLInputElement).value,
    },
    researchQuestions,
    conceptGroups,
    sources,
    knownRelevantStudies,
    inclusionCriteria: nonEmptyLines(required("review-inclusion-criteria", HTMLTextAreaElement).value),
    exclusionCriteria: nonEmptyLines(required("review-exclusion-criteria", HTMLTextAreaElement).value),
    screening: {
      reviewersPerStage: required("review-reviewer-count", HTMLSelectElement).value === "2" ? 2 : 1,
      blinded: required("review-blinded", HTMLInputElement).checked,
    },
    modelAssistance: {
      mode:
        required("review-model-mode", HTMLSelectElement).value === "human-first"
          ? "human-first"
          : required("review-model-mode", HTMLSelectElement).value === "assisted"
            ? "assisted"
            : "off",
    },
    qualityAssessment: {
      questions: qualityQuestions,
      answers: qualityAnswers,
      minimumScore: minimumValue ? Number(minimumValue) : null,
    },
    extractionFields,
  };
}

function nonEmptyLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isDialect(value: string): value is SearchDialect {
  return value === "generic" || value === "scopus" || value === "web-of-science" || value === "ieee-xplore" || value === "acm-dl";
}

function isScope(value: string): value is SearchFieldScope {
  return value === "all-fields" || value === "title-abstract" || value === "title-abstract-keywords";
}

function isExtractionType(value: string): value is ReviewProtocolContent["extractionFields"][number]["type"] {
  return value === "string" || value === "integer" || value === "boolean" || value === "enum";
}

async function expectOk(response: Response): Promise<void> {
  if (response.ok) return;
  const value: unknown = await response.json().catch(() => null);
  throw new Error(
    typeof value === "object" && value !== null && "error" in value && typeof value.error === "string"
      ? value.error
      : `Request failed (${response.status})`,
  );
}

function setStatus(message: string): void {
  required("review-protocol-status", HTMLElement).textContent = message;
}

function setImportStatus(message: string): void {
  required("review-import-status", HTMLElement).textContent = message;
}

function setSearchStatus(message: string): void {
  required("review-search-status", HTMLElement).textContent = message;
}

function setScreenStatus(message: string): void {
  required("review-screen-status", HTMLElement).textContent = message;
}

function setEvidenceStatus(mode: "appraise" | "extract", message: string): void {
  required(`review-${mode}-status`, HTMLElement).textContent = message;
}

function setSynthesisStatus(message: string): void {
  required("review-synthesis-status", HTMLElement).textContent = message;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Review protocol operation failed";
}

function required<ElementType extends Element>(id: string, constructor: { new (): ElementType }): ElementType {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error(`Missing review-study element #${id}`);
  return element;
}

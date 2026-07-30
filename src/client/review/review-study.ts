import {
  defaultReviewMethodConfiguration,
  parseReviewReassessmentSnapshot,
  parseReviewStudySnapshot,
  type ReviewConceptGroup,
  type ReviewProtocolContent,
  type ReviewResearchQuestion,
  type ReviewReassessmentSnapshot,
  type ReviewSearchSource,
  type ReviewStudySnapshot,
  type SearchDialect,
  type SearchFieldScope,
} from "../../domain/review/review-study";
import {
  parseReviewImportPreview,
  parseReviewSearchSnapshot,
  reviewBibTeXImport,
  type ReviewDuplicateCandidate,
  type ReviewImportPreview,
  type ReviewSearchSnapshot,
} from "../../domain/review/review-search";
import {
  fullTextScreeningAllowed,
  parseReviewScreeningSnapshot,
  type ReviewScreeningSnapshot,
  type ScreeningRecordState,
  type ScreeningStage,
} from "../../domain/review/review-screening";
import { parseReviewEvidenceSnapshot, type EvidenceRecordState, type ReviewEvidenceSnapshot } from "../../domain/review/review-evidence";
import { parseReviewSynthesis, type ReviewSynthesis } from "../../domain/review/review-synthesis";
import { parseReviewModelSnapshot, type ReviewModelCandidate, type ReviewModelSnapshot } from "../../domain/review/review-model";
import { expectOk } from "../platform/http";
import {
  resolveResearchQuestionReferences,
  reviewIdentityFromApiBase,
  reviewPublicationProjectApi,
  reviewSynthesisPublicationPath,
  reviewSynthesisPublicationRequest,
} from "./review-study-contracts";
import { required } from "./review-study-elements";
import {
  appraisalCard,
  clearImportPreview,
  currentRevision,
  emptyState,
  evidenceFromForm,
  extractionCard,
  extractionValueFromForm,
  latestReviewRevision,
  isRevisionRecord,
  optionalEvidenceFromForm,
  populateSearchSources,
  render,
  renderDuplicateCandidate,
  renderImportPreview,
  renderReassessments,
  renderSearchRun,
  renderSynthesis,
  reviewModelProvider,
  screeningCard,
  screeningDecisionValue,
  screeningStateFor,
  screeningStageValue,
  selectedPublicationTarget,
  syncEvidenceSteps,
  syncSourceQuery,
} from "./review-study-ui";

const facets = ["population", "intervention", "comparison", "outcome", "context"] as const;

export function bindReviewStudyPlanning(apiBase: string): void {
  const reviewId = reviewIdentityFromApiBase(apiBase);
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
  const prismaImage = required("review-prisma-flow", HTMLImageElement);
  const publicationProject = required("review-publication-project", HTMLSelectElement);
  let snapshot: ReviewStudySnapshot | null = null;
  let reassessmentSnapshot: ReviewReassessmentSnapshot | null = null;
  let searchSnapshot: ReviewSearchSnapshot | null = null;
  let importPreview: ReviewImportPreview | null = null;
  let screeningSnapshot: ReviewScreeningSnapshot | null = null;
  let evidenceSnapshot: ReviewEvidenceSnapshot | null = null;
  let synthesis: ReviewSynthesis | null = null;
  let modelSnapshot: ReviewModelSnapshot | null = null;

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
  void load();

  async function load(): Promise<void> {
    setStatus("Loading protocol…");
    try {
      const response = await fetch(`${apiBase}/review-study`, { credentials: "same-origin" });
      await expectOk(response);
      snapshot = parseReviewStudySnapshot(await response.json());
      render(snapshot);
      await loadReassessments();
      await loadSearchSnapshot();
      setStatus(`Protocol revision ${snapshot.revision} loaded.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function save(): Promise<void> {
    if (!snapshot) return;
    try {
      let content = readContent(snapshot.protocol);
      let endpoint = "/review-study/protocol";
      let method: "PUT" | "POST" = "PUT";
      let rationale: string | undefined;
      if (snapshot.protocol.status === "frozen") {
        rationale = window.prompt("Why is the frozen protocol changing?")?.trim();
        if (!rationale) return setStatus("A frozen protocol can change only with an amendment rationale.");
        const impact = amendmentImpactFromPrompts();
        if (!impact) return setStatus("An amendment must identify the affected workflow stages.");
        content = { ...content, amendmentImpact: impact };
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
      await loadReassessments();
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
      await loadReassessments();
      setStatus("Protocol frozen. Future changes will be recorded as amendments.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function loadReassessments(): Promise<void> {
    const response = await fetch(`${apiBase}/review-study/reassessments`, { credentials: "same-origin" });
    await expectOk(response);
    reassessmentSnapshot = parseReviewReassessmentSnapshot(await response.json());
    renderReassessments(reassessmentSnapshot, completeReassessment);
  }

  async function completeReassessment(id: string): Promise<void> {
    if (!reassessmentSnapshot) return;
    const rationale = window.prompt("How was this amendment impact reassessed?")?.trim();
    if (!rationale) return;
    setStatus("Completing reassessment obligation…");
    try {
      const response = await fetch(`${apiBase}/review-study/reassessments/${id}/complete`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: reassessmentSnapshot.revision, rationale }),
      });
      await expectOk(response);
      reassessmentSnapshot = parseReviewReassessmentSnapshot(await response.json());
      renderReassessments(reassessmentSnapshot, completeReassessment);
      setStatus("Reassessment completed without rewriting the earlier judgments.");
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
      const hasIncluded = screeningSnapshot.counts.finalInclusionIncluded > 0;
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
      renderSynthesis(synthesis, recordFinding);
      reportStep.disabled = false;
      setSynthesisStatus(`Synthesis derived from review revision ${synthesis.revision}.`);
    } catch (error) {
      setSynthesisStatus(errorMessage(error));
    }
  }

  async function recordFinding(researchQuestionId: string): Promise<void> {
    if (!synthesis) return;
    if (!evidenceSnapshot) {
      const response = await fetch(`${apiBase}/review-study/evidence`, { credentials: "same-origin" });
      await expectOk(response);
      evidenceSnapshot = parseReviewEvidenceSnapshot(await response.json());
    }
    const fieldIds = new Set(
      evidenceSnapshot.protocol.extractionFields
        .filter((field) => field.researchQuestionIds.includes(researchQuestionId))
        .map((field) => field.id),
    );
    const contributors = evidenceSnapshot.records.flatMap((record) =>
      record.extractionValues.filter((value) => fieldIds.has(value.fieldId) && value.evidence !== null),
    );
    if (contributors.length === 0) {
      setSynthesisStatus("Record an evidence-linked extraction for this research question before creating a finding.");
      return;
    }
    const statement = window.prompt("State the evidence-linked finding:")?.trim();
    if (!statement) return;
    const interpretation = window.prompt("Optional interpretation:", "")?.trim() ?? "";
    const contributorId = window.prompt(
      `Contributing extraction ID (${contributors.map((value) => value.id).join(", ")}):`,
      contributors[0]!.id,
    );
    const contributor = contributors.find((value) => value.id === contributorId?.trim());
    if (!contributor?.evidence) return setSynthesisStatus("Choose one of the listed evidence-linked extraction IDs.");
    setSynthesisStatus("Recording append-only review finding…");
    try {
      const response = await fetch(`${apiBase}/review-study/findings`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: synthesis.revision,
          finding: {
            researchQuestionId,
            statement,
            interpretation,
            extractionValueIds: [contributor.id],
            appraisalValueIds: [],
            evidence: [{ contributorKind: "extraction", contributorId: contributor.id, pointer: contributor.evidence }],
            supersedesId: null,
          },
        }),
      });
      await expectOk(response);
      const synthesisResponse = await fetch(`${apiBase}/review-study/synthesis`, { credentials: "same-origin" });
      await expectOk(synthesisResponse);
      synthesis = parseReviewSynthesis(await synthesisResponse.json());
      renderSynthesis(synthesis, recordFinding);
      setSynthesisStatus(`Finding recorded at review revision ${synthesis.revision}.`);
    } catch (error) {
      setSynthesisStatus(errorMessage(error));
    }
  }

  function showReport(): void {
    if (reportStep.disabled) return;
    const source = prismaImage.dataset.src;
    if (!prismaImage.hasAttribute("src") && source) prismaImage.src = source;
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
    try {
      const target = selectedPublicationTarget(publicationProject);
      if (!target) return setSynthesisStatus("Choose an accessible linked writing project before publishing.");
      const path = reviewSynthesisPublicationPath(reviewId);
      setSynthesisStatus(`Publishing ${path}…`);
      const projectResponse = await fetch(reviewPublicationProjectApi(target), { credentials: "same-origin" });
      await expectOk(projectResponse);
      const projectValue: unknown = await projectResponse.json();
      if (!isRevisionRecord(projectValue)) throw new Error("Project revision is unavailable");
      const response = await fetch(`${apiBase}/review-study/synthesis/publish`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reviewSynthesisPublicationRequest(reviewId, target, projectValue.revision, synthesis.revision)),
      });
      await expectOk(response);
      const published: unknown = await response.json();
      const directive =
        typeof published === "object" && published !== null && "directive" in published && typeof published.directive === "string"
          ? published.directive
          : `::review-artifact[${path}]`;
      setSynthesisStatus(`Published ${path} from review revision ${synthesis.revision}. Add ${directive} in the editor.`);
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
      const reportedResults = required("review-reported-result-count", HTMLInputElement);
      if (!reportedResults.value) reportedResults.value = String(importPreview.detectedEntries);
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
    const filename = required("review-import-filename", HTMLInputElement).value.trim();
    if (!filename) return setImportStatus("Record the imported BibTeX filename.");
    const reportedResultCount = required("review-reported-result-count", HTMLInputElement).valueAsNumber;
    if (!Number.isSafeInteger(reportedResultCount) || reportedResultCount < 0) {
      return setImportStatus("Record the non-negative result count reported by the source.");
    }
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
          filename,
          mediaType: reviewBibTeXImport.mediaType,
          reportedResultCount,
        }),
      });
      await expectOk(response);
      searchSnapshot = parseReviewSearchSnapshot(await response.json());
      clearImportPreview();
      required("review-search-bibtex", HTMLTextAreaElement).value = "";
      required("review-reported-result-count", HTMLInputElement).value = "";
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
          criterionId: String(data.get("criterionId") ?? "").trim() || null,
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
        inclusionCriteria: snapshot.protocol.eligibilityCriteria
          .filter((criterion) => criterion.kind === "include" && criterion.applicableStages.includes("title-abstract"))
          .map((criterion) => criterion.text),
        exclusionCriteria: snapshot.protocol.eligibilityCriteria
          .filter((criterion) => criterion.kind === "exclude" && criterion.applicableStages.includes("title-abstract"))
          .map((criterion) => criterion.text),
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
        selectorKind: pointer.kind,
        resourceId: pointer.resourceId,
        selectorId: pointer.selectorId,
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

  async function decideFinalInclusion(recordId: string, formElement: HTMLFormElement): Promise<void> {
    if (!screeningSnapshot) return;
    const data = new FormData(formElement);
    const outcome = data.get("outcome") === "exclude" ? "exclude" : "include";
    setScreenStatus("Recording final inclusion decision…");
    try {
      const response = await fetch(`${apiBase}/review-study/records/${recordId}/final-inclusion-decisions`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: screeningSnapshot.revision,
          outcome,
          criterionId: String(data.get("criterionId") ?? "").trim() || null,
          reason: String(data.get("reason") ?? ""),
        }),
      });
      await expectOk(response);
      screeningSnapshot = parseReviewScreeningSnapshot(await response.json());
      renderScreening();
      setScreenStatus("Final inclusion recorded separately from full-text eligibility.");
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
      `${stage === "title-abstract" ? screeningSnapshot.counts.titleAbstractPending : screeningSnapshot.counts.fullTextPending} pending · ${screeningSnapshot.counts.conflicts} conflicts · ${screeningSnapshot.counts.finalInclusionIncluded} finally included`;
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
              decideFinalInclusion,
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
          evidence: optionalEvidenceFromForm(data),
          rationale: String(data.get("rationale") ?? ""),
        }),
      });
      await expectOk(response);
      evidenceSnapshot = parseReviewEvidenceSnapshot(await response.json());
      await loadModelSnapshot();
      renderEvidence();
      setEvidenceStatus("appraise", "Quality answer recorded with its evidence or absence rationale.");
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
          value: missingReason ? null : extractionValueFromForm(data, fieldType),
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
    runs.replaceChildren(
      ...(value.runs.length ? value.runs.map((run) => renderSearchRun(run, value.batches)) : [emptyState("No source searches imported.")]),
    );
    const candidates = required("review-duplicate-list", HTMLElement);
    const pending = value.duplicateCandidates.filter((candidate) => candidate.status === "pending");
    candidates.replaceChildren(
      ...(pending.length
        ? pending.map((candidate) => renderDuplicateCandidate(candidate, value.records, resolveDuplicate))
        : [emptyState("No unresolved duplicate candidates.")]),
    );
  }
}

function readContent(previous: ReviewStudySnapshot["protocol"]): ReviewProtocolContent {
  const profile = previous.profile;
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
    const [name = "", url = "", dialectValue = "", scopeValue = "", sourceClassValue = "", evidenceClassValue = "", greyClassValue = ""] =
      line.split("|").map((part) => part.trim());
    if (!name || !isDialect(dialectValue) || !isScope(scopeValue))
      throw new Error(`Source line ${index + 1} has an invalid name, dialect, or scope`);
    const prior = previous.sources[index];
    const sourceClass = sourceClassValue || prior?.sourceClass || defaultSourceClass(dialectValue);
    const evidenceClass = evidenceClassValue || prior?.evidenceClass || "formal";
    const greySourceClass = greyClassValue || prior?.greySourceClass || null;
    if (!isSourceClass(sourceClass) || !isEvidenceClass(evidenceClass) || !isGreySourceClass(greySourceClass)) {
      throw new Error(`Source line ${index + 1} has an invalid source classification`);
    }
    return {
      id: prior?.id ?? `source_${crypto.randomUUID()}`,
      name,
      url,
      dialect: dialectValue,
      fieldScope: scopeValue,
      sourceClass,
      evidenceClass,
      greySourceClass,
    };
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
  const eligibilityCriteria = [
    ...readEligibilityCriteria("include", required("review-inclusion-criteria", HTMLTextAreaElement).value, previous),
    ...readEligibilityCriteria("exclude", required("review-exclusion-criteria", HTMLTextAreaElement).value, previous),
  ];
  const extractionFields = nonEmptyLines(required("review-extraction-fields", HTMLTextAreaElement).value).map((line, index) => {
    const [label = "", typeValue = "", valuesValue = "", rqValue = "", requirednessValue = "", cardinalityValue = "", conditionValue = ""] =
      line.split("|").map((part) => part.trim());
    if (!label || !isExtractionType(typeValue)) throw new Error(`Extraction field line ${index + 1} is invalid`);
    const prior = previous.extractionFields[index];
    const requiredness = requirednessValue || prior?.requiredness || "required";
    const cardinality = cardinalityValue || prior?.cardinality || "single";
    if (!isExtractionRequiredness(requiredness) || !isExtractionCardinality(cardinality)) {
      throw new Error(`Extraction field line ${index + 1} has an invalid occurrence policy`);
    }
    return {
      id: prior?.id ?? `field_${crypto.randomUUID()}`,
      label,
      type: typeValue,
      values: valuesValue
        .split(";")
        .map((value) => value.trim())
        .filter(Boolean),
      researchQuestionIds: resolveResearchQuestionReferences(rqValue, researchQuestions),
      requiredness,
      cardinality,
      condition: conditionValue || null,
    };
  });
  return {
    profile,
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
    eligibilityCriteria,
    methodConfiguration: profile === previous.profile ? previous.methodConfiguration : defaultReviewMethodConfiguration(profile),
    amendmentImpact: previous.amendmentImpact,
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

function readEligibilityCriteria(
  kind: "include" | "exclude",
  value: string,
  previous: ReviewStudySnapshot["protocol"],
): ReviewProtocolContent["eligibilityCriteria"] {
  const prior = previous.eligibilityCriteria.filter((criterion) => criterion.kind === kind);
  return nonEmptyLines(value).map((line, index) => {
    const [text = "", stagesValue = ""] = line.split("|").map((part) => part.trim());
    const applicableStages = (
      stagesValue
        ? stagesValue
            .split(";")
            .map((stage) => stage.trim())
            .filter(Boolean)
        : (prior[index]?.applicableStages ?? ["title-abstract", "full-text"])
    ) as string[];
    if (!text || applicableStages.length === 0 || applicableStages.some((stage) => stage !== "title-abstract" && stage !== "full-text")) {
      throw new Error(`${kind === "include" ? "Inclusion" : "Exclusion"} criterion line ${index + 1} is invalid`);
    }
    return {
      id: prior[index]?.id ?? `${kind}_${crypto.randomUUID()}`,
      kind,
      text,
      applicableStages: applicableStages as ("title-abstract" | "full-text")[],
    };
  });
}

function amendmentImpactFromPrompts(): NonNullable<ReviewProtocolContent["amendmentImpact"]> | null {
  const stageInput = window.prompt(
    "Which stages must be reassessed? Separate stages with semicolons.",
    "title-abstract; full-text; appraisal; extraction; synthesis; reporting",
  );
  if (stageInput === null) return null;
  const stageTokens = stageInput
    .split(";")
    .map((stage) => stage.trim())
    .filter(Boolean);
  if (stageTokens.length === 0 || stageTokens.some((stage) => !isProtocolImpactStage(stage))) return null;
  const stages = stageTokens.filter(isProtocolImpactStage);
  const recordInput = window.prompt("Optional affected review record IDs, separated with semicolons.", "");
  if (recordInput === null) return null;
  return {
    stages,
    recordIds: recordInput
      .split(";")
      .map((id) => id.trim())
      .filter(Boolean),
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

function defaultSourceClass(dialect: SearchDialect): ReviewSearchSource["sourceClass"] {
  if (dialect === "scopus" || dialect === "web-of-science") return "bibliographic-database";
  if (dialect === "ieee-xplore" || dialect === "acm-dl") return "publisher-library";
  return "manual-search";
}

function isSourceClass(value: string): value is ReviewSearchSource["sourceClass"] {
  return (
    value === "bibliographic-database" ||
    value === "publisher-library" ||
    value === "citation-search" ||
    value === "manual-search" ||
    value === "web-search" ||
    value === "organization-site" ||
    value === "grey-repository"
  );
}

function isEvidenceClass(value: string): value is ReviewSearchSource["evidenceClass"] {
  return value === "formal" || value === "grey";
}

function isGreySourceClass(value: string | null): value is ReviewSearchSource["greySourceClass"] {
  return (
    value === null ||
    value === "government" ||
    value === "industry" ||
    value === "professional-association" ||
    value === "research-institute" ||
    value === "community" ||
    value === "news-media" ||
    value === "other"
  );
}

function isExtractionType(value: string): value is ReviewProtocolContent["extractionFields"][number]["type"] {
  return (
    value === "text" ||
    value === "integer" ||
    value === "decimal" ||
    value === "boolean" ||
    value === "date" ||
    value === "single-choice" ||
    value === "multiple-choice" ||
    value === "source-selector"
  );
}

function isExtractionRequiredness(value: string): value is ReviewProtocolContent["extractionFields"][number]["requiredness"] {
  return value === "required" || value === "optional" || value === "conditional";
}

function isExtractionCardinality(value: string): value is ReviewProtocolContent["extractionFields"][number]["cardinality"] {
  return value === "single" || value === "repeatable";
}

function isProtocolImpactStage(value: string): value is NonNullable<ReviewProtocolContent["amendmentImpact"]>["stages"][number] {
  return (
    value === "search" ||
    value === "deduplication" ||
    value === "title-abstract" ||
    value === "full-text" ||
    value === "appraisal" ||
    value === "extraction" ||
    value === "synthesis" ||
    value === "reporting"
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

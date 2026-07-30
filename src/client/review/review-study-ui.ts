import { type ReviewReassessmentSnapshot, type ReviewStudySnapshot } from "../../domain/review/review-study";
import {
  type ReviewDuplicateCandidate,
  type ReviewImportPreview,
  type ReviewRecord,
  type ReviewSearchSnapshot,
} from "../../domain/review/review-search";
import {
  type ReviewScreeningSnapshot,
  type ScreeningDecisionValue,
  type ScreeningRecordState,
  type ScreeningStage,
} from "../../domain/review/review-screening";
import {
  type EvidenceRecordState,
  type ExtractedDataValue,
  type ExtractionValue,
  type ReviewEvidenceSnapshot,
} from "../../domain/review/review-evidence";
import type { ReviewSynthesis } from "../../domain/review/review-synthesis";
import {
  type ExtractionModelResult,
  type ReviewModelCandidate,
  type ReviewModelSnapshot,
  type ScreeningModelResult,
} from "../../domain/review/review-model";
import { OpenAICompatibleBrowserProvider, type ModelReasoningEffort } from "../assistant/model-provider";
import {
  assertPublicationTarget,
  latestExtractionValue,
  researchQuestionReference,
  type ReviewPublicationTarget,
} from "./review-study-contracts";
import { required } from "./review-study-elements";

const facets = ["population", "intervention", "comparison", "outcome", "context"] as const;

export function render(snapshot: ReviewStudySnapshot): void {
  const protocol = snapshot.protocol;
  required("review-profile", HTMLSelectElement).value = protocol.profile;
  required("review-objective", HTMLTextAreaElement).value = protocol.objective;
  for (const facet of facets) required(`review-picoc-${facet}`, HTMLInputElement).value = protocol.picoc[facet];
  required("review-questions", HTMLTextAreaElement).value = protocol.researchQuestions.map((question) => question.text).join("\n");
  required("review-concepts", HTMLTextAreaElement).value = protocol.conceptGroups
    .map((group) => `${group.label} :: ${group.terms.join("; ")}`)
    .join("\n");
  required("review-sources", HTMLTextAreaElement).value = protocol.sources
    .map(
      (source) =>
        `${source.name} | ${source.url} | ${source.dialect} | ${source.fieldScope} | ${source.sourceClass} | ${source.evidenceClass} | ${source.greySourceClass ?? ""}`,
    )
    .join("\n");
  required("review-known-studies", HTMLTextAreaElement).value = protocol.knownRelevantStudies
    .map((study) => `${study.title} | ${study.abstract.replaceAll(/\s+/gu, " ")}`)
    .join("\n");
  required("review-inclusion-criteria", HTMLTextAreaElement).value = protocol.eligibilityCriteria
    .filter((criterion) => criterion.kind === "include")
    .map((criterion) => `${criterion.text} | ${criterion.applicableStages.join("; ")}`)
    .join("\n");
  required("review-exclusion-criteria", HTMLTextAreaElement).value = protocol.eligibilityCriteria
    .filter((criterion) => criterion.kind === "exclude")
    .map((criterion) => `${criterion.text} | ${criterion.applicableStages.join("; ")}`)
    .join("\n");
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
    .map(
      (field) =>
        `${field.label} | ${field.type} | ${field.values.join("; ")} | ${field.researchQuestionIds
          .map((id) => researchQuestionReference(id, protocol.researchQuestions))
          .join("; ")} | ${field.requiredness} | ${field.cardinality} | ${field.condition ?? ""}`,
    )
    .join("\n");
  required("review-protocol-state", HTMLElement).textContent =
    `${protocol.status === "frozen" ? "Frozen" : "Draft"} · r${snapshot.revision}`;
  required("freeze-review-protocol", HTMLButtonElement).disabled = protocol.status === "frozen";
  required("review-step-search", HTMLButtonElement).disabled = protocol.status !== "frozen";
  required("review-calibration", HTMLElement).textContent = `${protocol.calibration.matched} / ${protocol.calibration.total} seeds`;
  renderQueries(protocol);
}

export function renderReassessments(snapshot: ReviewReassessmentSnapshot, complete: (id: string) => Promise<void>): void {
  const list = required("review-reassessment-list", HTMLElement);
  const open = snapshot.obligations.filter((obligation) => obligation.status === "open");
  list.replaceChildren(
    ...(open.length
      ? open.map((obligation) => {
          const item = document.createElement("article");
          item.className = "review-query-item";
          const description = document.createElement("p");
          description.textContent = `Protocol r${obligation.amendmentProtocolRevision} · ${obligation.stage}${obligation.recordId ? ` · record ${obligation.recordId}` : " · whole review"}`;
          item.append(
            description,
            actionButton("Mark reassessed", () => void complete(obligation.id)),
          );
          return item;
        })
      : [emptyState("No amendment reassessment is outstanding.")]),
  );
}

export function populateSearchSources(snapshot: ReviewStudySnapshot): void {
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

export function syncSourceQuery(snapshot: ReviewStudySnapshot): void {
  const sourceId = required("review-search-source", HTMLSelectElement).value;
  const plan = snapshot.protocol.sourceQueries.find((candidate) => candidate.sourceId === sourceId);
  required("review-search-query", HTMLTextAreaElement).value = plan?.query ?? snapshot.protocol.logicalQuery;
}

export function renderImportPreview(preview: ReviewImportPreview): void {
  const container = required("review-import-preview", HTMLElement);
  container.replaceChildren();
  const summary = document.createElement("div");
  summary.className = "review-import-summary";
  summary.append(
    metric(preview.records.length, "valid records"),
    metric(preview.skippedEntries, "skipped entries"),
    metric(preview.records.filter((record) => record.warnings.length > 0).length, "with warnings"),
    metric(preview.byteCount, "UTF-8 bytes"),
  );
  container.append(summary);
}

export function clearImportPreview(): void {
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

export function renderSearchRun(run: ReviewSearchSnapshot["runs"][number], batches: ReviewSearchSnapshot["batches"]): HTMLElement {
  const item = document.createElement("article");
  item.className = "review-query-item";
  const title = document.createElement("strong");
  title.textContent = `${run.sourceName} · ${run.occurrenceCount} records`;
  const meta = document.createElement("p");
  meta.className = "review-field-help";
  meta.textContent = `Searched ${formatDate(run.searchedAt)} · ${run.reportedResultCount} reported · imported by ${run.importedBy} · protocol r${run.protocolRevision}`;
  const query = document.createElement("pre");
  query.textContent = run.query;
  const provenance = document.createElement("p");
  provenance.className = "review-field-help";
  const imported = batches.filter((batch) => run.importBatchIds.includes(batch.id));
  provenance.textContent = imported.length
    ? imported
        .map(
          (batch) =>
            `${batch.filename} · ${batch.format} · ${batch.mediaType} · ${batch.byteCount.toLocaleString()} bytes · ${batch.parserVersion} · SHA-256 ${batch.digest.slice(0, 16)}…`,
        )
        .join("\n")
    : `SHA-256 ${run.digest.slice(0, 16)}…`;
  item.append(title, meta, query, provenance);
  return item;
}

export function renderDuplicateCandidate(
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

export function screeningCard(
  state: ScreeningRecordState,
  stage: ScreeningStage,
  protocolSnapshot: ReviewStudySnapshot,
  submit: (recordId: string, form: HTMLFormElement) => Promise<void>,
  adjudicate: (recordId: string, outcome: "include" | "exclude") => Promise<void>,
  decideFinalInclusion: (recordId: string, form: HTMLFormElement) => Promise<void>,
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
  card.append(header, abstract, screeningControls(state, stage, protocolSnapshot, submit, adjudicate));
  if (generateCandidate) card.append(actionButton("Ask local model", () => void generateCandidate(state)));
  for (const candidate of candidates) card.append(modelCandidateCard(candidate, resolveCandidate));
  const history = screeningHistory(stageState.decisions);
  if (history) card.append(history);
  const final = finalInclusionForm(state, stage, stageState.outcome, protocolSnapshot, decideFinalInclusion);
  if (final) card.append(final);
  return card;
}

function screeningControls(
  state: ScreeningRecordState,
  stage: ScreeningStage,
  protocolSnapshot: ReviewStudySnapshot,
  submit: (recordId: string, form: HTMLFormElement) => Promise<void>,
  adjudicate: (recordId: string, outcome: "include" | "exclude") => Promise<void>,
): HTMLElement {
  const stageState = screeningStateFor(state, stage);
  if (stageState.outcome === "conflict") {
    const actions = document.createElement("div");
    actions.className = "review-duplicate-actions";
    actions.append(
      actionButton("Adjudicate include", () => void adjudicate(state.record.id, "include")),
      actionButton("Adjudicate exclude", () => void adjudicate(state.record.id, "exclude")),
    );
    return actions;
  }
  const form = document.createElement("form");
  form.className = "review-screen-form";
  form.append(
    selectField("Decision", "decision", ["include", "exclude", "uncertain"]),
    criterionSelectField(protocolSnapshot.protocol.eligibilityCriteria.filter((criterion) => criterion.applicableStages.includes(stage))),
    inputField("Reason", "reason", "Required when excluding"),
  );
  appendSubmit(form, stageState.decisions.length > 0 ? "Revise decision" : "Record decision", () => submit(state.record.id, form));
  return form;
}

function screeningHistory(decisions: ReturnType<typeof screeningStateFor>["decisions"]): HTMLElement | null {
  if (decisions.length === 0) return null;
  const history = document.createElement("p");
  history.className = "review-decision-history";
  history.textContent = decisions
    .map((decision) => `${decision.reviewer}: ${decision.decision}${decision.reason ? ` — ${decision.reason}` : ""}`)
    .join(" · ");
  return history;
}

function finalInclusionForm(
  state: ScreeningRecordState,
  stage: ScreeningStage,
  outcome: ReturnType<typeof screeningStateFor>["outcome"],
  protocolSnapshot: ReviewStudySnapshot,
  decide: (recordId: string, form: HTMLFormElement) => Promise<void>,
): HTMLFormElement | null {
  if (stage !== "full-text" || outcome !== "include") return null;
  const form = document.createElement("form");
  form.className = "review-screen-form";
  const heading = document.createElement("strong");
  heading.textContent = state.finalInclusion.outcome === "pending" ? "Final inclusion" : `Final inclusion: ${state.finalInclusion.outcome}`;
  form.append(
    heading,
    selectField("Outcome", "outcome", ["include", "exclude"]),
    criterionSelectField(
      protocolSnapshot.protocol.eligibilityCriteria.filter(
        (criterion) => criterion.kind === "exclude" && criterion.applicableStages.includes("full-text"),
      ),
    ),
    inputField("Rationale", "reason", "Why this record enters or leaves the synthesis corpus"),
  );
  appendSubmit(form, state.finalInclusion.decision ? "Supersede final decision" : "Record final inclusion", () =>
    decide(state.record.id, form),
  );
  return form;
}

function criterionSelectField(criteria: ReviewStudySnapshot["protocol"]["eligibilityCriteria"]): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = "Criterion";
  const select = document.createElement("select");
  select.className = "field";
  select.name = "criterionId";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "No criterion";
  select.append(empty);
  for (const criterion of criteria) {
    const option = document.createElement("option");
    option.value = criterion.id;
    option.textContent = `${criterion.kind === "include" ? "Include" : "Exclude"}: ${criterion.text}`;
    select.append(option);
  }
  label.append(select);
  return label;
}

export function screeningStateFor(state: ScreeningRecordState, stage: ScreeningStage) {
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

export function screeningStageValue(value: string): ScreeningStage {
  return value === "full-text" ? "full-text" : "title-abstract";
}

export function screeningDecisionValue(value: FormDataEntryValue | null): ScreeningDecisionValue {
  return value === "exclude" || value === "uncertain" ? value : "include";
}

export function appraisalCard(
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
    form.append(...evidenceFields(), inputField("Absence rationale", "rationale", "Use instead of a quotation for a negative answer"));
    appendSubmit(form, "Save answer", () => submit(record.record.id, question.id, form));
    card.append(form);
  }
  return card;
}

export function extractionCard(
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
    const recorded = latestExtractionValue(record.extractionValues, field.id);
    const form = extractionForm(record, field, recorded, submit, generateCandidate);
    card.append(form);
    card.append(
      ...candidates
        .filter((candidate) => candidate.operation === "extract-field" && (candidate.result as ExtractionModelResult).fieldId === field.id)
        .map((candidate) => modelCandidateCard(candidate, resolveCandidate)),
    );
  }
  return card;
}

function extractionForm(
  record: EvidenceRecordState,
  field: ReviewEvidenceSnapshot["protocol"]["extractionFields"][number],
  recorded: ExtractedDataValue | null,
  submit: (recordId: string, fieldId: string, fieldType: string, form: HTMLFormElement) => Promise<void>,
  generateCandidate:
    | ((
        record: EvidenceRecordState,
        field: ReviewEvidenceSnapshot["protocol"]["extractionFields"][number],
        form: HTMLFormElement,
      ) => Promise<void>)
    | null,
): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "review-evidence-form";
  const heading = document.createElement("strong");
  heading.textContent = field.label;
  form.append(
    heading,
    extractionInput(field),
    inputField("Missing reason", "missingReason", "Use only when the value is absent"),
    ...evidenceFields(),
  );
  if (recorded) populateRecordedExtraction(form, recorded);
  appendSubmit(form, recorded ? "Supersede value" : "Save value", () => submit(record.record.id, field.id, field.type, form));
  if (generateCandidate) form.append(actionButton("Ask local model", () => void generateCandidate(record, field, form)));
  if (recorded) form.append(recordedExtractionStatus(recorded));
  return form;
}

function appendSubmit(form: HTMLFormElement, label: string, submit: () => Promise<void>): void {
  const button = actionButton(label, () => undefined);
  button.className = "button-primary";
  button.type = "submit";
  form.append(button);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit();
  });
}

function recordedExtractionStatus(recorded: ExtractedDataValue): HTMLElement {
  const status = document.createElement("p");
  status.className = "review-field-help";
  status.textContent = `Recorded by ${recorded.reviewer} · ${recorded.createdAt}`;
  return status;
}

function populateRecordedExtraction(form: HTMLFormElement, recorded: ExtractedDataValue): void {
  populateExtractedValue(form, recorded.value);
  setFormControlValue(form, "missingReason", recorded.missingReason ?? "");
  populateRecordedEvidence(form, recorded.evidence);
}

function populateExtractedValue(form: HTMLFormElement, value: ExtractedDataValue["value"]): void {
  if (Array.isArray(value)) {
    const select = form.elements.namedItem("value");
    if (select instanceof HTMLSelectElement) {
      for (const option of select.options) option.selected = value.includes(option.value);
    }
  } else if (isSourceSelector(value)) {
    setFormControlValue(form, "valueKind", value.kind);
    setFormControlValue(form, "valueResourceId", value.resourceId);
    setFormControlValue(form, "valueSelectorId", value.selectorId);
  } else {
    setFormControlValue(form, "value", value === null ? "" : String(value));
  }
}

function populateRecordedEvidence(form: HTMLFormElement, evidence: ExtractedDataValue["evidence"]): void {
  for (const [name, value] of Object.entries(recordedEvidenceValues(evidence))) setFormControlValue(form, name, value);
}

function recordedEvidenceValues(evidence: ExtractedDataValue["evidence"]): Record<string, string> {
  if (!evidence) {
    return { evidenceKind: "", evidenceResourceId: "", evidenceSelectorId: "", quote: "", page: "", location: "" };
  }
  const unresolved = evidence.kind === "legacy-unresolved";
  return {
    evidenceKind: unresolved ? "" : evidence.kind,
    evidenceResourceId: unresolved || evidence.resourceId === "legacy-unresolved" ? "" : evidence.resourceId,
    evidenceSelectorId: unresolved || evidence.selectorId === "legacy-unresolved" ? "" : evidence.selectorId,
    quote: evidence.quote,
    page: evidence.page === null ? "" : String(evidence.page),
    location: evidence.location,
  };
}

function setFormControlValue(form: HTMLFormElement, name: string, value: string): void {
  const control = form.elements.namedItem(name);
  if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) control.value = value;
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

function evidenceFields(): [HTMLLabelElement, HTMLLabelElement, HTMLLabelElement, HTMLLabelElement, HTMLLabelElement, HTMLLabelElement] {
  const kind = selectField("Shared source kind", "evidenceKind", ["pdf-annotation", "web-passage"]);
  const resourceId = inputField("Shared resource ID", "evidenceResourceId", "Project PDF or research-share ID");
  const selectorId = inputField("Selector ID", "evidenceSelectorId", "Annotation, fragment, highlight, or snapshot ID");
  const quote = inputField("Exact quotation", "quote", "Required evidence passage");
  const page = inputField("Page", "page", "Optional page");
  page.querySelector("input")!.type = "number";
  page.querySelector("input")!.min = "1";
  const location = inputField("Location", "location", "Section, URL, or locator");
  return [kind, resourceId, selectorId, quote, page, location];
}

function extractionInput(field: ReviewEvidenceSnapshot["protocol"]["extractionFields"][number]): HTMLLabelElement {
  if (field.type === "single-choice") return selectField("Value", "value", field.values);
  if (field.type === "multiple-choice") {
    const label = selectField("Value", "value", field.values);
    label.querySelector("select")!.multiple = true;
    return label;
  }
  if (field.type === "source-selector") {
    const group = document.createElement("label");
    group.className = "field-label";
    group.textContent = "Value source selector";
    group.append(
      selectField("Kind", "valueKind", ["pdf-annotation", "web-passage"]),
      inputField("Resource ID", "valueResourceId", "Shared resource ID"),
      inputField("Selector ID", "valueSelectorId", "Authorized selector ID"),
    );
    return group;
  }
  if (field.type === "boolean") return selectField("Value", "value", ["true", "false"]);
  const label = inputField("Value", "value", field.type === "integer" ? "Whole number" : "Extracted value");
  if (field.type === "integer" || field.type === "decimal") {
    label.querySelector("input")!.type = "number";
    label.querySelector("input")!.step = field.type === "integer" ? "1" : "any";
  }
  if (field.type === "date") label.querySelector("input")!.type = "date";
  return label;
}

export function evidenceFromForm(data: FormData) {
  const pageValue = String(data.get("page") ?? "").trim();
  return {
    kind: data.get("evidenceKind") === "web-passage" ? ("web-passage" as const) : ("pdf-annotation" as const),
    resourceId: String(data.get("evidenceResourceId") ?? ""),
    selectorId: String(data.get("evidenceSelectorId") ?? ""),
    quote: String(data.get("quote") ?? ""),
    page: pageValue ? Number(pageValue) : null,
    location: String(data.get("location") ?? ""),
  };
}

export function optionalEvidenceFromForm(data: FormData) {
  return String(data.get("quote") ?? "").trim() ? evidenceFromForm(data) : null;
}

export function extractionValueFromForm(data: FormData, fieldType: string): ExtractionValue {
  const textValue = String(data.get("value") ?? "");
  if (fieldType === "integer" || fieldType === "decimal") return Number(textValue);
  if (fieldType === "boolean") return textValue === "true";
  if (fieldType === "multiple-choice") return data.getAll("value").map(String);
  if (fieldType === "source-selector") {
    return {
      kind: data.get("valueKind") === "web-passage" ? "web-passage" : "pdf-annotation",
      resourceId: String(data.get("valueResourceId") ?? ""),
      selectorId: String(data.get("valueSelectorId") ?? ""),
    };
  }
  return textValue;
}

function isSourceSelector(value: ExtractionValue): value is Exclude<ExtractionValue, string | number | boolean | readonly string[] | null> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function syncEvidenceSteps(
  snapshot: ReviewScreeningSnapshot,
  appraiseStep: HTMLButtonElement,
  extractStep: HTMLButtonElement,
): void {
  const disabled = snapshot.counts.finalInclusionIncluded === 0;
  appraiseStep.disabled = disabled;
  extractStep.disabled = disabled;
}

export function renderSynthesis(synthesis: ReviewSynthesis, recordFinding: (researchQuestionId: string) => Promise<void>): void {
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
    ...synthesis.rqCoverage.map((coverage, index) => {
      const row = document.createElement("div");
      row.className = "review-duplicate-actions";
      row.append(
        synthesisStatusText(`RQ${index + 1} · ${coverage.studies} studies · ${coverage.question}`),
        actionButton("Record finding", () => void recordFinding(coverage.id)),
      );
      return row;
    }),
  );
  const findings = document.createElement("section");
  findings.className = "review-study-card";
  const findingsHeading = document.createElement("h4");
  findingsHeading.textContent = "Evidence-linked findings";
  findings.append(
    findingsHeading,
    ...(synthesis.findings.length
      ? synthesis.findings.map((finding) => synthesisStatusText(`${finding.researchQuestionId} · ${finding.statement}`))
      : [synthesisStatusText("No reviewed findings have been recorded yet.")]),
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
  view.append(flow, rq, findings, matrix);
}

function synthesisStatusText(value: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.className = "review-screen-meta";
  paragraph.textContent = value;
  return paragraph;
}

export function selectedPublicationTarget(select: HTMLSelectElement): ReviewPublicationTarget | null {
  const option = select.selectedOptions.item(0);
  if (!option?.value) return null;
  const target = { projectLinkId: option.value, workspaceId: option.dataset.workspaceId ?? "" };
  assertPublicationTarget(target);
  return target;
}

export function isRevisionRecord(value: unknown): value is { revision: number } {
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

export function reviewModelProvider(): OpenAICompatibleBrowserProvider {
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

export function latestReviewRevision(...values: readonly (number | undefined)[]): number {
  return Math.max(...values.map((value) => value ?? 0));
}

function recordLabel(record: ReviewRecord | undefined): string {
  if (!record) return "Unavailable record";
  return `${record.metadata.title}${record.metadata.year ? ` (${record.metadata.year})` : ""}`;
}

export function emptyState(message: string): HTMLElement {
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

export function currentRevision(
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

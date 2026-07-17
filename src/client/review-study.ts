import {
  parseReviewStudySnapshot,
  type PicocFacet,
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

const facets = ["population", "intervention", "comparison", "outcome", "context"] as const;
const dialects = new Set<SearchDialect>(["generic", "scopus", "web-of-science", "ieee-xplore", "acm-dl"]);
const scopes = new Set<SearchFieldScope>(["all-fields", "title-abstract", "title-abstract-keywords"]);

export function bindReviewStudyPlanning(apiBase: string): void {
  const open = required("open-review-study", HTMLButtonElement);
  const close = required("close-review-study", HTMLButtonElement);
  const dialog = required("review-study-dialog", HTMLDialogElement);
  const form = required("review-protocol-form", HTMLFormElement);
  const freeze = required("freeze-review-protocol", HTMLButtonElement);
  const planStep = required("review-step-plan", HTMLButtonElement);
  const searchStep = required("review-step-search", HTMLButtonElement);
  const screenStep = required("review-step-screen", HTMLButtonElement);
  const searchContent = required("review-search-content", HTMLElement);
  const screenContent = required("review-screen-content", HTMLElement);
  let snapshot: ReviewStudySnapshot | null = null;
  let searchSnapshot: ReviewSearchSnapshot | null = null;
  let importPreview: ReviewImportPreview | null = null;
  let screeningSnapshot: ReviewScreeningSnapshot | null = null;

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
  required("back-to-review-search", HTMLButtonElement).addEventListener("click", () => void showSearch());
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
          expectedRevision: currentRevision(snapshot, searchSnapshot, screeningSnapshot),
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
        body: JSON.stringify({ expectedRevision: currentRevision(snapshot, searchSnapshot, screeningSnapshot) }),
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
    planStep.setAttribute("aria-current", "step");
    searchStep.removeAttribute("aria-current");
    screenStep.removeAttribute("aria-current");
  }

  async function showSearch(): Promise<void> {
    if (!snapshot || snapshot.protocol.status !== "frozen") return;
    form.hidden = true;
    searchContent.hidden = false;
    screenContent.hidden = true;
    planStep.removeAttribute("aria-current");
    searchStep.setAttribute("aria-current", "step");
    screenStep.removeAttribute("aria-current");
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
    planStep.removeAttribute("aria-current");
    searchStep.removeAttribute("aria-current");
    screenStep.setAttribute("aria-current", "step");
    await loadScreening();
  }

  async function loadScreening(): Promise<void> {
    setScreenStatus("Loading screening decisions…");
    try {
      const response = await fetch(`${apiBase}/review-study/screening`, { credentials: "same-origin" });
      await expectOk(response);
      screeningSnapshot = parseReviewScreeningSnapshot(await response.json());
      renderScreening();
      setScreenStatus("Decisions are append-only and attributed to the signed-in reviewer.");
    } catch (error) {
      setScreenStatus(errorMessage(error));
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
          expectedRevision: screeningSnapshot.revision,
          stage,
          decision: screeningDecisionValue(data.get("decision")),
          criterion: String(data.get("criterion") ?? ""),
          reason: String(data.get("reason") ?? ""),
        }),
      });
      await expectOk(response);
      screeningSnapshot = parseReviewScreeningSnapshot(await response.json());
      renderScreening();
      setScreenStatus("Screening decision recorded.");
    } catch (error) {
      setScreenStatus(errorMessage(error));
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
            ),
          )
        : [emptyState("No records match this screening view.")]),
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
  required("review-blinded", HTMLInputElement).checked = protocol.screening.blinded;
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

function actionButton(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "button-secondary";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
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
): number {
  return Math.max(protocol.revision, search?.revision ?? 0, screening?.revision ?? 0);
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
  return {
    profile: required("review-profile", HTMLSelectElement).value === "mlr" ? "mlr" : "slr",
    objective: required("review-objective", HTMLTextAreaElement).value,
    picoc: Object.fromEntries(facets.map((facet) => [facet, required(`review-picoc-${facet}`, HTMLInputElement).value])) as Record<
      PicocFacet,
      string
    >,
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
  };
}

function nonEmptyLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isDialect(value: string): value is SearchDialect {
  return dialects.has(value as SearchDialect);
}

function isScope(value: string): value is SearchFieldScope {
  return scopes.has(value as SearchFieldScope);
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Review protocol operation failed";
}

function required<ElementType extends Element>(id: string, constructor: { new (): ElementType }): ElementType {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error(`Missing review-study element #${id}`);
  return element;
}

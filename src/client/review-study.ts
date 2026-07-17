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

const facets = ["population", "intervention", "comparison", "outcome", "context"] as const;
const dialects = new Set<SearchDialect>(["generic", "scopus", "web-of-science", "ieee-xplore", "acm-dl"]);
const scopes = new Set<SearchFieldScope>(["all-fields", "title-abstract", "title-abstract-keywords"]);

export function bindReviewStudyPlanning(apiBase: string): void {
  const open = required("open-review-study", HTMLButtonElement);
  const close = required("close-review-study", HTMLButtonElement);
  const dialog = required("review-study-dialog", HTMLDialogElement);
  const form = required("review-protocol-form", HTMLFormElement);
  const freeze = required("freeze-review-protocol", HTMLButtonElement);
  let snapshot: ReviewStudySnapshot | null = null;

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

  async function load(): Promise<void> {
    setStatus("Loading protocol…");
    try {
      const response = await fetch(`${apiBase}/review-study`, { credentials: "same-origin" });
      await expectOk(response);
      snapshot = parseReviewStudySnapshot(await response.json());
      render(snapshot);
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
        body: JSON.stringify({ expectedRevision: snapshot.revision, content, ...(rationale ? { rationale } : {}) }),
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
        body: JSON.stringify({ expectedRevision: snapshot.revision }),
      });
      await expectOk(response);
      snapshot = parseReviewStudySnapshot(await response.json());
      render(snapshot);
      setStatus("Protocol frozen. Future changes will be recorded as amendments.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
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
  required("review-protocol-state", HTMLElement).textContent =
    `${protocol.status === "frozen" ? "Frozen" : "Draft"} · r${snapshot.revision}`;
  required("freeze-review-protocol", HTMLButtonElement).disabled = protocol.status === "frozen";
  required("review-calibration", HTMLElement).textContent = `${protocol.calibration.matched} / ${protocol.calibration.total} seeds`;
  renderQueries(protocol);
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Review protocol operation failed";
}

function required<ElementType extends Element>(id: string, constructor: { new (): ElementType }): ElementType {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error(`Missing review-study element #${id}`);
  return element;
}

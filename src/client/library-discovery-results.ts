import { html, LitElement, type TemplateResult } from "lit";
import { referenceDiscoveryIdentifierUrl, type ReferenceDiscoveryResult } from "../domain/reference-discovery";
import { errorMessage } from "./http";
import { importDiscoveredReference } from "./reference-discovery-import";

export const libraryDiscoveryRefreshEvent = "library-discovery-refresh";

export interface LibraryDiscoveryRefresh {
  readonly index: number;
  readonly message: string;
  readonly requestId: number;
}

type SaveState = "idle" | "saving" | "saved";

export class LibraryDiscoveryResults extends LitElement {
  static override properties = {
    results: { state: true },
    saveStates: { state: true },
    status: { state: true },
  };

  declare private results: readonly ReferenceDiscoveryResult[];
  declare private saveStates: ReadonlyMap<number, SaveState>;
  declare private status: string;
  private readonly requestIds = new Map<number, number>();
  private nextRequestId = 0;

  constructor() {
    super();
    this.results = [];
    this.saveStates = new Map();
    this.status = "";
  }

  setResults(results: readonly ReferenceDiscoveryResult[]): void {
    this.results = results;
    this.saveStates = new Map();
    this.requestIds.clear();
    this.status = "";
  }

  setSaveState(index: number, state: SaveState): void {
    if (!this.results[index]) return;
    const next = new Map(this.saveStates);
    if (state === "idle") next.delete(index);
    else next.set(index, state);
    this.saveStates = next;
  }

  complete(index: number, requestId: number): void {
    if (this.requestIds.get(index) !== requestId) return;
    this.requestIds.delete(index);
    this.setSaveState(index, "saved");
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`
      ${this.results.map((result, index) => this.renderResult(result, index))}
      <p class="status-line" role="status" ?hidden=${!this.status}>${this.status}</p>
    `;
  }

  protected async save(event: Event): Promise<void> {
    const index = Number((event.currentTarget as HTMLButtonElement).dataset.resultIndex);
    const result = this.results[index];
    if (!result || !Number.isSafeInteger(index) || this.saveStates.get(index) !== undefined) return;
    const requestId = ++this.nextRequestId;
    this.requestIds.set(index, requestId);
    this.setSaveState(index, "saving");
    this.status = "";
    try {
      await importDiscoveredReference(result);
      if (this.requestIds.get(index) !== requestId) return;
      this.dispatchEvent(
        new CustomEvent<LibraryDiscoveryRefresh>(libraryDiscoveryRefreshEvent, {
          bubbles: true,
          composed: true,
          detail: { index, message: "Reference saved to the private Library.", requestId },
        }),
      );
    } catch (error) {
      if (this.requestIds.get(index) !== requestId) return;
      this.requestIds.delete(index);
      this.setSaveState(index, "idle");
      this.status = errorMessage(error, "Could not save the reference.");
    }
  }

  private renderResult(result: ReferenceDiscoveryResult, index: number): TemplateResult {
    const identifier = result.identifiers[0]!;
    const state = this.saveStates.get(index) ?? "idle";
    return html`
      <article class="resource-card">
        <p class="eyebrow">${result.providers.map(({ provider }) => providerLabel(provider)).join(" + ")}</p>
        <h3 class="mt-2 text-base font-semibold">${result.metadata.title}</h3>
        <p class="mt-2 text-xs text-app-text-soft">
          ${[result.metadata.authors.join("; "), result.metadata.year, result.metadata.venue].filter(Boolean).join(" · ")}
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a class="button-secondary" href=${referenceDiscoveryIdentifierUrl(identifier)} target="_blank" rel="noopener noreferrer">
            Verify ${identifier.scheme === "semantic-scholar" ? "Semantic Scholar" : identifier.scheme.toUpperCase()}
          </a>
          <button class="button-primary" type="button" data-result-index=${index} ?disabled=${state !== "idle"} @click=${this.save}>
            ${state === "saved" ? "Saved to library" : state === "saving" ? "Saving…" : "Save to library"}
          </button>
        </div>
      </article>
    `;
  }
}

function providerLabel(provider: ReferenceDiscoveryResult["providers"][number]["provider"]): string {
  if (provider === "semantic-scholar") return "Semantic Scholar";
  if (provider === "openalex") return "OpenAlex";
  return "Crossref";
}

if (typeof customElements !== "undefined" && !customElements.get("library-discovery-results")) {
  customElements.define("library-discovery-results", LibraryDiscoveryResults);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-discovery-results": LibraryDiscoveryResults;
  }
}

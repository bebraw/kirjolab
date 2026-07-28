import { html, type TemplateResult } from "lit";
import { referenceDiscoveryIdentifierUrl, type ReferenceDiscoveryResult } from "../domain/reference-discovery";

export type ReferenceSaveState = "idle" | "saving" | "saved";

export function referenceDiscoveryResult(
  result: ReferenceDiscoveryResult,
  index: number,
  state: ReferenceSaveState,
  save: (event: Event) => unknown,
): TemplateResult {
  const identifier = result.identifiers[0]!;
  const providers = result.providers
    .map(({ provider }) => (provider === "semantic-scholar" ? "Semantic Scholar" : provider === "openalex" ? "OpenAlex" : "Crossref"))
    .join(" + ");
  return html`<article class="resource-card">
    <p class="eyebrow">${providers}</p>
    <h3 class="mt-2 text-base font-semibold">${result.metadata.title}</h3>
    <p class="mt-2 text-xs text-app-text-soft">
      ${[result.metadata.authors.join("; "), result.metadata.year, result.metadata.venue].filter(Boolean).join(" · ")}
    </p>
    <div class="mt-3 flex flex-wrap gap-2">
      <a class="button-secondary" href=${referenceDiscoveryIdentifierUrl(identifier)} target="_blank" rel="noopener noreferrer">
        Verify ${identifier.scheme === "semantic-scholar" ? "Semantic Scholar" : identifier.scheme.toUpperCase()}
      </a>
      <button class="button-primary" type="button" data-result-index=${index} ?disabled=${state !== "idle"} @click=${save}>
        ${state === "saved" ? "Saved to library" : state === "saving" ? "Saving…" : "Save to library"}
      </button>
    </div>
  </article>`;
}

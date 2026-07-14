import { normalizeDoi } from "../domain/bibliography";
import type { BibliographicRecord, CrossrefMetadataField, MetadataRefinementCandidate } from "../domain/reference-library";

export interface MetadataWorkGroup {
  readonly doi: string;
  readonly candidates: readonly MetadataRefinementCandidate[];
}

export function groupMetadataCandidates(candidates: readonly MetadataRefinementCandidate[]): MetadataWorkGroup[] {
  const groups = new Map<string, MetadataRefinementCandidate[]>();
  for (const candidate of candidates) {
    const doi = normalizeDoi(candidate.metadata.doi);
    if (!doi) continue;
    const group = groups.get(doi);
    if (group) group.push(candidate);
    else groups.set(doi, [candidate]);
  }
  return [...groups].map(([doi, groupedCandidates]) => ({ doi, candidates: groupedCandidates }));
}

export function metadataFieldValue(
  value: BibliographicRecord | MetadataRefinementCandidate["metadata"],
  field: CrossrefMetadataField,
): string {
  return field === "authors" ? value.authors.join("; ") : value[field];
}

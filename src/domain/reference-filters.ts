import type { BibliographicRecord, ReferenceLibrarySnapshot } from "./reference-library";
import { bibTeXDisplayText } from "./bibliography";

export interface ReferenceLibraryFilters {
  readonly query: string;
  readonly type: string;
  readonly readingStatus: "all" | "unread" | "reading" | "read";
  readonly organization: string;
  readonly linkage: "all" | "linked" | "unlinked";
  readonly completeness: "all" | "complete" | "incomplete";
  readonly sort: "updated" | "title" | "year" | "priority";
}

export function filterReferenceLibrary(
  library: ReferenceLibrarySnapshot,
  linkedReferenceIds: ReadonlySet<string>,
  filters: ReferenceLibraryFilters,
): BibliographicRecord[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const organization = filters.organization.trim().toLocaleLowerCase();
  const reading = new Map(library.reading.map((state) => [state.referenceId, state]));
  const results = library.references.filter((reference) => {
    const state = reading.get(reference.id);
    const searchable = [
      reference.referenceKey,
      bibTeXDisplayText(reference.title),
      bibTeXDisplayText(reference.authors.join(" ")),
      reference.year,
      bibTeXDisplayText(reference.venue),
      reference.doi,
      reference.url,
    ]
      .join(" ")
      .toLocaleLowerCase();
    const organizedBy = [...(library.tags[reference.id] ?? []), ...(library.collections[reference.id] ?? [])].map((value) =>
      value.toLocaleLowerCase(),
    );
    const complete = Boolean(reference.type && reference.title && reference.authors.length > 0 && reference.year);
    return (
      (!query || searchable.includes(query)) &&
      (!filters.type || reference.type === filters.type) &&
      (filters.readingStatus === "all" || (state?.status ?? "unread") === filters.readingStatus) &&
      (!organization || organizedBy.some((value) => value.includes(organization))) &&
      (filters.linkage === "all" || linkedReferenceIds.has(reference.id) === (filters.linkage === "linked")) &&
      (filters.completeness === "all" || complete === (filters.completeness === "complete"))
    );
  });
  return results.sort((left, right) => compareReferences(left, right, filters.sort, reading));
}

function compareReferences(
  left: BibliographicRecord,
  right: BibliographicRecord,
  sort: ReferenceLibraryFilters["sort"],
  reading: ReadonlyMap<string, ReferenceLibrarySnapshot["reading"][number]>,
): number {
  const leftTitle = bibTeXDisplayText(left.title);
  const rightTitle = bibTeXDisplayText(right.title);
  if (sort === "title") return leftTitle.localeCompare(rightTitle);
  if (sort === "year") return right.year.localeCompare(left.year) || leftTitle.localeCompare(rightTitle);
  if (sort === "priority") {
    const weight = { high: 0, normal: 1, low: 2 } as const;
    return (
      weight[reading.get(left.id)?.priority ?? "normal"] - weight[reading.get(right.id)?.priority ?? "normal"] ||
      leftTitle.localeCompare(rightTitle)
    );
  }
  return right.updatedAt.localeCompare(left.updatedAt) || leftTitle.localeCompare(rightTitle);
}

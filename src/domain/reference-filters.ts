import type { BibliographicRecord, ReferenceLibrarySnapshot } from "./reference-library";

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
      reference.title,
      reference.authors.join(" "),
      reference.year,
      reference.venue,
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
  if (sort === "title") return left.title.localeCompare(right.title);
  if (sort === "year") return right.year.localeCompare(left.year) || left.title.localeCompare(right.title);
  if (sort === "priority") {
    const weight = { high: 0, normal: 1, low: 2 } as const;
    return (
      weight[reading.get(left.id)?.priority ?? "normal"] - weight[reading.get(right.id)?.priority ?? "normal"] ||
      left.title.localeCompare(right.title)
    );
  }
  return right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title);
}

import type { ProjectReferencePdf, ReferenceLibrarySnapshot } from "../../domain/reference-library";
import type { WorkspaceSnapshot } from "../../domain/workspace/workspace";
import type { ResearchResourceTab } from "../context/research-context";
import type { PublicationPaperOption } from "../publication/publication-context-panel";

export interface RelatedPaperGroup {
  readonly referenceId: string;
  readonly referenceTitle: string;
  readonly papers: readonly PublicationPaperOption[];
}

export function relatedPaperGroups(
  tab: ResearchResourceTab | undefined,
  snapshot: WorkspaceSnapshot | null,
  referencePdfs: readonly ProjectReferencePdf[],
  library: ReferenceLibrarySnapshot | null,
): readonly RelatedPaperGroup[] {
  if (!tab || !snapshot || (tab.kind !== "pdf" && tab.kind !== "library-pdf")) return [];

  const linkedReferenceIds = new Set([
    ...snapshot.projectReferences.map(({ referenceId }) => referenceId),
    ...referencePdfs.map(({ referenceId }) => referenceId),
  ]);
  const activeReferenceIds =
    tab.kind === "pdf"
      ? snapshot.publicationPdfLinks.filter(({ pdfId }) => pdfId === tab.id).map(({ publicationId }) => publicationId)
      : [
          library?.artifacts.find(({ id }) => id === tab.id)?.referenceId,
          referencePdfs.find(({ id }) => id === tab.id)?.referenceId,
          referencePdfs.find(({ ownArtifactId }) => ownArtifactId === tab.id)?.referenceId,
        ].filter((id): id is string => Boolean(id && linkedReferenceIds.has(id)));

  return [...new Set(activeReferenceIds)].flatMap((referenceId) => {
    const reference = snapshot.publications.find(({ id }) => id === referenceId);
    if (!reference) return [];
    const projectPapers: PublicationPaperOption[] = snapshot.publicationPdfLinks
      .filter(({ publicationId }) => publicationId === referenceId)
      .flatMap(({ id, pdfId }) => {
        const pdf = snapshot.pdfs.find(({ id: candidateId }) => candidateId === pdfId);
        return pdf && pdf.id !== tab.id ? [{ kind: "project" as const, pdf, linkId: id }] : [];
      });
    const referencePapers: PublicationPaperOption[] = referencePdfs
      .filter(
        ({ referenceId: candidateId, id, ownArtifactId }) =>
          candidateId === referenceId && id !== tab.id && ownArtifactId !== tab.id && linkedReferenceIds.has(referenceId),
      )
      .map((pdf) => {
        const artifact = library?.artifacts.find(({ id }) => id === (pdf.ownArtifactId ?? pdf.id));
        return artifact ? { kind: "library", artifact } : { kind: "reference", pdf };
      });
    const papers = [...projectPapers, ...referencePapers];
    return papers.length > 0 ? [{ referenceId, referenceTitle: reference.title, papers }] : [];
  });
}

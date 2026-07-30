import * as v from "valibot";
import { isPublicationReferenceDeclaration, renderSync } from "scholarmark";
import type { WorkspaceMember, WorkspaceSnapshot } from "./workspace/workspace";

export type KnowledgeResourceKind =
  "project" | "document" | "section" | "publication" | "pdf" | "annotation" | "claim" | "note" | "person" | "model-candidate";
export type ScholarlyRelation =
  | "contains"
  | "participates-in"
  | "cites"
  | "annotates"
  | "has-artifact"
  | "used-in"
  | "supports"
  | "contradicts"
  | "extends"
  | "derived-from";

export interface KnowledgeSearchResult {
  resourceId: string;
  kind: KnowledgeResourceKind;
  title: string;
  excerpt: string;
  score: number;
}

export interface KnowledgeGraphNode {
  id: string;
  kind: KnowledgeResourceKind;
  label: string;
}

export interface KnowledgeGraphEdge {
  id: string;
  relation: ScholarlyRelation;
  from: string;
  to: string;
  label: string;
}

export interface WorkspaceKnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

interface SectionResource {
  id: string;
  title: string;
  excerpt: string;
}

const knowledgeResourceKindSchema = v.picklist([
  "project",
  "document",
  "section",
  "publication",
  "pdf",
  "annotation",
  "claim",
  "note",
  "person",
  "model-candidate",
]);
const nonEmptyStringSchema = v.pipe(v.string(), v.minLength(1));
const knowledgeSearchResultSchema = v.object({
  resourceId: nonEmptyStringSchema,
  kind: knowledgeResourceKindSchema,
  title: nonEmptyStringSchema,
  excerpt: v.string(),
  score: v.number(),
});
const knowledgeGraphNodeSchema = v.object({
  id: nonEmptyStringSchema,
  kind: knowledgeResourceKindSchema,
  label: nonEmptyStringSchema,
});
const knowledgeGraphEdgeSchema = v.object({
  id: nonEmptyStringSchema,
  relation: v.picklist([
    "cites",
    "contains",
    "participates-in",
    "annotates",
    "has-artifact",
    "used-in",
    "supports",
    "contradicts",
    "extends",
    "derived-from",
  ]),
  from: nonEmptyStringSchema,
  to: nonEmptyStringSchema,
  label: v.string(),
});
const workspaceKnowledgeGraphSchema = v.object({
  nodes: v.array(knowledgeGraphNodeSchema),
  edges: v.array(knowledgeGraphEdgeSchema),
});

export function searchWorkspaceKnowledge(
  snapshot: WorkspaceSnapshot,
  query: string,
  members: readonly WorkspaceMember[] = [],
): KnowledgeSearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const candidates: Array<Omit<KnowledgeSearchResult, "score">> = [
    {
      resourceId: projectId(snapshot.id),
      kind: "project",
      title: snapshot.title,
      excerpt: "Scholarly project",
    },
    {
      resourceId: documentId(snapshot.id),
      kind: "document",
      title: snapshot.title,
      excerpt: "",
    },
    ...extractSections(snapshot.source).map((section) => ({
      resourceId: section.id,
      kind: "section" as const,
      title: section.title,
      excerpt: section.excerpt,
    })),
    ...snapshot.publications.map((publication) => ({
      resourceId: publicationId(publication.id),
      kind: "publication" as const,
      title: publication.title,
      excerpt: excerpt(
        [publication.authors.join("; "), publication.year, publication.venue, publication.doi, publication.abstract].join(" · "),
      ),
    })),
    ...snapshot.pdfs.map((pdf) => ({
      resourceId: pdfId(pdf.id),
      kind: "pdf" as const,
      title: pdf.name,
      excerpt: `PDF · ${formatBytes(pdf.size)}`,
    })),
    ...snapshot.annotations.map((annotation) => ({
      resourceId: annotationId(annotation.id),
      kind: "annotation" as const,
      title: annotation.comment || `Annotation on page ${annotation.page}`,
      excerpt: excerpt(annotation.quote),
    })),
    ...snapshot.claims.map((claim) => ({
      resourceId: claimId(claim.id),
      kind: "claim" as const,
      title: claim.text,
      excerpt: excerpt(
        [
          claim.note,
          ...snapshot.claimEvidenceLinks
            .filter((link) => link.claimId === claim.id)
            .map((link) => snapshot.annotations.find((annotation) => annotation.id === link.annotationId))
            .filter((annotation) => annotation !== undefined)
            .flatMap((annotation) => [annotation.comment, annotation.quote]),
        ].join(" · "),
      ),
    })),
    ...snapshot.researchShares.flatMap((share) =>
      share.revokedAt === null && share.content.kind === "note"
        ? [
            {
              resourceId: noteId(share.resourceId),
              kind: "note" as const,
              title: excerpt(share.content.body, 80) || "Shared research note",
              excerpt: excerpt(share.content.body),
            },
          ]
        : [],
    ),
    ...snapshot.candidates.map((candidate) => ({
      resourceId: modelCandidateId(candidate.id),
      kind: "model-candidate" as const,
      title:
        excerpt(candidate.operation === "draft-claim" ? candidate.proposedText : candidate.proposedReplacement, 80) ||
        (candidate.operation === "draft-claim" ? "Model claim candidate" : "Model revision candidate"),
      excerpt: excerpt([candidate.operation, candidate.instruction, candidate.model, candidate.status].join(" · ")),
    })),
    ...members.map((member) => ({
      resourceId: personId(member.id),
      kind: "person" as const,
      title: member.email,
      excerpt: `${member.role} · project collaborator`,
    })),
  ];

  return candidates
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, tokens) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, 50);
}

export function buildWorkspaceKnowledgeGraph(
  snapshot: WorkspaceSnapshot,
  members: readonly WorkspaceMember[] = [],
): WorkspaceKnowledgeGraph {
  const projectResourceId = projectId(snapshot.id);
  const documentResourceId = documentId(snapshot.id);
  const graph = baseKnowledgeGraph(snapshot, projectResourceId, documentResourceId);
  addMembers(graph, snapshot.id, projectResourceId, members);
  addScholarlyResources(graph, snapshot);
  addEvidenceRelations(graph, snapshot, documentResourceId);
  addResearchNotes(graph, snapshot);
  addModelCandidates(graph, snapshot, documentResourceId);
  addCitations(graph, snapshot, documentResourceId);
  return graph;
}

function baseKnowledgeGraph(snapshot: WorkspaceSnapshot, projectResourceId: string, documentResourceId: string): WorkspaceKnowledgeGraph {
  return {
    nodes: [
      { id: projectResourceId, kind: "project", label: snapshot.title },
      { id: documentResourceId, kind: "document", label: snapshot.title },
    ],
    edges: [
      {
        id: `contains:${snapshot.id}:${snapshot.id}`,
        relation: "contains",
        from: projectResourceId,
        to: documentResourceId,
        label: "main manuscript",
      },
    ],
  };
}

function addMembers(
  graph: WorkspaceKnowledgeGraph,
  workspaceId: string,
  projectResourceId: string,
  members: readonly WorkspaceMember[],
): void {
  for (const member of members) {
    const resourceId = personId(member.id);
    graph.nodes.push({ id: resourceId, kind: "person", label: member.email });
    graph.edges.push({
      id: `participates-in:${member.id}:${workspaceId}`,
      relation: "participates-in",
      from: resourceId,
      to: projectResourceId,
      label: member.role,
    });
  }
}

function addScholarlyResources(graph: WorkspaceKnowledgeGraph, snapshot: WorkspaceSnapshot): void {
  graph.nodes.push(
    ...extractSections(snapshot.source).map((section) => ({ id: section.id, kind: "section" as const, label: section.title })),
    ...snapshot.publications.map((publication) => ({
      id: publicationId(publication.id),
      kind: "publication" as const,
      label: publication.title,
    })),
    ...snapshot.pdfs.map((pdf) => ({ id: pdfId(pdf.id), kind: "pdf" as const, label: pdf.name })),
  );
  graph.edges.push(
    ...snapshot.publicationPdfLinks.map((link) => ({
      id: `has-artifact:${link.id}`,
      relation: "has-artifact" as const,
      from: publicationId(link.publicationId),
      to: pdfId(link.pdfId),
      label: "has artifact",
    })),
  );
  for (const annotation of snapshot.annotations) {
    const resourceId = annotationId(annotation.id);
    graph.nodes.push({ id: resourceId, kind: "annotation", label: annotation.comment || excerpt(annotation.quote, 80) });
    graph.edges.push({
      id: `annotates:${annotation.id}:${annotation.pdfId}`,
      relation: "annotates",
      from: resourceId,
      to: pdfId(annotation.pdfId),
      label: `page ${annotation.page}`,
    });
  }
  graph.nodes.push(...snapshot.claims.map((claim) => ({ id: claimId(claim.id), kind: "claim" as const, label: claim.text })));
}

function addEvidenceRelations(graph: WorkspaceKnowledgeGraph, snapshot: WorkspaceSnapshot, documentResourceId: string): void {
  graph.edges.push(
    ...snapshot.claimEvidenceLinks.map((link) => ({
      id: `${link.relation}:${link.id}`,
      relation: link.relation,
      from: annotationId(link.annotationId),
      to: claimId(link.claimId),
      label: link.relation,
    })),
    ...snapshot.claimLinks.map((link) => ({
      id: `used-in:${link.id}`,
      relation: "used-in" as const,
      from: claimId(link.claimId),
      to: documentResourceId,
      label: anchorLabel(link),
    })),
    ...snapshot.links.map((link) => ({
      id: `used-in:${link.id}`,
      relation: "used-in" as const,
      from: annotationId(link.annotationId),
      to: documentResourceId,
      label: anchorLabel(link),
    })),
  );
}

function anchorLabel(link: WorkspaceSnapshot["links"][number] | WorkspaceSnapshot["claimLinks"][number]): string {
  return excerpt(link.resolution.status === "resolved" ? link.resolution.text : link.anchor.exact, 100);
}

function addResearchNotes(graph: WorkspaceKnowledgeGraph, snapshot: WorkspaceSnapshot): void {
  const publicationIds = new Set(snapshot.publications.map((publication) => publication.id));
  for (const share of snapshot.researchShares) {
    if (share.revokedAt !== null || share.content.kind !== "note") continue;
    const resourceId = noteId(share.resourceId);
    graph.nodes.push({ id: resourceId, kind: "note", label: excerpt(share.content.body, 80) || "Shared research note" });
    if (!publicationIds.has(share.referenceId)) continue;
    graph.edges.push({
      id: `derived-from:${share.id}`,
      relation: "derived-from",
      from: resourceId,
      to: publicationId(share.referenceId),
      label: "note about source",
    });
  }
}

function addModelCandidates(graph: WorkspaceKnowledgeGraph, snapshot: WorkspaceSnapshot, documentResourceId: string): void {
  for (const candidate of snapshot.candidates) {
    const resourceId = modelCandidateId(candidate.id);
    graph.nodes.push({ id: resourceId, kind: "model-candidate", label: candidateLabel(candidate) });
    graph.edges.push(
      ...candidate.evidence.map((evidence) => ({
        id: `derived-from:${candidate.id}:${evidence.kind}:${evidence.id}`,
        relation: "derived-from" as const,
        from: resourceId,
        to: evidence.kind === "annotation" ? annotationId(evidence.id) : claimId(evidence.id),
        label: evidence.kind,
      })),
    );
    if (candidate.operation !== "revise-selection") continue;
    graph.edges.push({
      id: `used-in:${candidate.id}`,
      relation: "used-in",
      from: resourceId,
      to: documentResourceId,
      label: excerpt(candidate.target.anchor.exact, 100),
    });
  }
}

function candidateLabel(candidate: WorkspaceSnapshot["candidates"][number]): string {
  const fallback = candidate.operation === "draft-claim" ? "Model claim candidate" : "Model revision candidate";
  const text = candidate.operation === "draft-claim" ? candidate.proposedText : candidate.proposedReplacement;
  return excerpt(text, 80) || fallback;
}

function addCitations(graph: WorkspaceKnowledgeGraph, snapshot: WorkspaceSnapshot, documentResourceId: string): void {
  const publicationsByKey = new Map(snapshot.publications.map((publication) => [publication.citationKey.toLowerCase(), publication]));
  const cited = new Set<string>();
  for (const citationKey of extractCitationKeys(snapshot.source)) {
    const publication = publicationsByKey.get(citationKey.toLowerCase());
    if (!publication || cited.has(publication.id)) continue;
    cited.add(publication.id);
    graph.edges.push({
      id: `cites:${snapshot.id}:${publication.id}`,
      relation: "cites",
      from: documentResourceId,
      to: publicationId(publication.id),
      label: publication.citationKey,
    });
  }
}

export function isKnowledgeSearchResults(value: unknown): value is KnowledgeSearchResult[] {
  return v.is(v.array(knowledgeSearchResultSchema), value);
}

export function isWorkspaceKnowledgeGraph(value: unknown): value is WorkspaceKnowledgeGraph {
  return v.is(workspaceKnowledgeGraphSchema, value);
}

function extractSections(source: string): SectionResource[] {
  const headings = renderSync(source, "").headings;
  return headings.map((heading, index) => {
    const bodyEnd = headings[index + 1]?.from ?? source.length;
    const body = source
      .slice(heading.to, bodyEnd)
      .split(/\r?\n/u)
      .filter((line) => !isPublicationReferenceDeclaration(line))
      .join("\n");
    return { id: sectionId(heading.id), title: heading.title, excerpt: excerpt(body) };
  });
}

function extractCitationKeys(source: string): string[] {
  return [...source.matchAll(/:(?:cite|citet|citep)\[([^\]]*)\]/gu)].flatMap((match) =>
    (match[1] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function scoreCandidate(candidate: Omit<KnowledgeSearchResult, "score">, tokens: string[]): number {
  const title = candidate.title.toLowerCase();
  const body = candidate.excerpt.toLowerCase();
  if (!tokens.every((token) => title.includes(token) || body.includes(token))) return 0;
  return tokens.reduce((score, token) => score + (title.startsWith(token) ? 8 : title.includes(token) ? 5 : 2), 0);
}

function tokenize(value: string): string[] {
  return value.trim().toLowerCase().split(/\s+/u).filter(Boolean).slice(0, 10);
}

function excerpt(value: string, maximum = 240): string {
  const normalized = value.replaceAll(/\s+/gu, " ").trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1).trimEnd()}…`;
}

function formatBytes(value: number): string {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function documentId(id: string): string {
  return `document:${id}`;
}

function projectId(id: string): string {
  return `project:${id}`;
}

function sectionId(id: string): string {
  return `section:${id}`;
}

function publicationId(id: string): string {
  return `publication:${id}`;
}

function pdfId(id: string): string {
  return `pdf:${id}`;
}

function annotationId(id: string): string {
  return `annotation:${id}`;
}

function claimId(id: string): string {
  return `claim:${id}`;
}

function noteId(id: string): string {
  return `note:${id}`;
}

function personId(id: string): string {
  return `person:${id}`;
}

function modelCandidateId(id: string): string {
  return `model-candidate:${id}`;
}

export function isKnowledgeResourceKind(value: unknown): value is KnowledgeResourceKind {
  return v.is(knowledgeResourceKindSchema, value);
}

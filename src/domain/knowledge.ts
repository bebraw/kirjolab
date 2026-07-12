import type { WorkspaceMember, WorkspaceSnapshot } from "./workspace";

export type KnowledgeResourceKind =
  | "project"
  | "document"
  | "section"
  | "publication"
  | "pdf"
  | "annotation"
  | "claim"
  | "note"
  | "person"
  | "model-candidate";
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
      title: excerpt(candidate.proposedReplacement, 80) || "Model revision candidate",
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
  const nodes: KnowledgeGraphNode[] = [
    { id: projectResourceId, kind: "project", label: snapshot.title },
    { id: documentResourceId, kind: "document", label: snapshot.title },
  ];
  const edges: KnowledgeGraphEdge[] = [
    {
      id: `contains:${snapshot.id}:${snapshot.id}`,
      relation: "contains",
      from: projectResourceId,
      to: documentResourceId,
      label: "main manuscript",
    },
  ];

  for (const member of members) {
    const resourceId = personId(member.id);
    nodes.push({ id: resourceId, kind: "person", label: member.email });
    edges.push({
      id: `participates-in:${member.id}:${snapshot.id}`,
      relation: "participates-in",
      from: resourceId,
      to: projectResourceId,
      label: member.role,
    });
  }

  for (const section of extractSections(snapshot.source)) nodes.push({ id: section.id, kind: "section", label: section.title });
  for (const publication of snapshot.publications) {
    nodes.push({ id: publicationId(publication.id), kind: "publication", label: publication.title });
  }
  for (const pdf of snapshot.pdfs) nodes.push({ id: pdfId(pdf.id), kind: "pdf", label: pdf.name });
  for (const link of snapshot.publicationPdfLinks) {
    edges.push({
      id: `has-artifact:${link.id}`,
      relation: "has-artifact",
      from: publicationId(link.publicationId),
      to: pdfId(link.pdfId),
      label: "has artifact",
    });
  }
  for (const annotation of snapshot.annotations) {
    const resourceId = annotationId(annotation.id);
    nodes.push({ id: resourceId, kind: "annotation", label: annotation.comment || excerpt(annotation.quote, 80) });
    edges.push({
      id: `annotates:${annotation.id}:${annotation.pdfId}`,
      relation: "annotates",
      from: resourceId,
      to: pdfId(annotation.pdfId),
      label: `page ${annotation.page}`,
    });
  }
  for (const claim of snapshot.claims) nodes.push({ id: claimId(claim.id), kind: "claim", label: claim.text });
  for (const link of snapshot.claimEvidenceLinks) {
    edges.push({
      id: `${link.relation}:${link.id}`,
      relation: link.relation,
      from: annotationId(link.annotationId),
      to: claimId(link.claimId),
      label: link.relation,
    });
  }
  for (const link of snapshot.claimLinks) {
    edges.push({
      id: `used-in:${link.id}`,
      relation: "used-in",
      from: claimId(link.claimId),
      to: documentResourceId,
      label: excerpt(link.resolution.status === "resolved" ? link.resolution.text : link.anchor.exact, 100),
    });
  }
  for (const link of snapshot.links) {
    edges.push({
      id: `used-in:${link.id}`,
      relation: "used-in",
      from: annotationId(link.annotationId),
      to: documentResourceId,
      label: excerpt(link.resolution.status === "resolved" ? link.resolution.text : link.anchor.exact, 100),
    });
  }

  const publicationIds = new Set(snapshot.publications.map((publication) => publication.id));
  for (const share of snapshot.researchShares) {
    if (share.revokedAt !== null || share.content.kind !== "note") continue;
    const resourceId = noteId(share.resourceId);
    nodes.push({ id: resourceId, kind: "note", label: excerpt(share.content.body, 80) || "Shared research note" });
    if (publicationIds.has(share.referenceId)) {
      edges.push({
        id: `derived-from:${share.id}`,
        relation: "derived-from",
        from: resourceId,
        to: publicationId(share.referenceId),
        label: "note about source",
      });
    }
  }

  for (const candidate of snapshot.candidates) {
    const resourceId = modelCandidateId(candidate.id);
    nodes.push({
      id: resourceId,
      kind: "model-candidate",
      label: excerpt(candidate.proposedReplacement, 80) || "Model revision candidate",
    });
    for (const evidence of candidate.evidence) {
      edges.push({
        id: `derived-from:${candidate.id}:${evidence.kind}:${evidence.id}`,
        relation: "derived-from",
        from: resourceId,
        to: evidence.kind === "annotation" ? annotationId(evidence.id) : claimId(evidence.id),
        label: evidence.kind,
      });
    }
    edges.push({
      id: `used-in:${candidate.id}`,
      relation: "used-in",
      from: resourceId,
      to: documentResourceId,
      label: excerpt(candidate.target.anchor.exact, 100),
    });
  }

  const publicationsByKey = new Map(snapshot.publications.map((publication) => [publication.citationKey.toLowerCase(), publication]));
  const cited = new Set<string>();
  for (const citationKey of extractCitationKeys(snapshot.source)) {
    const publication = publicationsByKey.get(citationKey.toLowerCase());
    if (!publication || cited.has(publication.id)) continue;
    cited.add(publication.id);
    edges.push({
      id: `cites:${snapshot.id}:${publication.id}`,
      relation: "cites",
      from: documentResourceId,
      to: publicationId(publication.id),
      label: publication.citationKey,
    });
  }

  return { nodes, edges };
}

export function isKnowledgeSearchResults(value: unknown): value is KnowledgeSearchResult[] {
  return Array.isArray(value) && value.every(isSearchResult);
}

export function isWorkspaceKnowledgeGraph(value: unknown): value is WorkspaceKnowledgeGraph {
  return (
    isRecord(value) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isGraphNode) &&
    Array.isArray(value.edges) &&
    value.edges.every(isGraphEdge)
  );
}

function extractSections(source: string): SectionResource[] {
  const matches = [...source.matchAll(/^(#{2,3})\s+(.+?)(?:\s+\{#([a-zA-Z0-9:_-]+)\})?\s*$/gmu)];
  const foundSlugs: Record<string, number> = {};
  return matches.map((match, index) => {
    const title = match[2] ?? "Untitled section";
    const id = match[3] ?? getUniqueSlug(title, foundSlugs);
    const bodyStart = match.index + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? source.length;
    return { id: sectionId(id), title, excerpt: excerpt(source.slice(bodyStart, bodyEnd)) };
  });
}

function getUniqueSlug(value: string, foundSlugs: Record<string, number>): string {
  const base = slugify(value);
  const count = foundSlugs[base] ?? 0;
  foundSlugs[base] = count + 1;
  return count === 0 ? base : `${base}-${count + 1}`;
}

function extractCitationKeys(source: string): string[] {
  return [...source.matchAll(/:cite\[([^\]]*)\]/gu)].flatMap((match) =>
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("`", "")
    .trim()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
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

function isSearchResult(value: unknown): value is KnowledgeSearchResult {
  return (
    isRecord(value) &&
    isNonEmptyString(value.resourceId) &&
    isKind(value.kind) &&
    isNonEmptyString(value.title) &&
    typeof value.excerpt === "string" &&
    typeof value.score === "number"
  );
}

function isGraphNode(value: unknown): value is KnowledgeGraphNode {
  return isRecord(value) && isNonEmptyString(value.id) && isKind(value.kind) && isNonEmptyString(value.label);
}

function isGraphEdge(value: unknown): value is KnowledgeGraphEdge {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    (value.relation === "cites" ||
      value.relation === "contains" ||
      value.relation === "participates-in" ||
      value.relation === "annotates" ||
      value.relation === "has-artifact" ||
      value.relation === "used-in" ||
      value.relation === "supports" ||
      value.relation === "contradicts" ||
      value.relation === "extends" ||
      value.relation === "derived-from") &&
    isNonEmptyString(value.from) &&
    isNonEmptyString(value.to) &&
    typeof value.label === "string"
  );
}

function isKind(value: unknown): value is KnowledgeResourceKind {
  return (
    value === "project" ||
    value === "document" ||
    value === "section" ||
    value === "publication" ||
    value === "pdf" ||
    value === "annotation" ||
    value === "claim" ||
    value === "note" ||
    value === "person" ||
    value === "model-candidate"
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

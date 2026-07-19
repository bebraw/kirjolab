import type { KnowledgeGraphNode } from "../domain/knowledge";

export type ProjectMapLaneId = "source" | "evidence" | "manuscript";

interface ProjectMapLaneDefinition {
  readonly id: ProjectMapLaneId;
  readonly label: string;
}

export const projectMapLaneDefinitions: readonly ProjectMapLaneDefinition[] = [
  { id: "source", label: "Source material" },
  { id: "evidence", label: "Evidence & reasoning" },
  { id: "manuscript", label: "Manuscript" },
];

export interface GroupedProjectMapNodes {
  readonly context: readonly KnowledgeGraphNode[];
  readonly lanes: Readonly<Record<ProjectMapLaneId, readonly KnowledgeGraphNode[]>>;
}

export function groupProjectMapNodes(nodes: readonly KnowledgeGraphNode[]): GroupedProjectMapNodes {
  const context: KnowledgeGraphNode[] = [];
  const lanes: Record<ProjectMapLaneId, KnowledgeGraphNode[]> = {
    source: [],
    evidence: [],
    manuscript: [],
  };

  for (const node of nodes) {
    const group = projectMapNodeGroup(node.kind);
    if (group === "context") context.push(node);
    else lanes[group].push(node);
  }

  return { context, lanes };
}

export function projectMapNodeGroup(kind: KnowledgeGraphNode["kind"]): ProjectMapLaneId | "context" {
  switch (kind) {
    case "project":
    case "person":
      return "context";
    case "publication":
    case "pdf":
      return "source";
    case "annotation":
    case "claim":
    case "note":
    case "model-candidate":
      return "evidence";
    case "document":
    case "section":
      return "manuscript";
  }
}

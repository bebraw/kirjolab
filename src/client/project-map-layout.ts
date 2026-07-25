import type { KnowledgeGraphNode, WorkspaceKnowledgeGraph } from "../domain/knowledge";

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

export interface ProjectMapRect {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

export interface ProjectMapEdgeLayout {
  readonly from: string;
  readonly path: string;
  readonly relation: string;
  readonly title: string;
  readonly to: string;
  readonly x: number;
  readonly y: number;
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

export function layoutProjectMapEdges(
  graph: WorkspaceKnowledgeGraph,
  canvas: ProjectMapRect,
  nodes: ReadonlyMap<string, ProjectMapRect>,
): readonly ProjectMapEdgeLayout[] {
  if (canvas.width === 0 || canvas.height === 0) return [];
  return graph.edges.flatMap((edge) => {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) return [];
    const fromCenter = rectCenter(from, canvas);
    const toCenter = rectCenter(to, canvas);
    const start = boundaryPoint(from, fromCenter, toCenter);
    const end = boundaryPoint(to, toCenter, fromCenter);
    return [
      {
        from: edge.from,
        path: edgePath(start, end),
        relation: edge.relation,
        title: `${edge.relation}: ${graph.nodes.find((node) => node.id === edge.from)?.kind ?? "resource"}: ${
          graph.nodes.find((node) => node.id === edge.from)?.label ?? edge.from
        } → ${graph.nodes.find((node) => node.id === edge.to)?.kind ?? "resource"}: ${
          graph.nodes.find((node) => node.id === edge.to)?.label ?? edge.to
        }`,
        to: edge.to,
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2 - 6,
      },
    ];
  });
}

export function projectMapNodeEmphasis(
  graph: WorkspaceKnowledgeGraph,
  activeId: string | null,
  nodeId: string,
): "active" | "connected" | "muted" | undefined {
  if (!activeId) return undefined;
  if (nodeId === activeId) return "active";
  return graph.edges.some((edge) => (edge.from === activeId && edge.to === nodeId) || (edge.to === activeId && edge.from === nodeId))
    ? "connected"
    : "muted";
}

function rectCenter(rect: ProjectMapRect, canvas: ProjectMapRect): { readonly x: number; readonly y: number } {
  return {
    x: rect.left - canvas.left + rect.width / 2,
    y: rect.top - canvas.top + rect.height / 2,
  };
}

function boundaryPoint(
  bounds: ProjectMapRect,
  center: { readonly x: number; readonly y: number },
  toward: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  const deltaX = toward.x - center.x;
  const deltaY = toward.y - center.y;
  const horizontalScale = deltaX === 0 ? Number.POSITIVE_INFINITY : (bounds.width / 2 + 3) / Math.abs(deltaX);
  const verticalScale = deltaY === 0 ? Number.POSITIVE_INFINITY : (bounds.height / 2 + 3) / Math.abs(deltaY);
  const scale = Math.min(horizontalScale, verticalScale);
  return { x: center.x + deltaX * scale, y: center.y + deltaY * scale };
}

function edgePath(start: { readonly x: number; readonly y: number }, end: { readonly x: number; readonly y: number }): string {
  if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
    const middleX = (start.x + end.x) / 2;
    return `M ${start.x} ${start.y} C ${middleX} ${start.y}, ${middleX} ${end.y}, ${end.x} ${end.y}`;
  }
  const middleY = (start.y + end.y) / 2;
  return `M ${start.x} ${start.y} C ${start.x} ${middleY}, ${end.x} ${middleY}, ${end.x} ${end.y}`;
}

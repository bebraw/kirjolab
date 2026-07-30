import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode, WorkspaceKnowledgeGraph } from "../../domain/knowledge";
import {
  groupProjectMapNodes,
  layoutProjectMapEdges,
  projectMapLaneDefinitions,
  projectMapNodeEmphasis,
  projectMapNodeGroup,
} from "./project-map-layout";

const nodes: readonly KnowledgeGraphNode[] = [
  { id: "section:results", kind: "section", label: "Results" },
  { id: "annotation:grounding", kind: "annotation", label: "Grounding passage" },
  { id: "project:demo", kind: "project", label: "Evidence becomes prose" },
  { id: "pdf:evidence", kind: "pdf", label: "evidence.pdf" },
  { id: "person:author", kind: "person", label: "author@example.org" },
  { id: "claim:central", kind: "claim", label: "Evidence supports the claim" },
  { id: "publication:source", kind: "publication", label: "Inspectable evidence" },
  { id: "document:demo", kind: "document", label: "Evidence becomes prose" },
  { id: "model-candidate:revision", kind: "model-candidate", label: "A grounded revision" },
];

describe("project map layout", () => {
  it("groups every resource into deterministic provenance lanes", () => {
    const grouped = groupProjectMapNodes(nodes);

    expect(projectMapLaneDefinitions.map((lane) => lane.id)).toEqual(["source", "evidence", "manuscript"]);
    expect(grouped.context.map((node) => node.kind)).toEqual(["project", "person"]);
    expect(grouped.lanes.source.map((node) => node.kind)).toEqual(["pdf", "publication"]);
    expect(grouped.lanes.evidence.map((node) => node.kind)).toEqual(["annotation", "claim", "model-candidate"]);
    expect(grouped.lanes.manuscript.map((node) => node.kind)).toEqual(["section", "document"]);
    expect([...grouped.context, ...Object.values(grouped.lanes).flat()]).toHaveLength(nodes.length);
  });

  it("keeps project context separate from the evidence flow", () => {
    expect(projectMapNodeGroup("project")).toBe("context");
    expect(projectMapNodeGroup("person")).toBe("context");
    expect(projectMapNodeGroup("publication")).toBe("source");
    expect(projectMapNodeGroup("annotation")).toBe("evidence");
    expect(projectMapNodeGroup("section")).toBe("manuscript");
  });

  it("lays out horizontal and vertical connectors against node boundaries", () => {
    const graph: WorkspaceKnowledgeGraph = {
      edges: [
        { from: "project:demo", id: "edge:1", label: "", relation: "contains", to: "section:results" },
        { from: "project:demo", id: "edge:2", label: "", relation: "supports", to: "annotation:grounding" },
      ],
      nodes: [...nodes],
    };
    const canvas = { height: 500, left: 10, top: 20, width: 800 };
    const layouts = layoutProjectMapEdges(
      graph,
      canvas,
      new Map([
        ["project:demo", { height: 40, left: 30, top: 40, width: 100 }],
        ["section:results", { height: 40, left: 500, top: 60, width: 120 }],
        ["annotation:grounding", { height: 50, left: 40, top: 350, width: 140 }],
      ]),
    );

    expect(layouts).toHaveLength(2);
    expect(layouts[0]?.path).toContain(" C ");
    expect(layouts[0]?.title).toContain("contains: project: Evidence becomes prose");
    expect(layouts[1]?.path).toContain(" C ");
    expect(layouts[1]?.y).toBeGreaterThan(layouts[0]?.y ?? 0);
    expect(layoutProjectMapEdges(graph, { ...canvas, width: 0 }, new Map())).toEqual([]);
    expect(layoutProjectMapEdges(graph, canvas, new Map())).toEqual([]);
  });

  it("derives active, connected, muted, and clear node emphasis", () => {
    const graph: WorkspaceKnowledgeGraph = {
      edges: [{ from: "project:demo", id: "edge:1", label: "", relation: "contains", to: "section:results" }],
      nodes: [...nodes],
    };
    expect(projectMapNodeEmphasis(graph, null, "project:demo")).toBeUndefined();
    expect(projectMapNodeEmphasis(graph, "project:demo", "project:demo")).toBe("active");
    expect(projectMapNodeEmphasis(graph, "project:demo", "section:results")).toBe("connected");
    expect(projectMapNodeEmphasis(graph, "project:demo", "pdf:evidence")).toBe("muted");
  });
});

import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "../domain/knowledge";
import { groupProjectMapNodes, projectMapLaneDefinitions, projectMapNodeGroup } from "./project-map-layout";

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
});

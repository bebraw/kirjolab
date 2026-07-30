import { describe, expect, it } from "vitest";
import type { CitationAssertionView, CitationNetwork } from "../domain/citation-assertions";
import type { CitationExpansionResult } from "../domain/citation-expansion-types";
import {
  CitationNetworkPanel,
  citationEvidencePage,
  citationNetworkActionEvent,
  filterCitationNetwork,
  focusCitationNetwork,
  type CitationNetworkAction,
} from "./citation-network-panel";

const timestamp = "2026-07-25T00:00:00.000Z";
const assertion: CitationAssertionView = {
  assertedBy: "researcher",
  citedReferenceId: "b",
  citingReferenceId: "a",
  confidence: 0.8,
  createdAt: timestamp,
  evidenceState: "inferred",
  id: "assertion:1",
  method: "provider",
  observedAt: timestamp,
  polarity: "cites",
  review: null,
  sourceId: "response:1",
  sourceKind: "provider-response",
  sourceLocator: "Crossref",
  state: "inferred",
};
const network: CitationNetwork = {
  edges: [
    {
      assertions: [assertion],
      from: "reference:a",
      id: "edge:1",
      state: "inferred",
      to: "reference:b",
    },
  ],
  nodes: [
    {
      authors: ["Ada Author"],
      doi: "10.5555/a",
      id: "reference:a",
      inProject: true,
      label: "A deliberately long citation-network source title",
      referenceId: "a",
      year: "2026",
    },
    {
      authors: [],
      doi: "",
      id: "reference:b",
      inProject: false,
      label: "Source B",
      referenceId: "b",
      year: "",
    },
  ],
  projectId: null,
  truncated: true,
};
const expansion: CitationExpansionResult = {
  assertions: [],
  direction: "references",
  provider: "crossref",
  requestedBy: "researcher",
  responseId: "response:1",
  retrievedAt: timestamp,
  seedReferenceId: "a",
  sourceLocator: "Crossref",
  truncated: false,
  unmatched: [{ authors: "Bea Writer", doi: "10.5555/c", title: "Candidate C", unstructured: "", year: "2025" }],
};

class TestCitationNetworkPanel extends CitationNetworkPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  actForTest(action?: string, values: Record<string, string> = {}): void {
    this.act(eventWithTarget({ dataset: { citationAction: action, ...values } }));
  }

  changeSourceForTest(id: "citation-assertion-cited" | "citation-assertion-citing", value: string): void {
    this.changeSource(eventWithTarget({ id, value }));
  }

  changePolarityForTest(value: string): void {
    this.changePolarity(eventWithTarget({ value }));
  }

  recordForTest(): void {
    this.record(new Event("submit"));
  }

  toggleEvidenceForTest(state: string): void {
    this.toggleEvidenceState(eventWithTarget({ dataset: { citationState: state } }));
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

describe("citation network panel", () => {
  it("renders loading, empty, filtered, connected, reviewed, expansion, and saving states", () => {
    const panel = new TestCitationNetworkPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({
      expansion: null,
      filterProject: false,
      focusedReferenceId: null,
      network: { ...network, edges: [], nodes: [] },
      pdfArtifactIds: [],
      queue: [{ referenceId: "b", seedReferenceId: "a", direction: "references", addedAt: timestamp }],
      referenceTitles: {},
    });
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({
      expansion: null,
      filterProject: true,
      focusedReferenceId: null,
      network: { ...network, edges: [], nodes: [] },
      pdfArtifactIds: [],
      queue: [],
      referenceTitles: {},
    });
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({
      expansion,
      filterProject: false,
      focusedReferenceId: "a",
      network,
      pdfArtifactIds: ["artifact:1"],
      queue: [],
      referenceTitles: { a: "Seed A" },
    });
    panel.setCandidateSaving("10.5555/c", true);
    expect(panel.renderForTest()).toBeDefined();
    panel.setCandidateSaving("10.5555/c", false);
    panel.setData({
      expansion: { ...expansion, truncated: true, unmatched: [] },
      filterProject: false,
      focusedReferenceId: null,
      network: {
        ...network,
        edges: [
          {
            ...network.edges[0]!,
            assertions: [
              {
                ...assertion,
                review: { decision: "confirmed", note: "", reviewedAt: timestamp, reviewer: "Ada" },
              },
            ],
            state: "confirmed",
          },
        ],
      },
      pdfArtifactIds: [],
      queue: [],
      referenceTitles: {},
    });
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits only valid expand, review, and idle candidate intents", () => {
    const panel = new TestCitationNetworkPanel();
    const actions: CitationNetworkAction[] = [];
    panel.addEventListener(citationNetworkActionEvent, (event) => actions.push((event as CustomEvent<CitationNetworkAction>).detail));
    panel.setData({
      expansion,
      filterProject: false,
      focusedReferenceId: null,
      network,
      pdfArtifactIds: [],
      queue: [],
      referenceTitles: {},
    });

    panel.actForTest("expand", { referenceId: "a", direction: "references" });
    panel.actForTest("expand", { referenceId: "a", direction: "citations" });
    panel.actForTest("focus", { referenceId: "b" });
    panel.actForTest("review", { assertionId: "assertion:1", decision: "confirmed" });
    panel.actForTest("review", { assertionId: "assertion:1", decision: "unknown" });
    panel.actForTest("save-candidate", { candidateDoi: "10.5555/c" });
    panel.actForTest("save-all-candidates");
    panel.actForTest("queue", { referenceId: "b", seedReferenceId: "a", direction: "references" });
    panel.actForTest("dequeue", { referenceId: "b" });
    panel.setCandidateSaving("10.5555/c", true);
    panel.actForTest("save-candidate", { candidateDoi: "10.5555/c" });
    panel.actForTest("unknown");

    expect(actions).toEqual([
      { action: "expand", referenceId: "a", direction: "references" },
      { action: "expand", referenceId: "a", direction: "citations" },
      { action: "focus", referenceId: "b" },
      { action: "review", assertionId: "assertion:1", decision: "confirmed" },
      { action: "save-candidate", candidate: expansion.unmatched[0], expansion },
      { action: "save-all-candidates", expansion },
      { action: "queue", referenceId: "b", seedReferenceId: "a", direction: "references" },
      { action: "dequeue", referenceId: "b" },
    ]);
  });

  it("projects a focused source and its immediate relationships", () => {
    const disconnected = { ...network.nodes[1]!, id: "reference:c", referenceId: "c" };
    expect(focusCitationNetwork({ ...network, nodes: [...network.nodes, disconnected] }, "a")).toEqual(network);
    expect(focusCitationNetwork(network, "missing")).toMatchObject({ edges: [], nodes: [] });
    expect(focusCitationNetwork(network, null)).toBe(network);
  });

  it("filters graph and list relationships through the same evidence projection", () => {
    const inferredNeighbor = { ...network.nodes[1]!, id: "reference:c", referenceId: "c", label: "Source C" };
    const mixed: CitationNetwork = {
      ...network,
      nodes: [...network.nodes, inferredNeighbor],
      edges: [...network.edges, { ...network.edges[0]!, id: "edge:2", from: "reference:a", to: inferredNeighbor.id, state: "confirmed" }],
    };
    expect(filterCitationNetwork(mixed, new Set(["confirmed"]), "a")).toMatchObject({
      edges: [{ id: "edge:2" }],
      nodes: [{ id: "reference:a" }, { id: "reference:c" }],
    });
    expect(filterCitationNetwork(mixed, new Set(), "a")).toMatchObject({ edges: [], nodes: [{ id: "reference:a" }] });
    expect(filterCitationNetwork(mixed, new Set(["confirmed", "extracted", "inferred", "conflicting"]), "a")).toBe(mixed);

    const panel = new TestCitationNetworkPanel();
    panel.setData({
      expansion: null,
      filterProject: false,
      focusedReferenceId: "a",
      network: mixed,
      pdfArtifactIds: [],
      queue: [],
      referenceTitles: {},
    });
    panel.toggleEvidenceForTest("confirmed");
    panel.toggleEvidenceForTest("unknown");
    expect(panel.renderForTest()).toBeDefined();
  });

  it("maps PDF assertion locators to their first evidence page", () => {
    expect(citationEvidencePage("PDF mention pages 3, 5 · bibliography page 8 · reference candidate")).toBe(3);
    expect(citationEvidencePage("bibliography page 8 · reference candidate")).toBe(8);
    expect(citationEvidencePage("Crossref response")).toBeNull();
  });

  it("owns reference choices and emits a typed manual assertion", () => {
    const panel = new TestCitationNetworkPanel();
    const actions: CitationNetworkAction[] = [];
    panel.addEventListener(citationNetworkActionEvent, (event) => actions.push((event as CustomEvent<CitationNetworkAction>).detail));
    panel.setReferences([
      { id: "a", title: "Source A" },
      { id: "b", title: "Source B" },
    ]);
    panel.changeSourceForTest("citation-assertion-citing", "a");
    panel.changeSourceForTest("citation-assertion-cited", "b");
    panel.changePolarityForTest("does-not-cite");
    panel.recordForTest();
    expect(actions).toEqual([
      {
        action: "record",
        citedReferenceId: "b",
        citingReferenceId: "a",
        polarity: "does-not-cite",
      },
    ]);
    panel.setReferences([{ id: "b", title: "Source B" }]);
    panel.changePolarityForTest("unknown");
    expect(panel.renderForTest()).toBeDefined();
  });
});

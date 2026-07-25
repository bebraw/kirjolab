import { describe, expect, it } from "vitest";
import type { CitationAssertionView, CitationNetwork } from "../domain/citation-assertions";
import type { CitationExpansionResult } from "../domain/citation-expansion-types";
import { CitationNetworkPanel, citationNetworkActionEvent, type CitationNetworkAction } from "./citation-network-panel";

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
    panel.setData({ expansion: null, filterProject: false, network: { ...network, edges: [], nodes: [] }, referenceTitles: {} });
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({ expansion: null, filterProject: true, network: { ...network, edges: [], nodes: [] }, referenceTitles: {} });
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({ expansion, filterProject: false, network, referenceTitles: { a: "Seed A" } });
    panel.setCandidateSaving("10.5555/c", true);
    expect(panel.renderForTest()).toBeDefined();
    panel.setCandidateSaving("10.5555/c", false);
    panel.setData({
      expansion: { ...expansion, truncated: true, unmatched: [] },
      filterProject: false,
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
      referenceTitles: {},
    });
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits only valid expand, review, and idle candidate intents", () => {
    const panel = new TestCitationNetworkPanel();
    const actions: CitationNetworkAction[] = [];
    panel.addEventListener(citationNetworkActionEvent, (event) => actions.push((event as CustomEvent<CitationNetworkAction>).detail));
    panel.setData({ expansion, filterProject: false, network, referenceTitles: {} });

    panel.actForTest("expand", { referenceId: "a" });
    panel.actForTest("review", { assertionId: "assertion:1", decision: "confirmed" });
    panel.actForTest("review", { assertionId: "assertion:1", decision: "unknown" });
    panel.actForTest("save-candidate", { candidateDoi: "10.5555/c" });
    panel.setCandidateSaving("10.5555/c", true);
    panel.actForTest("save-candidate", { candidateDoi: "10.5555/c" });
    panel.actForTest("unknown");

    expect(actions).toEqual([
      { action: "expand", referenceId: "a" },
      { action: "review", assertionId: "assertion:1", decision: "confirmed" },
      { action: "save-candidate", candidate: expansion.unmatched[0], expansion },
    ]);
  });
});

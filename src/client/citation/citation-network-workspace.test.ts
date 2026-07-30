import { afterEach, describe, expect, it, vi } from "vitest";
import type { CitationNetwork } from "../../domain/citation/citation-assertions";
import type { CitationExpansionResult } from "../../domain/citation/citation-expansion-types";
import {
  citationExpansionAssertion,
  citationExpansionReference,
  citationExpansionResponseId,
  citationExpansionTimestamp,
} from "../../test-support/citation-expansion-fixtures";
import type { CitationNetworkAction } from "./citation-network-panel";
import { CitationNetworkWorkspace, citationNetworkOutcomeEvent, type CitationNetworkOutcome } from "./citation-network-workspace";

const network: CitationNetwork = { edges: [], nodes: [], projectId: null, truncated: false };
const expansion: CitationExpansionResult = {
  assertions: [],
  direction: "references",
  provider: "crossref",
  requestedBy: "researcher@example.com",
  responseId: citationExpansionResponseId,
  retrievedAt: citationExpansionTimestamp,
  seedReferenceId: "source:1",
  sourceLocator: "Crossref",
  truncated: false,
  unmatched: [
    {
      authors: "Ada Author",
      doi: citationExpansionReference.doi,
      title: citationExpansionReference.title,
      unstructured: "",
      year: citationExpansionReference.year,
    },
  ],
};

class TestCitationNetworkWorkspace extends CitationNetworkWorkspace {
  renderForTest() {
    return this.render();
  }

  updateForTest(...properties: string[]): void {
    this.updated(new Map(properties.map((property) => [property, undefined])));
  }

  toggleForTest(): void {
    this.toggleProjectFilter();
  }

  closeForTest(): void {
    this.close();
  }

  actionForTest(action: CitationNetworkAction): Promise<void> {
    return this.handleAction(action);
  }
}

function configuredWorkspace() {
  const workspace = new TestCitationNetworkWorkspace();
  const panel = { setCandidateSaving: vi.fn(), setExpansionSaving: vi.fn(), setData: vi.fn(), setReferences: vi.fn() };
  const scrollIntoView = vi.fn();
  Object.defineProperty(workspace, "querySelector", { value: () => panel });
  Object.defineProperty(workspace, "scrollIntoView", { value: scrollIntoView });
  workspace.configure("workspace-1");
  workspace.setReferences([
    { id: "source:1", title: "Source {1}" },
    { id: "source:2", title: "Source 2" },
  ]);
  return { panel, scrollIntoView, workspace };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status });
}

describe("citation network workspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("owns visibility, network loading, filter requests, and nested presentation", async () => {
    const { panel, scrollIntoView, workspace } = configuredWorkspace();
    const fetchMock = vi.fn((input: string | URL | Request) =>
      String(input).includes("citation-research-queue") ? Promise.resolve(json([])) : Promise.resolve(json(network)),
    );
    vi.stubGlobal("fetch", fetchMock);

    workspace.hidden = true;
    await workspace.open("source:1");
    workspace.updateForTest("references", "data");
    workspace.toggleForTest();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    workspace.closeForTest();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/library/citation-network", { credentials: "same-origin" });
    expect(fetchMock).toHaveBeenCalledWith("/api/library/citation-research-queue", { credentials: "same-origin" });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/library/citation-network?projectId=workspace-1", {
      credentials: "same-origin",
    });
    expect(panel.setReferences).toHaveBeenCalledWith([
      { id: "source:1", title: "Source 1" },
      { id: "source:2", title: "Source 2" },
    ]);
    expect(panel.setData).toHaveBeenCalled();
    expect(panel.setData).toHaveBeenCalledWith(expect.objectContaining({ focusedReferenceId: "source:1" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(workspace.hidden).toBe(true);
    expect(workspace.renderForTest()).toBeDefined();
  });

  it("owns manual assertion, review, and expansion requests", async () => {
    const { scrollIntoView, workspace } = configuredWorkspace();
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/citation-expansions")) return Promise.resolve(json(expansion));
      if (url.includes("/citation-network")) return Promise.resolve(json(network));
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { prompt: vi.fn().mockReturnValue("Reviewed") });
    const outcomes: CitationNetworkOutcome[] = [];
    workspace.addEventListener(citationNetworkOutcomeEvent, (event) =>
      outcomes.push((event as CustomEvent<CitationNetworkOutcome>).detail),
    );

    await workspace.actionForTest({ action: "record", citedReferenceId: "source:2", citingReferenceId: "source:1", polarity: "cites" });
    await workspace.actionForTest({ action: "review", assertionId: "assertion:1", decision: "confirmed" });
    await workspace.actionForTest({ action: "expand", referenceId: "source:1", direction: "references" });
    await workspace.actionForTest({ action: "focus", referenceId: "source:2" });

    expect(outcomes).toEqual([
      { action: "notice", message: "Citation assertion recorded with researcher provenance." },
      { action: "notice", message: "Citation assertion confirmed." },
      { action: "notice", message: "Review 1 new reference from this seed." },
      { action: "route", referenceId: "source:2" },
    ]);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/citation-assertions/assertion%3A1/review",
      expect.objectContaining({ body: JSON.stringify({ decision: "confirmed", note: "Reviewed" }) }),
    );
  });

  it("owns candidate acceptance and emits a canonical Library refresh outcome", async () => {
    const { panel, workspace } = configuredWorkspace();
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/citation-network")) return Promise.resolve(json(network));
      return Promise.resolve(json({ assertion: citationExpansionAssertion, created: true, reference: citationExpansionReference }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const outcomes: CitationNetworkOutcome[] = [];
    workspace.addEventListener(citationNetworkOutcomeEvent, (event) =>
      outcomes.push((event as CustomEvent<CitationNetworkOutcome>).detail),
    );

    await workspace.actionForTest({ action: "save-candidate", candidate: expansion.unmatched[0]!, expansion });

    expect(panel.setCandidateSaving).toHaveBeenCalledWith(citationExpansionReference.doi, true);
    expect(outcomes).toEqual([{ action: "library-refresh", message: "Reference saved with its discovery trail." }]);
    expect(fetchMock).toHaveBeenCalledWith("/api/library/references/source%3A1/citation-candidates", {
      body: JSON.stringify({ doi: citationExpansionReference.doi, responseId: citationExpansionResponseId, direction: "references" }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });

  it("accepts a bounded candidate batch and reports created and reused references", async () => {
    const { panel, workspace } = configuredWorkspace();
    const reused = { ...citationExpansionReference, id: "reference:reused", doi: "10.5555/reused" };
    const batchExpansion = {
      ...expansion,
      unmatched: [...expansion.unmatched, { ...expansion.unmatched[0]!, doi: reused.doi, title: reused.title }],
    };
    const fetchMock = vi.fn((input: string | URL | Request) =>
      String(input).includes("/citation-network")
        ? Promise.resolve(json(network))
        : Promise.resolve(
            json({
              accepted: [
                { assertion: citationExpansionAssertion, created: true, reference: citationExpansionReference },
                {
                  assertion: { ...citationExpansionAssertion, id: "assertion:reused", citedReferenceId: reused.id },
                  created: false,
                  reference: reused,
                },
              ],
            }),
          ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const outcomes: CitationNetworkOutcome[] = [];
    workspace.addEventListener(citationNetworkOutcomeEvent, (event) =>
      outcomes.push((event as CustomEvent<CitationNetworkOutcome>).detail),
    );

    await workspace.actionForTest({ action: "save-all-candidates", expansion: batchExpansion });

    expect(panel.setExpansionSaving).toHaveBeenNthCalledWith(1, true);
    expect(panel.setExpansionSaving).toHaveBeenLastCalledWith(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/library/references/source%3A1/citation-candidates", {
      body: JSON.stringify({
        dois: [citationExpansionReference.doi, reused.doi],
        responseId: citationExpansionResponseId,
        direction: "references",
      }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(outcomes).toEqual([
      { action: "library-refresh", message: "Saved 1 new and reused 1 existing references with their discovery trails." },
    ]);
  });

  it("requests a validated forward-citation round", async () => {
    const { workspace } = configuredWorkspace();
    const forwardExpansion = { ...expansion, provider: "semantic-scholar" as const, direction: "citations" as const };
    const fetchMock = vi.fn((input: string | URL | Request) =>
      String(input).includes("/citation-network") ? Promise.resolve(json(network)) : Promise.resolve(json(forwardExpansion)),
    );
    vi.stubGlobal("fetch", fetchMock);

    await workspace.actionForTest({ action: "expand", referenceId: "source:1", direction: "citations" });

    expect(fetchMock).toHaveBeenCalledWith("/api/library/references/source%3A1/citation-expansions", {
      body: JSON.stringify({ direction: "citations" }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });

  it("queues and removes promising trail references", async () => {
    const { workspace } = configuredWorkspace();
    const item = {
      referenceId: "source:2",
      seedReferenceId: "source:1",
      direction: "references" as const,
      addedAt: citationExpansionTimestamp,
    };
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("citation-research-queue")) return Promise.resolve(json([item]));
      if (init?.method === "DELETE") return Promise.resolve(json(item));
      return Promise.resolve(json(item, 201));
    });
    vi.stubGlobal("fetch", fetchMock);
    const outcomes: CitationNetworkOutcome[] = [];
    workspace.addEventListener(citationNetworkOutcomeEvent, (event) =>
      outcomes.push((event as CustomEvent<CitationNetworkOutcome>).detail),
    );

    await workspace.actionForTest({
      action: "queue",
      referenceId: item.referenceId,
      seedReferenceId: item.seedReferenceId,
      direction: item.direction,
    });
    await workspace.actionForTest({ action: "dequeue", referenceId: item.referenceId });

    expect(fetchMock).toHaveBeenCalledWith("/api/library/references/source%3A2/research-queue", {
      body: JSON.stringify({ seedReferenceId: "source:1", direction: "references" }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/library/references/source%3A2/research-queue", {
      credentials: "same-origin",
      method: "DELETE",
    });
    expect(outcomes).toEqual([
      { action: "notice", message: "Reference queued for this research trail." },
      { action: "notice", message: "Reference removed from the research queue." },
    ]);
  });

  it("reports invalid selections, provider errors, and malformed responses", async () => {
    const { workspace } = configuredWorkspace();
    const outcomes: CitationNetworkOutcome[] = [];
    workspace.addEventListener(citationNetworkOutcomeEvent, (event) =>
      outcomes.push((event as CustomEvent<CitationNetworkOutcome>).detail),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ invalid: true }))
      .mockResolvedValueOnce(json({ error: "Provider unavailable" }, 503))
      .mockResolvedValueOnce(json({ invalid: true }));
    vi.stubGlobal("fetch", fetchMock);

    await workspace.refresh();
    await workspace.actionForTest({ action: "record", citedReferenceId: "source:1", citingReferenceId: "source:1", polarity: "cites" });
    await workspace.actionForTest({ action: "expand", referenceId: "source:1", direction: "references" });
    await workspace.actionForTest({ action: "save-candidate", candidate: expansion.unmatched[0]!, expansion });

    expect(outcomes).toEqual([
      { action: "notice", message: "Choose two different sources for the citation assertion." },
      { action: "notice", message: "Provider unavailable" },
      { action: "notice", message: "Citation candidate returned an invalid representation" },
    ]);
    expect(workspace.renderForTest()).toBeDefined();
  });

  it("rejects a delayed network after the project filter changes", async () => {
    const { panel, workspace } = configuredWorkspace();
    let resolveFirst = (_response: Response): void => undefined;
    let resolveSecond = (_response: Response): void => undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(firstResponse).mockReturnValueOnce(secondResponse));

    const firstRefresh = workspace.refresh();
    workspace.filterProject = true;
    const secondRefresh = workspace.refresh();
    resolveSecond(json({ ...network, projectId: "workspace-1" }));
    await secondRefresh;
    workspace.updateForTest("data");
    resolveFirst(json(network));
    await firstRefresh;

    expect(panel.setData).toHaveBeenLastCalledWith(
      expect.objectContaining({ network: expect.objectContaining({ projectId: "workspace-1" }) }),
    );
  });
});

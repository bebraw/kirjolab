import { afterEach, describe, expect, it, vi } from "vitest";
import type { CitationNetwork } from "../domain/citation-assertions";
import type { CitationExpansionResult } from "../domain/citation-expansion-types";
import {
  citationExpansionAssertion,
  citationExpansionReference,
  citationExpansionResponseId,
  citationExpansionTimestamp,
} from "../test-support/citation-expansion-fixtures";
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
  const panel = { setCandidateSaving: vi.fn(), setData: vi.fn(), setReferences: vi.fn() };
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
    const fetchMock = vi.fn().mockResolvedValue(json(network));
    vi.stubGlobal("fetch", fetchMock);

    workspace.hidden = true;
    await workspace.open("source:1");
    workspace.updateForTest("references", "data");
    workspace.toggleForTest();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    workspace.closeForTest();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/library/citation-network", { credentials: "same-origin" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/library/citation-network?projectId=workspace-1", {
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
    const { workspace } = configuredWorkspace();
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
    await workspace.actionForTest({ action: "expand", referenceId: "source:1" });

    expect(outcomes).toEqual([
      { action: "notice", message: "Citation assertion recorded with researcher provenance." },
      { action: "notice", message: "Citation assertion confirmed." },
      { action: "notice", message: "Review 1 new reference from this seed." },
    ]);
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
      body: JSON.stringify({ doi: citationExpansionReference.doi, responseId: citationExpansionResponseId }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
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
    await workspace.actionForTest({ action: "expand", referenceId: "source:1" });
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

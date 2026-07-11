import { describe, expect, it } from "vitest";
import {
  activateResearchTab,
  closeResearchTab,
  createResearchContext,
  openResearchResource,
  RESEARCH_PREVIEW_KEY,
  reconcileResearchContext,
  researchResourceKey,
  setPdfResearchLocation,
  setResearchTabPinned,
  setResearchTabScroll,
} from "./research-context";

describe("research context", () => {
  it("starts with a permanent, active Preview tab", () => {
    expect(createResearchContext()).toEqual({
      activeKey: RESEARCH_PREVIEW_KEY,
      tabs: [{ kind: "preview", key: RESEARCH_PREVIEW_KEY, scrollTop: 0 }],
    });
    expect(researchResourceKey({ kind: "publication", id: "pub:1" })).toBe("publication:pub:1");
  });

  it("uses one replaceable resource slot until a tab is pinned", () => {
    const initial = createResearchContext();
    const pdf = openResearchResource(initial, { kind: "pdf", id: "pdf-1" });
    const publication = openResearchResource(pdf, { kind: "publication", id: "publication-1" });

    expect(initial.tabs).toHaveLength(1);
    expect(pdf).toEqual({
      activeKey: "pdf:pdf-1",
      tabs: [
        initial.tabs[0],
        {
          kind: "pdf",
          id: "pdf-1",
          key: "pdf:pdf-1",
          pinned: false,
          scrollTop: 0,
          page: 1,
          focusedAnnotationId: null,
        },
      ],
    });
    expect(publication.tabs.map((tab) => tab.key)).toEqual(["preview", "publication:publication-1"]);
    expect(publication.activeKey).toBe("publication:publication-1");
  });

  it("keeps pinned tabs in stable keyboard order before the replaceable slot", () => {
    let state = openResearchResource(createResearchContext(), { kind: "pdf", id: "pdf-1" });
    state = setResearchTabPinned(state, "pdf:pdf-1", true);
    state = openResearchResource(state, { kind: "publication", id: "publication-1" });
    state = setResearchTabPinned(state, "publication:publication-1", true);
    state = openResearchResource(state, { kind: "pdf", id: "pdf-2" });

    expect(state.tabs.map((tab) => tab.key)).toEqual(["preview", "pdf:pdf-1", "publication:publication-1", "pdf:pdf-2"]);
    expect(state.tabs.filter((tab) => tab.kind !== "preview" && !tab.pinned)).toHaveLength(1);
  });

  it("activates an existing tab without resetting its reading state", () => {
    let state = openResearchResource(createResearchContext(), { kind: "pdf", id: "pdf-1" });
    state = setPdfResearchLocation(state, "pdf:pdf-1", { page: 7, focusedAnnotationId: "annotation-1" });
    state = setResearchTabScroll(state, "pdf:pdf-1", 128.5);
    state = setResearchTabPinned(state, "pdf:pdf-1", true);
    state = openResearchResource(state, { kind: "publication", id: "publication-1" });

    const reopened = openResearchResource(state, { kind: "pdf", id: "pdf-1" });
    const unchanged = openResearchResource(reopened, { kind: "pdf", id: "pdf-1" });

    expect(reopened.activeKey).toBe("pdf:pdf-1");
    expect(reopened.tabs.find((tab) => tab.key === "pdf:pdf-1")).toMatchObject({
      page: 7,
      focusedAnnotationId: "annotation-1",
      scrollTop: 128.5,
      pinned: true,
    });
    expect(unchanged).toBe(reopened);
  });

  it("unpinning makes that tab the replaceable slot and discards the old slot", () => {
    let state = openResearchResource(createResearchContext(), { kind: "pdf", id: "pinned" });
    state = setResearchTabPinned(state, "pdf:pinned", true);
    state = openResearchResource(state, { kind: "publication", id: "replaceable" });

    const unpinned = setResearchTabPinned(state, "pdf:pinned", false);

    expect(unpinned.activeKey).toBe("pdf:pinned");
    expect(unpinned.tabs.map((tab) => tab.key)).toEqual(["preview", "pdf:pinned"]);
    expect(unpinned.tabs[1]).toMatchObject({ pinned: false });
  });

  it("unpins without stealing focus when another retained tab is active", () => {
    let state = openResearchResource(createResearchContext(), { kind: "pdf", id: "first" });
    state = setResearchTabPinned(state, "pdf:first", true);
    state = openResearchResource(state, { kind: "publication", id: "second" });
    state = setResearchTabPinned(state, "publication:second", true);
    state = activateResearchTab(state, "pdf:first");

    const unpinned = setResearchTabPinned(state, "publication:second", false);

    expect(unpinned.activeKey).toBe("pdf:first");
    expect(unpinned.tabs.map((tab) => tab.key)).toEqual(["preview", "pdf:first", "publication:second"]);
  });

  it("closes resource tabs and selects their previous keyboard neighbor", () => {
    let state = openResearchResource(createResearchContext(), { kind: "pdf", id: "first" });
    state = setResearchTabPinned(state, "pdf:first", true);
    state = openResearchResource(state, { kind: "publication", id: "second" });
    const activeClosed = closeResearchTab(state, "publication:second");

    expect(activeClosed.activeKey).toBe("pdf:first");
    expect(activeClosed.tabs.map((tab) => tab.key)).toEqual(["preview", "pdf:first"]);

    const firstResourceClosed = closeResearchTab(activeClosed, "pdf:first");
    expect(firstResourceClosed.activeKey).toBe("preview");
    expect(firstResourceClosed.tabs.map((tab) => tab.key)).toEqual(["preview"]);

    const inactiveClosed = closeResearchTab(activateResearchTab(activeClosed, "preview"), "pdf:first");
    expect(inactiveClosed.activeKey).toBe("preview");
    expect(inactiveClosed.tabs.map((tab) => tab.key)).toEqual(["preview"]);
    expect(closeResearchTab(inactiveClosed, "preview")).toBe(inactiveClosed);
    expect(closeResearchTab(inactiveClosed, "pdf:missing")).toBe(inactiveClosed);
  });

  it("activates only tabs in the current keyboard order", () => {
    const state = openResearchResource(createResearchContext(), { kind: "pdf", id: "pdf-1" });
    const preview = activateResearchTab(state, "preview");

    expect(preview.activeKey).toBe("preview");
    expect(activateResearchTab(preview, "preview")).toBe(preview);
    expect(activateResearchTab(preview, "pdf:missing")).toBe(preview);
  });

  it("stores normalized scroll and PDF reading location without mutating prior state", () => {
    const initial = openResearchResource(createResearchContext(), { kind: "pdf", id: "pdf-1" });
    const located = setPdfResearchLocation(initial, "pdf:pdf-1", {
      page: 4.9,
      focusedAnnotationId: "annotation-1",
    });
    const cleared = setPdfResearchLocation(located, "pdf:pdf-1", { focusedAnnotationId: null });
    const resetPage = setPdfResearchLocation(cleared, "pdf:pdf-1", { page: Number.NaN });
    const scrolled = setResearchTabScroll(resetPage, "preview", -12);
    const nonFiniteScroll = setResearchTabScroll(scrolled, "pdf:pdf-1", Number.POSITIVE_INFINITY);

    expect(initial.tabs[1]).toMatchObject({ page: 1, focusedAnnotationId: null });
    expect(located.tabs[1]).toMatchObject({ page: 4, focusedAnnotationId: "annotation-1" });
    expect(cleared.tabs[1]).toMatchObject({ page: 4, focusedAnnotationId: null });
    expect(resetPage.tabs[1]).toMatchObject({ page: 1, focusedAnnotationId: null });
    expect(nonFiniteScroll.tabs[1]).toMatchObject({ scrollTop: 0 });
    expect(setPdfResearchLocation(located, "pdf:pdf-1", { page: 4.2 })).toBe(located);
    expect(setPdfResearchLocation(located, "publication:missing", { page: 2 })).toBe(located);
    expect(setResearchTabScroll(scrolled, "preview", 0)).toBe(scrolled);
    expect(setResearchTabScroll(scrolled, "missing", 2)).toBe(scrolled);
  });

  it("ignores pin requests that cannot change resource state", () => {
    const state = openResearchResource(createResearchContext(), { kind: "publication", id: "publication-1" });
    expect(setResearchTabPinned(state, "preview", true)).toBe(state);
    expect(setResearchTabPinned(state, "publication:publication-1", false)).toBe(state);
    expect(setResearchTabPinned(state, "publication:missing", true)).toBe(state);
  });

  it("reconciles tabs against the currently authorized resource ids", () => {
    let state = openResearchResource(createResearchContext(), { kind: "publication", id: "allowed-publication" });
    state = setResearchTabPinned(state, "publication:allowed-publication", true);
    state = openResearchResource(state, { kind: "pdf", id: "revoked-pdf" });

    const reconciled = reconcileResearchContext(state, {
      publicationIds: new Set(["allowed-publication"]),
      pdfIds: new Set(),
    });

    expect(reconciled.activeKey).toBe("preview");
    expect(reconciled.tabs.map((tab) => tab.key)).toEqual(["preview", "publication:allowed-publication"]);
    expect(
      reconcileResearchContext(reconciled, {
        publicationIds: new Set(["allowed-publication"]),
        pdfIds: new Set(),
      }),
    ).toBe(reconciled);
  });

  it("keeps an authorized active resource while dropping other revoked tabs", () => {
    let state = openResearchResource(createResearchContext(), { kind: "pdf", id: "allowed-pdf" });
    state = setResearchTabPinned(state, "pdf:allowed-pdf", true);
    state = openResearchResource(state, { kind: "publication", id: "revoked-publication" });
    state = activateResearchTab(state, "pdf:allowed-pdf");

    const reconciled = reconcileResearchContext(state, {
      publicationIds: new Set(),
      pdfIds: new Set(["allowed-pdf"]),
    });

    expect(reconciled.activeKey).toBe("pdf:allowed-pdf");
    expect(reconciled.tabs.map((tab) => tab.key)).toEqual(["preview", "pdf:allowed-pdf"]);
  });
});

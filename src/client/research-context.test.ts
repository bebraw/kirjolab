import { describe, expect, it } from "vitest";
import {
  activateResearchTab,
  closeResearchTab,
  createResearchContext,
  openResearchResource,
  RESEARCH_LIBRARY_KEY,
  RESEARCH_PREVIEW_KEY,
  reconcileResearchContext,
  researchResourceKey,
  setPdfResearchLocation,
  setResearchTabPinned,
  setResearchTabScroll,
} from "./research-context";

describe("research context", () => {
  it("starts with permanent Preview and Library tabs", () => {
    expect(createResearchContext()).toEqual({
      activeKey: RESEARCH_PREVIEW_KEY,
      tabs: [
        { kind: "preview", key: RESEARCH_PREVIEW_KEY, scrollTop: 0 },
        { kind: "library", key: RESEARCH_LIBRARY_KEY, scrollTop: 0 },
      ],
    });
    expect(researchResourceKey({ kind: "publication", id: "pub:1" })).toBe("publication:pub:1");
    expect(researchResourceKey({ kind: "candidate", id: "candidate:1" })).toBe("candidate:candidate:1");
  });

  it("uses one replaceable resource slot until a tab is pinned", () => {
    const initial = createResearchContext();
    const pdf = openResearchResource(initial, { kind: "pdf", id: "pdf-1" });
    const publication = openResearchResource(pdf, { kind: "publication", id: "publication-1" });

    expect(initial.tabs).toHaveLength(2);
    expect(pdf).toEqual({
      activeKey: "pdf:pdf-1",
      tabs: [
        ...initial.tabs,
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
    expect(publication.tabs.map((tab) => tab.key)).toEqual(["preview", "library", "publication:publication-1"]);
    expect(publication.activeKey).toBe("publication:publication-1");
  });

  it("keeps pinned tabs in stable keyboard order before the replaceable slot", () => {
    let state = openResearchResource(createResearchContext(), { kind: "pdf", id: "pdf-1" });
    state = setResearchTabPinned(state, "pdf:pdf-1", true);
    state = openResearchResource(state, { kind: "publication", id: "publication-1" });
    state = setResearchTabPinned(state, "publication:publication-1", true);
    state = openResearchResource(state, { kind: "pdf", id: "pdf-2" });

    expect(state.tabs.map((tab) => tab.key)).toEqual(["preview", "library", "pdf:pdf-1", "publication:publication-1", "pdf:pdf-2"]);
    expect(state.tabs.filter((tab) => tab.kind !== "preview" && tab.kind !== "library" && !tab.pinned)).toHaveLength(1);
  });

  it("opens, deduplicates, scrolls, and pins candidate tabs like ordinary resources", () => {
    const initial = createResearchContext();
    const opened = openResearchResource(initial, { kind: "candidate", id: "candidate-1" });
    const duplicate = openResearchResource(opened, { kind: "candidate", id: "candidate-1" });
    const scrolled = setResearchTabScroll(opened, "candidate:candidate-1", 72.5);
    const pinned = setResearchTabPinned(scrolled, "candidate:candidate-1", true);
    const followed = openResearchResource(pinned, { kind: "publication", id: "publication-1" });
    const reopened = openResearchResource(followed, { kind: "candidate", id: "candidate-1" });

    expect(opened).toEqual({
      activeKey: "candidate:candidate-1",
      tabs: [
        ...initial.tabs,
        {
          kind: "candidate",
          id: "candidate-1",
          key: "candidate:candidate-1",
          pinned: false,
          scrollTop: 0,
        },
      ],
    });
    expect(duplicate).toBe(opened);
    expect(followed.tabs.map((tab) => tab.key)).toEqual(["preview", "library", "candidate:candidate-1", "publication:publication-1"]);
    expect(reopened.tabs.find((tab) => tab.key === "candidate:candidate-1")).toMatchObject({ pinned: true, scrollTop: 72.5 });
  });

  it("keeps resource kinds distinct and lets candidate tabs own the replaceable slot", () => {
    let state = openResearchResource(createResearchContext(), { kind: "pdf", id: "shared" });
    state = setResearchTabPinned(state, "pdf:shared", true);
    state = openResearchResource(state, { kind: "publication", id: "shared" });
    state = setResearchTabPinned(state, "publication:shared", true);
    state = openResearchResource(state, { kind: "candidate", id: "shared" });

    expect(state.tabs.map((tab) => tab.key)).toEqual(["preview", "library", "pdf:shared", "publication:shared", "candidate:shared"]);

    const replaced = openResearchResource(state, { kind: "publication", id: "replacement" });
    expect(replaced.tabs.map((tab) => tab.key)).toEqual([
      "preview",
      "library",
      "pdf:shared",
      "publication:shared",
      "publication:replacement",
    ]);
    expect(replaced.tabs.some((tab) => tab.key === "candidate:shared")).toBe(false);
  });

  it("closes candidate tabs using the same previous-neighbor rule", () => {
    let state = openResearchResource(createResearchContext(), { kind: "pdf", id: "first" });
    state = setResearchTabPinned(state, "pdf:first", true);
    state = openResearchResource(state, { kind: "candidate", id: "candidate-1" });

    const closed = closeResearchTab(state, "candidate:candidate-1");

    expect(closed.activeKey).toBe("pdf:first");
    expect(closed.tabs.map((tab) => tab.key)).toEqual(["preview", "library", "pdf:first"]);
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
    expect(unpinned.tabs.map((tab) => tab.key)).toEqual(["preview", "library", "pdf:pinned"]);
    expect(unpinned.tabs[2]).toMatchObject({ pinned: false });
  });

  it("unpins without stealing focus when another retained tab is active", () => {
    let state = openResearchResource(createResearchContext(), { kind: "pdf", id: "first" });
    state = setResearchTabPinned(state, "pdf:first", true);
    state = openResearchResource(state, { kind: "publication", id: "second" });
    state = setResearchTabPinned(state, "publication:second", true);
    state = activateResearchTab(state, "pdf:first");

    const unpinned = setResearchTabPinned(state, "publication:second", false);

    expect(unpinned.activeKey).toBe("pdf:first");
    expect(unpinned.tabs.map((tab) => tab.key)).toEqual(["preview", "library", "pdf:first", "publication:second"]);
  });

  it("closes resource tabs and selects their previous keyboard neighbor", () => {
    let state = openResearchResource(createResearchContext(), { kind: "pdf", id: "first" });
    state = setResearchTabPinned(state, "pdf:first", true);
    state = openResearchResource(state, { kind: "publication", id: "second" });
    const activeClosed = closeResearchTab(state, "publication:second");

    expect(activeClosed.activeKey).toBe("pdf:first");
    expect(activeClosed.tabs.map((tab) => tab.key)).toEqual(["preview", "library", "pdf:first"]);

    const firstResourceClosed = closeResearchTab(activeClosed, "pdf:first");
    expect(firstResourceClosed.activeKey).toBe("library");
    expect(firstResourceClosed.tabs.map((tab) => tab.key)).toEqual(["preview", "library"]);

    const inactiveClosed = closeResearchTab(activateResearchTab(activeClosed, "preview"), "pdf:first");
    expect(inactiveClosed.activeKey).toBe("preview");
    expect(inactiveClosed.tabs.map((tab) => tab.key)).toEqual(["preview", "library"]);
    expect(closeResearchTab(inactiveClosed, "preview")).toBe(inactiveClosed);
    expect(closeResearchTab(inactiveClosed, "library")).toBe(inactiveClosed);
    expect(closeResearchTab(inactiveClosed, "pdf:missing")).toBe(inactiveClosed);
  });

  it("activates only tabs in the current keyboard order", () => {
    const state = openResearchResource(createResearchContext(), { kind: "pdf", id: "pdf-1" });
    const preview = activateResearchTab(state, "preview");

    expect(preview.activeKey).toBe("preview");
    expect(activateResearchTab(preview, "preview")).toBe(preview);
    expect(activateResearchTab(preview, "library").activeKey).toBe("library");
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

    expect(initial.tabs[2]).toMatchObject({ page: 1, focusedAnnotationId: null });
    expect(located.tabs[2]).toMatchObject({ page: 4, focusedAnnotationId: "annotation-1" });
    expect(cleared.tabs[2]).toMatchObject({ page: 4, focusedAnnotationId: null });
    expect(resetPage.tabs[2]).toMatchObject({ page: 1, focusedAnnotationId: null });
    expect(nonFiniteScroll.tabs[2]).toMatchObject({ scrollTop: 0 });
    expect(setPdfResearchLocation(located, "pdf:pdf-1", { page: 4.2 })).toBe(located);
    expect(setPdfResearchLocation(located, "publication:missing", { page: 2 })).toBe(located);
    expect(setResearchTabScroll(scrolled, "preview", 0)).toBe(scrolled);
    expect(setResearchTabScroll(scrolled, "missing", 2)).toBe(scrolled);
  });

  it("ignores pin requests that cannot change resource state", () => {
    const state = openResearchResource(createResearchContext(), { kind: "publication", id: "publication-1" });
    expect(setResearchTabPinned(state, "preview", true)).toBe(state);
    expect(setResearchTabPinned(state, "library", true)).toBe(state);
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
      candidateIds: new Set(),
    });

    expect(reconciled.activeKey).toBe("preview");
    expect(reconciled.tabs.map((tab) => tab.key)).toEqual(["preview", "library", "publication:allowed-publication"]);
    expect(
      reconcileResearchContext(reconciled, {
        publicationIds: new Set(["allowed-publication"]),
        pdfIds: new Set(),
        candidateIds: new Set(),
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
      candidateIds: new Set(),
    });

    expect(reconciled.activeKey).toBe("pdf:allowed-pdf");
    expect(reconciled.tabs.map((tab) => tab.key)).toEqual(["preview", "library", "pdf:allowed-pdf"]);
  });

  it("reconciles candidate tabs against their own authorized ids", () => {
    let state = openResearchResource(createResearchContext(), { kind: "candidate", id: "allowed-candidate" });
    state = setResearchTabPinned(state, "candidate:allowed-candidate", true);
    state = openResearchResource(state, { kind: "candidate", id: "revoked-candidate" });

    const activeRevoked = reconcileResearchContext(state, {
      publicationIds: new Set(),
      pdfIds: new Set(),
      candidateIds: new Set(["allowed-candidate"]),
    });

    expect(activeRevoked.activeKey).toBe("preview");
    expect(activeRevoked.tabs.map((tab) => tab.key)).toEqual(["preview", "library", "candidate:allowed-candidate"]);

    const activeAllowed = reconcileResearchContext(activateResearchTab(state, "candidate:allowed-candidate"), {
      publicationIds: new Set(),
      pdfIds: new Set(),
      candidateIds: new Set(["allowed-candidate"]),
    });
    expect(activeAllowed.activeKey).toBe("candidate:allowed-candidate");
    expect(activeAllowed.tabs.map((tab) => tab.key)).toEqual(["preview", "library", "candidate:allowed-candidate"]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnnotationResource, ClaimEvidenceLink, ClaimPassageLink, ClaimResource, ManuscriptAnchorSelector } from "../domain/workspace";
import { ClaimListPanel, claimListActionEvent, type ClaimListAction } from "./claim-list-panel";

const createdAt = "2026-07-25T00:00:00.000Z";
const anchor: ManuscriptAnchorSelector = {
  anchoredRevision: 1,
  exact: "Original passage",
  fileId: "main",
  originalRange: { end: 16, start: 0 },
  prefix: "",
  relativeEnd: "AQ",
  relativeStart: "AA",
  suffix: "",
  version: 1,
};
const annotation: AnnotationResource = {
  comment: "Supports the claim",
  createdAt,
  fragments: [],
  id: "annotation:1",
  page: 2,
  pdfId: "pdf:1",
  prefix: "",
  quote: "Evidence",
  rects: [],
  suffix: "",
  updatedAt: createdAt,
};
const claim: ClaimResource = { createdAt, id: "claim:1", note: "Working note", text: "Grounded claim", updatedAt: createdAt };
const evidenceLink: ClaimEvidenceLink = {
  annotationId: annotation.id,
  claimId: claim.id,
  createdAt,
  id: "claim-evidence:1",
  relation: "supports",
};
const passageLink: ClaimPassageLink = {
  anchor,
  claimId: claim.id,
  createdAt,
  id: "claim-passage:1",
  resolution: { end: 16, exactMatch: true, start: 0, status: "resolved", text: anchor.exact },
};

class TestClaimListPanel extends ClaimListPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  evidenceForTest(key?: string, checked = true): void {
    this.selectEvidence(eventWithTarget(key ? { checked, dataset: { modelEvidenceKey: key } } : { checked, dataset: {} }));
  }

  createForTest(): void {
    this.createClaim();
  }

  claimForTest(action?: string, claimId = claim.id): void {
    this.actOnClaim(eventWithTarget({ dataset: { claimAction: action, claimId } }));
  }

  annotationForTest(annotationId?: string): void {
    this.openAnnotation(eventWithTarget({ dataset: annotationId ? { annotationId } : {} }));
  }

  passageForTest(claimId = claim.id): void {
    this.openPassage(eventWithTarget({ dataset: { claimId } }));
  }

  deleteForTest(value: ClaimResource = claim): Promise<void> {
    return this.deleteClaim(value);
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("claim list panel", () => {
  it("renders empty and populated claim states", () => {
    const panel = new TestClaimListPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setClaims({
      annotations: [annotation],
      claims: [claim, { ...claim, id: "claim:2", note: "" }],
      evidenceLinks: [evidenceLink, { ...evidenceLink, annotationId: "missing", claimId: "claim:2", id: "claim-evidence:2" }],
      passageLinks: [passageLink],
      selectedEvidenceKeys: new Set(["claim:1"]),
    });
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("opens and focuses its first grounding choice", () => {
    const panel = new TestClaimListPanel();
    const calls: string[] = [];
    Object.defineProperty(panel, "querySelector", {
      value: () => ({
        closest: () => ({ setAttribute: () => calls.push("open") }),
        focus: () => calls.push("focus"),
        scrollIntoView: () => calls.push("scroll"),
      }),
    });

    expect(panel.focusEvidence()).toBe(true);
    expect(calls).toEqual(["open", "scroll", "focus"]);
  });

  it("emits bounded claim and navigation intents", () => {
    const panel = new TestClaimListPanel();
    const actions: ClaimListAction[] = [];
    panel.addEventListener(claimListActionEvent, (event) => actions.push((event as CustomEvent<ClaimListAction>).detail));
    panel.setClaims({
      annotations: [annotation],
      claims: [claim],
      evidenceLinks: [evidenceLink],
      passageLinks: [passageLink],
      selectedEvidenceKeys: new Set(),
    });

    panel.createForTest();
    panel.evidenceForTest();
    panel.evidenceForTest("claim:1", false);
    panel.claimForTest("missing");
    panel.claimForTest("edit", "missing");
    panel.claimForTest("edit");
    panel.claimForTest("link-passage");
    panel.annotationForTest();
    panel.annotationForTest(annotation.id);
    panel.passageForTest("missing");
    panel.passageForTest();
    const changedAnchor = { ...anchor, exact: "Changed passage" };
    panel.setPassageLinks([{ ...passageLink, anchor: changedAnchor }]);
    panel.passageForTest();

    expect(actions).toEqual([
      { action: "create" },
      { action: "evidence", key: "claim:1", selected: false },
      { action: "edit", claim },
      { action: "link-passage", claimId: claim.id },
      { action: "open-annotation", annotationId: annotation.id },
      { action: "open-passage", anchor },
      { action: "open-passage", anchor: changedAnchor },
    ]);
  });

  it("owns confirmed deletion persistence and emits the completed outcome", async () => {
    const panel = new TestClaimListPanel();
    const actions: ClaimListAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    panel.configure("/api/workspaces/workspace");
    panel.addEventListener(claimListActionEvent, (event) => actions.push((event as CustomEvent<ClaimListAction>).detail));

    await panel.deleteForTest({ ...claim, id: "claim/1" });

    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/workspace/claims/claim%2F1", expect.objectContaining({ method: "DELETE" }));
    expect(actions).toEqual([{ action: "mutated", message: "Claim removed; source evidence remains intact." }]);
  });

  it("owns passage-link persistence and emits the completed outcome", async () => {
    const panel = new TestClaimListPanel();
    const actions: ClaimListAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    panel.addEventListener(claimListActionEvent, (event) => actions.push((event as CustomEvent<ClaimListAction>).detail));
    const input = {
      claimId: "claim/1",
      fileId: "main",
      start: 0,
      end: 16,
      excerpt: "Selected passage",
      sourceRevision: 4,
    };

    await panel.linkPassage(input);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/workspace/claim-links",
      expect.objectContaining({ body: JSON.stringify(input), method: "POST" }),
    );
    expect(actions).toEqual([{ action: "mutated", message: "Claim linked to the selected manuscript passage." }]);
  });

  it("keeps failed passage linking local and retryable", async () => {
    const panel = new TestClaimListPanel();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "Denied" }, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    const input = { claimId: "claim-1", fileId: "main", start: 0, end: 16, excerpt: "Selected passage", sourceRevision: 4 };

    await panel.linkPassage(input);
    expect(panel.renderForTest()).toBeDefined();
    await panel.linkPassage(input);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors cancellation and permits retry after a provider failure", async () => {
    const panel = new TestClaimListPanel();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);
    panel.configure("/api/workspaces/workspace");

    await panel.deleteForTest();
    expect(fetchMock).not.toHaveBeenCalled();
    confirmMock.mockReturnValue(true);
    await panel.deleteForTest();
    expect(panel.renderForTest()).toBeDefined();
    await panel.deleteForTest();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores duplicate deletions while one is pending", async () => {
    const panel = new TestClaimListPanel();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);
    panel.configure("/api/workspaces/workspace");

    const first = panel.deleteForTest();
    await panel.deleteForTest();
    respond(new Response(null, { status: 200 }));
    await first;

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

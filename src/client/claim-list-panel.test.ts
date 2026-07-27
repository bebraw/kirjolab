import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnnotationResource, ClaimEvidenceLink, ClaimPassageLink, ClaimResource, ManuscriptAnchorSelector } from "../domain/workspace";
import { ClaimDialog } from "./claim-dialog";
import { ClaimListPanel } from "./claim-list-panel";

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
  protected override performUpdate(): void {}

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

  savedForTest(message: string): void {
    this.claimSaved(new CustomEvent("claim-dialog-saved", { detail: message }));
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

type RecordedAction =
  | { readonly action: "evidence"; readonly key: string; readonly selected: boolean }
  | { readonly action: "link-passage"; readonly claimId: string }
  | { readonly action: "mutated"; readonly message: string }
  | { readonly action: "open-annotation"; readonly annotationId: string }
  | { readonly action: "open-passage"; readonly anchor: ManuscriptAnchorSelector };

function recordActions(panel: ClaimListPanel): RecordedAction[] {
  const actions: RecordedAction[] = [];
  panel.bind({
    completeMutation: (message) => actions.push({ action: "mutated", message }),
    linkPassage: (claimId) => actions.push({ action: "link-passage", claimId }),
    openAnnotation: (annotationId) => actions.push({ action: "open-annotation", annotationId }),
    openPassage: (anchor) => actions.push({ action: "open-passage", anchor }),
  });
  panel.bindEvidenceSelection((key, selected) => actions.push({ action: "evidence", key, selected }));
  return actions;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("claim list panel", () => {
  it("clears fallback markup when connected", () => {
    const panel = new TestClaimListPanel();
    const replaceChildren = vi.fn();
    Object.defineProperty(panel, "replaceChildren", { value: replaceChildren });

    panel.connectedCallback();

    expect(replaceChildren).toHaveBeenCalledOnce();
  });

  it("renders empty and populated claim states", () => {
    const panel = new TestClaimListPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setWorkspace(
      {
        annotations: [annotation],
        claims: [claim, { ...claim, id: "claim:2", note: "" }],
        claimEvidenceLinks: [evidenceLink, { ...evidenceLink, annotationId: "missing", claimId: "claim:2", id: "claim-evidence:2" }],
        claimLinks: [passageLink],
      },
      new Set(["claim:1"]),
    );
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

  it("owns claim card reveal and optional focus", () => {
    const panel = new TestClaimListPanel();
    const calls: string[] = [];
    Object.defineProperty(panel, "querySelectorAll", {
      value: () => [
        {
          dataset: { claimResourceId: claim.id },
          focus: () => calls.push("focus"),
          scrollIntoView: () => calls.push("scroll"),
        },
      ],
    });

    expect(panel.revealClaim(claim.id)).toBe(true);
    expect(panel.revealClaim(claim.id, true)).toBe(true);
    expect(panel.revealClaim("missing")).toBe(false);
    expect(calls).toEqual(["scroll", "focus", "scroll"]);
  });

  it("emits bounded claim and navigation intents", async () => {
    const panel = new TestClaimListPanel();
    const dialog = new ClaimDialog();
    Object.defineProperty(dialog, "updateComplete", { value: Promise.resolve(true) });
    const openDialog = vi.spyOn(dialog, "open").mockImplementation(() => undefined);
    Object.defineProperty(panel, "querySelector", { value: () => dialog });
    const actions = recordActions(panel);
    panel.setWorkspace(
      { annotations: [annotation], claims: [claim], claimEvidenceLinks: [evidenceLink], claimLinks: [passageLink] },
      new Set(),
    );

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
    await Promise.resolve();
    const changedAnchor = { ...anchor, exact: "Changed passage" };
    panel.setPassageLinks([{ ...passageLink, anchor: changedAnchor }]);
    panel.passageForTest();

    expect(actions).toEqual([
      { action: "evidence", key: "claim:1", selected: false },
      { action: "link-passage", claimId: claim.id },
      { action: "open-annotation", annotationId: annotation.id },
      { action: "open-passage", anchor },
      { action: "open-passage", anchor: changedAnchor },
    ]);
    expect(openDialog).toHaveBeenNthCalledWith(1, undefined, [annotation], []);
    expect(openDialog).toHaveBeenNthCalledWith(2, claim, [annotation], [evidenceLink]);
  });

  it("converts editor completion into a claim mutation", () => {
    const panel = new TestClaimListPanel();
    const actions = recordActions(panel);

    panel.savedForTest("Claim saved.");
    expect(actions).toEqual([{ action: "mutated", message: "Claim saved." }]);
  });

  it("keeps claim creation local when evidence is unavailable", () => {
    const panel = new TestClaimListPanel();

    panel.createForTest();

    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns confirmed deletion persistence and emits the completed outcome", async () => {
    const panel = new TestClaimListPanel();
    const actions = recordActions(panel);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    panel.configure("/api/workspaces/workspace");

    await panel.deleteForTest({ ...claim, id: "claim/1" });

    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/workspace/claims/claim%2F1", expect.objectContaining({ method: "DELETE" }));
    expect(actions).toEqual([{ action: "mutated", message: "Claim removed; source evidence remains intact." }]);
  });

  it("owns passage-link persistence and emits the completed outcome", async () => {
    const panel = new TestClaimListPanel();
    const actions = recordActions(panel);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
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

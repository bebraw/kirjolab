import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnnotationResource, ClaimResource } from "../domain/workspace";
import { ClaimDialog, claimDialogSavedEvent } from "./claim-dialog";

class TestClaimDialog extends ClaimDialog {
  closeCount = 0;

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  changeForTest(field: "note" | "relation" | "text", value: string): void {
    const event = eventWithControl({ value });
    if (field === "text") this.changeText(event);
    else if (field === "note") this.changeNote(event);
    else this.changeRelation(event);
  }

  toggleForTest(value: string, checked: boolean): void {
    this.toggleEvidence(eventWithControl({ checked, value }));
  }

  saveForTest(): Promise<void> {
    return this.save(new Event("submit"));
  }

  override close(): void {
    this.closeCount += 1;
  }
}

function eventWithControl(control: { readonly checked?: boolean; readonly value: string }): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: control });
  return event;
}

const annotations = [
  annotation("annotation-1", "Primary evidence", 2, "First quote"),
  annotation("annotation-2", "", 4, "Second quote"),
] satisfies readonly AnnotationResource[];

const claim = {
  createdAt: "2026-07-25T00:00:00.000Z",
  id: "claim-1",
  note: "Working note",
  text: "Inspectable evidence supports the claim.",
  updatedAt: "2026-07-25T00:00:00.000Z",
} satisfies ClaimResource;

function annotation(id: string, comment: string, page: number, quote: string): AnnotationResource {
  return {
    comment,
    createdAt: "2026-07-25T00:00:00.000Z",
    fragments: [],
    id,
    page,
    pdfId: "pdf-1",
    prefix: "",
    quote,
    rects: [],
    suffix: "",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}

afterEach(() => vi.restoreAllMocks());

describe("claim dialog", () => {
  it("renders create and edit state in light DOM", () => {
    const panel = new TestClaimDialog();
    expect(panel.rootForTest()).toBe(panel);
    expect(panel.renderForTest()).toBeDefined();
    panel.open(claim, annotations, [{ annotationId: "annotation-1", relation: "extends" }]);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns values, evidence selection, and create persistence", async () => {
    const panel = new TestClaimDialog();
    const messages: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.addEventListener(claimDialogSavedEvent, (event) => messages.push((event as CustomEvent<string>).detail));
    panel.configure("/api/workspaces/workspace");
    panel.open(undefined, annotations, []);
    panel.changeForTest("text", "A bounded claim");
    panel.changeForTest("note", "Interpret cautiously");
    panel.changeForTest("relation", "contradicts");
    panel.toggleForTest("annotation-2", true);
    panel.toggleForTest("annotation-1", true);
    panel.toggleForTest("annotation-1", false);
    await panel.saveForTest();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/workspace/claims",
      expect.objectContaining({
        body: JSON.stringify({
          text: "A bounded claim",
          note: "Interpret cautiously",
          evidence: [{ annotationId: "annotation-2", relation: "contradicts" }],
        }),
        method: "POST",
      }),
    );
    expect(messages).toEqual(["Claim and evidence relationships saved."]);
    expect(panel.closeCount).toBe(1);
  });

  it("uses the stable encoded claim identity for edits", async () => {
    const panel = new TestClaimDialog();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    panel.open({ ...claim, id: "claim/1" }, annotations, [{ annotationId: "annotation-1", relation: "supports" }]);

    await panel.saveForTest();

    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/workspace/claims/claim%2F1", expect.objectContaining({ method: "PUT" }));
  });

  it("reports missing evidence and provider failures before permitting retry", async () => {
    const panel = new TestClaimDialog();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    panel.open(undefined, annotations, []);
    panel.changeForTest("text", "A bounded claim");

    await panel.saveForTest();
    expect(fetchMock).not.toHaveBeenCalled();
    panel.toggleForTest("annotation-1", true);
    await panel.saveForTest();
    expect(panel.renderForTest()).toBeDefined();
    await panel.saveForTest();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores duplicate submissions while a save is pending", async () => {
    const panel = new TestClaimDialog();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    panel.configure("/api/workspaces/workspace");
    panel.open(undefined, annotations, [{ annotationId: "annotation-1", relation: "supports" }]);

    const first = panel.saveForTest();
    await panel.saveForTest();
    respond(new Response(null, { status: 200 }));
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

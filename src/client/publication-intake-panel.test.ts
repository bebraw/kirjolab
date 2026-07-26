import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicationIntakePreview, PublicationResource } from "../domain/workspace";
import { PublicationIntakePanel, publicationIntakeActionEvent, type PublicationIntakeAction } from "./publication-intake-panel";

const timestamp = "2026-07-25T00:00:00.000Z";
const preview: PublicationIntakePreview = {
  citationKey: "author2026",
  doi: "10.5555/intake",
  existingPublicationId: null,
  metadata: {
    abstract: "Abstract",
    authors: ["Ada Author"],
    doi: "10.5555/intake",
    title: "Reviewed intake",
    type: "article",
    url: "https://doi.org/10.5555/intake",
    venue: "Journal",
    year: "2026",
  },
  metadataFingerprint: "a".repeat(64),
  pdfId: "pdf:1",
};
const publication: PublicationResource = {
  abstract: "",
  authors: ["Ada Author"],
  citationKey: "author2026",
  createdAt: timestamp,
  doi: "10.5555/intake",
  id: "publication:1",
  metadataSource: "crossref",
  title: "{Reviewed} intake",
  type: "article",
  updatedAt: timestamp,
  url: "https://doi.org/10.5555/intake",
  venue: "Journal",
  year: "2026",
};

class TestPublicationIntakePanel extends PublicationIntakePanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  async previewForTest(): Promise<void> {
    await this.preview(new Event("submit") as SubmitEvent);
  }

  async acceptForTest(): Promise<void> {
    await this.accept();
  }

  cancelForTest(): void {
    this.cancel();
  }

  openForTest(publicationId?: string): void {
    this.openReference(eventWithTarget({ dataset: { publicationId } }));
  }

  doiForTest(value: string): void {
    this.updateDoi(eventWithTarget({ value }));
  }

  keyForTest(value: string): void {
    this.updateCitationKey(eventWithTarget({ value }));
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

describe("publication intake panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders lookup and linked states", () => {
    const panel = new TestPublicationIntakePanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setContext(preview.pdfId, [publication]);
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("owns preview, acceptance, cancellation, and navigation intents", async () => {
    const panel = new TestPublicationIntakePanel();
    const actions: PublicationIntakeAction[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(preview))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ ...preview, existingPublicationId: publication.id }));
    vi.stubGlobal("fetch", fetchMock);
    panel.configure("/api/workspaces/workspace-1");
    panel.setContext(preview.pdfId, []);
    panel.addEventListener(publicationIntakeActionEvent, (event) => actions.push((event as CustomEvent<PublicationIntakeAction>).detail));

    panel.doiForTest("10.5555/intake");
    await panel.previewForTest();
    expect(panel.renderForTest()).toBeDefined();
    panel.keyForTest("custom2026");
    await panel.acceptForTest();
    const accepted = actions[0];
    if (accepted?.action !== "accepted") throw new Error("Expected accepted intake action");
    expect(panel.completeAcceptance(accepted.requestId)).toBe(true);
    await panel.previewForTest();
    panel.cancelForTest();
    panel.openForTest(publication.id);
    panel.openForTest();

    expect(actions).toEqual([
      { action: "accepted", doi: "10.5555/intake", requestId: accepted.requestId },
      { action: "open-reference", publicationId: publication.id },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/workspaces/workspace-1/publication-intake/preview",
      expect.objectContaining({ body: JSON.stringify({ pdfId: "pdf:1", doi: "10.5555/intake" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/workspace-1/publication-intake/accept",
      expect.objectContaining({
        body: JSON.stringify({
          pdfId: "pdf:1",
          doi: "10.5555/intake",
          citationKey: "custom2026",
          metadataFingerprint: "a".repeat(64),
        }),
      }),
    );
  });

  it("contains failed and malformed previews", async () => {
    const panel = new TestPublicationIntakePanel();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: "DOI unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ doi: "10.5555/intake" }));
    vi.stubGlobal("fetch", fetchMock);
    panel.configure("/api/workspaces/workspace-1");
    panel.setContext(preview.pdfId, []);
    panel.doiForTest(preview.doi);

    await panel.previewForTest();
    await panel.previewForTest();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("returns a refresh-rejected acceptance to review", async () => {
    const panel = new TestPublicationIntakePanel();
    const actions: PublicationIntakeAction[] = [];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(preview))
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );
    panel.configure("/api/workspaces/workspace-1");
    panel.setContext(preview.pdfId, []);
    panel.doiForTest(preview.doi);
    panel.addEventListener(publicationIntakeActionEvent, (event) => actions.push((event as CustomEvent<PublicationIntakeAction>).detail));

    await panel.previewForTest();
    await panel.acceptForTest();
    const accepted = actions[0];
    if (accepted?.action !== "accepted") throw new Error("Expected accepted intake action");
    panel.failAcceptance(accepted.requestId, new Error("Snapshot refresh failed"));

    expect(panel.completeAcceptance(accepted.requestId)).toBe(false);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("rejects a delayed preview after the active PDF changes", async () => {
    const panel = new TestPublicationIntakePanel();
    const actions: PublicationIntakeAction[] = [];
    let resolvePreview: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolvePreview = resolve;
          }),
      ),
    );
    panel.configure("/api/workspaces/workspace-1");
    panel.setContext(preview.pdfId, []);
    panel.doiForTest(preview.doi);
    panel.addEventListener(publicationIntakeActionEvent, (event) => actions.push((event as CustomEvent<PublicationIntakeAction>).detail));

    const request = panel.previewForTest();
    panel.setContext("pdf:2", []);
    resolvePreview?.(Response.json(preview));
    await request;

    await panel.acceptForTest();
    expect(actions).toEqual([]);
  });
});

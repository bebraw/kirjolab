import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryReferencePersonalFields, libraryReferencePersonalRefreshEvent } from "./library-reference-personal-fields";

class TestLibraryReferencePersonalFields extends LibraryReferencePersonalFields {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  updateForTest(field: "collections" | "note" | "tags", value: string): void {
    const event = new Event("input");
    Object.defineProperty(event, "currentTarget", { value: { value } });
    this.updateText(field, event);
  }

  saveTagsForTest(): Promise<void> {
    return this.saveTags();
  }

  saveCollectionsForTest(): Promise<void> {
    return this.saveCollections();
  }

  saveReadingForTest(): Promise<void> {
    return this.saveReading();
  }

  saveNoteForTest(): Promise<void> {
    return this.saveNote();
  }

  setArchivedForTest(archived: boolean): Promise<void> {
    return this.setArchived(archived);
  }
}

describe("library reference personal fields", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("owns empty and populated light-DOM form state", () => {
    const fields = new TestLibraryReferencePersonalFields();
    expect(fields.rootForTest()).toBe(fields);
    expect(fields.renderForTest()).toBeDefined();
    fields.setData({
      archived: true,
      collections: ["Methods"],
      displayTitle: "Useful Paper",
      reading: { priority: "high", rating: 5, status: "read" },
      referenceId: "ref-1",
      tags: ["important", "reviewed"],
    });
    expect(fields.renderForTest()).toBeDefined();
  });

  it("owns organization, archive, reading, and note requests", async () => {
    const fields = new TestLibraryReferencePersonalFields();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { confirm: vi.fn().mockReturnValue(true) });
    const outcomes: string[] = [];
    fields.addEventListener(libraryReferencePersonalRefreshEvent, (event) => outcomes.push((event as CustomEvent<string>).detail));
    fields.setData({
      archived: false,
      collections: [],
      displayTitle: "Useful Paper",
      reading: null,
      referenceId: "ref-1",
      tags: [],
    });
    fields.updateForTest("tags", "important");
    fields.updateForTest("collections", "Methods");
    fields.updateForTest("note", "Private observation");
    await fields.saveTagsForTest();
    await fields.saveCollectionsForTest();
    await fields.saveReadingForTest();
    await fields.saveNoteForTest();
    await fields.setArchivedForTest(true);

    expect(fetchMock.mock.calls).toEqual([
      ["/api/library/references/ref-1/tags", request("PUT", { tags: ["important"] })],
      ["/api/library/references/ref-1/collections", request("PUT", { collections: ["Methods"] })],
      ["/api/library/references/ref-1/reading", request("PUT", { status: "unread", rating: null, priority: "normal" })],
      ["/api/library/references/ref-1/notes", request("POST", { body: "Private observation" })],
      ["/api/library/references/ref-1", request("PATCH", { archived: true })],
    ]);
    expect(outcomes).toEqual([
      "Private tags saved.",
      "Collections saved.",
      "Reading state saved.",
      "Private note saved. It is not visible to project collaborators.",
      "Reference archived.",
    ]);
  });

  it("keeps failures local and ignores duplicate submissions", async () => {
    const fields = new TestLibraryReferencePersonalFields();
    fields.setData({
      archived: false,
      collections: [],
      displayTitle: "Useful Paper",
      reading: null,
      referenceId: "ref-1",
      tags: ["important"],
    });
    let resolveResponse = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingResponse);
    vi.stubGlobal("fetch", fetchMock);

    const first = fields.saveTagsForTest();
    await fields.saveCollectionsForTest();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse(new Response(JSON.stringify({ error: "Private fields unavailable" }), { status: 503 }));
    await first;
    expect(fields.renderForTest()).toBeDefined();
  });

  it("does not submit empty notes or cancelled archives", async () => {
    const fields = new TestLibraryReferencePersonalFields();
    fields.setData({
      archived: false,
      collections: [],
      displayTitle: "Useful Paper",
      reading: null,
      referenceId: "ref-1",
      tags: [],
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { confirm: vi.fn().mockReturnValue(false) });

    await fields.saveNoteForTest();
    await fields.setArchivedForTest(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function request(method: string, body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method,
  };
}

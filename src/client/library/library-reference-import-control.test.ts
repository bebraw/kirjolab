import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceSnapshotFixture } from "../../test-support/workspace-fixture";
import {
  LibraryReferenceImportControl,
  libraryReferenceImportRefreshEvent,
  type LibraryReferenceImportRefresh,
} from "./library-reference-import-control";

class TestLibraryReferenceImportControl extends LibraryReferenceImportControl {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  chooseDestination(value: string): void {
    const event = new Event("input");
    Object.defineProperty(event, "currentTarget", { value: { value } });
    this.changeDestination(event);
  }
}

describe("library reference import control", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("owns its light-DOM file inputs", () => {
    const control = new TestLibraryReferenceImportControl();
    expect(control.rootForTest()).toBe(control);
    expect(control.renderForTest()).toBeDefined();
  });

  it("owns BibTeX and CSL JSON transports with refresh acknowledgment", async () => {
    const control = new TestLibraryReferenceImportControl();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const refreshes: LibraryReferenceImportRefresh[] = [];
    control.addEventListener(libraryReferenceImportRefreshEvent, (event) => {
      refreshes.push((event as CustomEvent<LibraryReferenceImportRefresh>).detail);
    });

    await control.importFile("bibtex", file("references.bib", "@article{paper}"));
    await control.importFile("csl-json", file("ignored.json", "[]"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    control.complete(1);
    await control.importFile("csl-json", file("references.json", "[]"));

    expect(fetchMock.mock.calls).toEqual([
      [
        "/api/library/import",
        {
          body: JSON.stringify({ bibtex: "@article{paper}" }),
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      ],
      [
        "/api/library/import/csl-json",
        {
          body: "[]",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      ],
    ]);
    expect(refreshes).toEqual([
      {
        message: "References imported into your private Library.",
        projectSnapshot: null,
        requestId: 1,
      },
      { message: "CSL JSON imported into the canonical library.", projectSnapshot: null, requestId: 2 },
    ]);
    control.complete(2);
  });

  it("imports a whole bibliography into the configured project and emits its canonical snapshot", async () => {
    const control = new TestLibraryReferenceImportControl();
    control.configure("/api/workspaces/workspace");
    const fetchMock = vi.fn().mockResolvedValue(Response.json(workspaceSnapshotFixture));
    vi.stubGlobal("fetch", fetchMock);
    const refreshes: LibraryReferenceImportRefresh[] = [];
    control.addEventListener(libraryReferenceImportRefreshEvent, (event) => {
      refreshes.push((event as CustomEvent<LibraryReferenceImportRefresh>).detail);
    });

    await control.importFile("bibtex", file("references.bib", "@manual{one,title={One}}\n@manual{two,title={Two}}"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/workspace/bibliography/import",
      expect.objectContaining({
        body: JSON.stringify({ bibtex: "@manual{one,title={One}}\n@manual{two,title={Two}}" }),
        method: "POST",
      }),
    );
    expect(refreshes).toEqual([
      {
        message: "References imported and added to this project.",
        projectSnapshot: workspaceSnapshotFixture,
        requestId: 1,
      },
    ]);
  });

  it("keeps Library-only imports private and preserves that choice during project refreshes", async () => {
    const control = new TestLibraryReferenceImportControl();
    control.configure("/api/workspaces/workspace");
    control.chooseDestination("library");
    control.configure("/api/workspaces/workspace");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await control.importFile("bibtex", file("private.bib", "@manual{private,title={Private}}"));

    expect(fetchMock).toHaveBeenCalledWith("/api/library/import", expect.objectContaining({ method: "POST" }));
    control.complete(1);
    control.configure("/api/workspaces/another");
    fetchMock.mockResolvedValue(Response.json(workspaceSnapshotFixture));
    await control.importFile("bibtex", file("another.bib", "@manual{another,title={Another}}"));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/workspaces/another/bibliography/import", expect.anything());
  });

  it("rejects malformed project responses locally and allows retry", async () => {
    const control = new TestLibraryReferenceImportControl();
    control.configure("/api/workspaces/workspace");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "incomplete" }))
      .mockResolvedValue(Response.json(workspaceSnapshotFixture));
    vi.stubGlobal("fetch", fetchMock);
    const refreshed = vi.fn();
    control.addEventListener(libraryReferenceImportRefreshEvent, refreshed);

    await control.importFile("bibtex", file("invalid.bib", "@manual{one}"));
    expect(refreshed).not.toHaveBeenCalled();
    await control.importFile("bibtex", file("retry.bib", "@manual{one}"));
    expect(refreshed).toHaveBeenCalledOnce();
  });

  it("keeps CSL JSON and standalone BibTeX imports Library-only", async () => {
    const control = new TestLibraryReferenceImportControl();
    control.configure("/api/workspaces/workspace");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await control.importFile("csl-json", file("references.json", "[]"));
    expect(fetchMock).toHaveBeenCalledWith("/api/library/import/csl-json", expect.anything());
    control.complete(1);
    control.configure(null);
    await control.importFile("bibtex", file("standalone.bib", "@manual{one}"));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/library/import", expect.anything());
  });

  it("keeps provider failures local and ignores concurrent imports", async () => {
    const control = new TestLibraryReferenceImportControl();
    let resolveResponse = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingResponse);
    vi.stubGlobal("fetch", fetchMock);

    const first = control.importFile("bibtex", file("references.bib", "@article{paper}"));
    await control.importFile("csl-json", file("references.json", "[]"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveResponse(new Response(JSON.stringify({ error: "Import unavailable" }), { status: 503 }));
    await first;

    expect(control.renderForTest()).toBeDefined();
  });
});

function file(name: string, content: string): File {
  return new File([content], name, { type: "text/plain" });
}

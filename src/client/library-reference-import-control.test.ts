import { afterEach, describe, expect, it, vi } from "vitest";
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
        message: "References imported into your private library. Add only the ones this project uses.",
        requestId: 1,
      },
      { message: "CSL JSON imported into the canonical library.", requestId: 2 },
    ]);
    control.complete(2);
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

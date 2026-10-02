import { nothing } from "lit";
import { isTemplateResult } from "lit/directive-helpers.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LatexImportPreview } from "../../app/app-contracts";
import { LatexImportPanel } from "./latex-import-panel";

const preview: LatexImportPreview = {
  archiveSha256: "b".repeat(64),
  archive: {
    files: [{ bytes: 10, kind: "tex", path: "paper.tex" }],
    rootCandidates: ["paper.tex"],
  },
  conversion: {
    assets: [{ bytes: 20, mediaType: "image/png", path: "figure.png" }],
    report: {
      bibliographyPath: "references.bib",
      diagnostics: [{ message: "Converted", severity: "info" }],
      rootPath: "paper.tex",
    },
    seed: {
      bibliography: "@misc{paper}",
      files: [{ content: "# Paper", path: "paper.md" }],
    },
  },
  previewDigest: "a".repeat(64),
};

class TestLatexImportPanel extends LatexImportPanel {
  archiveFile: File | undefined;
  focusCount = 0;

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  previewForTest(): Promise<void> {
    return this.preview(new Event("submit") as SubmitEvent);
  }

  confirmForTest(): Promise<void> {
    return this.confirm();
  }

  cancelForTest(): void {
    this.cancel();
  }

  titleForTest(value: string): void {
    this.updateTitle(eventWithTarget({ value }));
  }

  archiveChangedForTest(file?: File): void {
    this.archiveChanged(eventWithTarget({ files: file ? [file] : [] }));
  }

  rootChangedForTest(value: string): void {
    this.rootChanged(eventWithTarget({ value }));
  }

  override focusTitle(): void {
    this.focusCount += 1;
  }

  override querySelector<E extends Element = Element>(selector: string): E | null {
    if (selector === "#latex-import-archive") return { files: this.archiveFile ? [this.archiveFile] : [] } as unknown as E;
    return null;
  }
}

class FakeDialog extends EventTarget {
  closeCount = 0;
  modalCount = 0;

  close(): void {
    this.closeCount += 1;
  }

  showModal(): void {
    this.modalCount += 1;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

describe("LaTeX import panel", () => {
  it("keeps standalone setup, review, failures and back navigation synchronized", () => {
    const panel = new TestLatexImportPanel();
    panel.standalone = true;
    const states: unknown[] = [];
    const back = vi.fn();
    panel.addEventListener("project-creation-state", (event) => {
      if (event instanceof CustomEvent) {
        states.push(event.detail);
        expect(event.bubbles).toBe(true);
      }
    });
    panel.addEventListener("project-creation-back", back);
    let view = markup(panel.renderForTest());
    expect(control(view, "preview-latex-import")).toContain("?hidden=false");
    expect(control(view, "confirm-latex-import")).toContain("?hidden=true");
    expect(control(view, "confirm-latex-import")).toContain("?disabled=true");
    expect(view).toContain("Preview to inspect the converted Markdown and diagnostics.");
    panel.archiveChangedForTest(new File(["zip"], "my__paper--draft.ZIP"));
    panel.previewSucceeded(preview);
    view = markup(panel.renderForTest());
    expect(view).toContain('sm:grid-cols-2" ?hidden=true');
    expect(control(view, "preview-latex-import")).toContain("?hidden=true");
    expect(control(view, "confirm-latex-import")).toContain("?hidden=false");
    expect(control(view, "confirm-latex-import")).toContain("?disabled=false");
    expect(view).toContain("my paper draft");
    expect(view).toContain("1 Markdown files · 1 figure inputs detected · bibliography selected");
    expect(view).toContain("# Paper");
    expect(view).toContain("Note: Converted");
    panel.previewFailed("Preview unavailable");
    expect(markup(panel.renderForTest())).toContain("Preview unavailable");
    panel.confirmFailed("Create unavailable");
    expect(markup(panel.renderForTest())).toContain("Create unavailable");
    panel.edit();
    view = markup(panel.renderForTest());
    expect(control(view, "confirm-latex-import")).toContain("?hidden=true");
    expect(control(view, "confirm-latex-import")).toContain("?disabled=true");
    expect(states).toEqual([
      { step: 3, busy: false },
      { step: 3, busy: false },
      { step: 3, busy: false },
      { step: 2, busy: false },
    ]);
    panel.cancelForTest();
    expect(back).toHaveBeenCalledOnce();
  });

  it("requires a root choice and blocks confirmation when conversion reports errors", async () => {
    const panel = new TestLatexImportPanel();
    panel.archiveFile = new File(["zip"], "paper.zip");
    panel.previewSucceeded({ ...preview, conversion: null, archive: { ...preview.archive, rootCandidates: ["a.tex", "b.tex"] } });
    let view = markup(panel.renderForTest());
    expect(control(view, "latex-root-field")).toContain("?hidden=false");
    expect(view).toContain('<option value="">Choose a root document</option>');
    expect(view).toContain("<option value=a.tex>a.tex</option>");
    expect(view).toContain("Choose a root document, then preview again.");
    const fetcher = vi.fn().mockResolvedValue(Response.json(preview));
    vi.stubGlobal("fetch", fetcher);
    panel.rootChangedForTest("b.tex");
    expect(markup(panel.renderForTest())).toContain("Preview the selected root before creating the project.");
    await panel.previewForTest();
    expect(fetcher).toHaveBeenCalledWith("/api/latex-import-previews?root=b.tex", expect.objectContaining({ method: "POST" }));
    const conversion = preview.conversion;
    if (!conversion) throw new Error("Fixture must contain a conversion");
    panel.previewSucceeded({
      ...preview,
      conversion: {
        ...conversion,
        report: {
          ...conversion.report,
          diagnostics: [
            { message: "Unsafe command", severity: "error" },
            { message: "Check this", severity: "warning" },
          ],
        },
      },
    });
    view = markup(panel.renderForTest());
    expect(control(view, "latex-root-field")).toContain("?hidden=true");
    expect(control(view, "confirm-latex-import")).toContain("?disabled=true");
    expect(view).toContain("1 blocking diagnostic requires review.");
    expect(view).toContain("Blocked: Unsafe command");
    expect(view).toContain("Review: Check this");
    fetcher.mockClear();
    await panel.confirmForTest();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("disables controls and prevents duplicate requests or cancellation during preview", async () => {
    const panel = new TestLatexImportPanel();
    panel.standalone = true;
    panel.archiveFile = new File(["zip"], "paper.zip");
    const response = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(response.promise);
    const back = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    panel.addEventListener("project-creation-back", back);
    const pending = panel.previewForTest();
    const view = markup(panel.renderForTest());
    for (const id of [
      "latex-import-title",
      "latex-import-archive",
      "latex-import-root",
      "preview-latex-import",
      "confirm-latex-import",
      "cancel-latex-import",
    ])
      expect(control(view, id)).toContain("?disabled=true");
    expect(view).toContain("Previewing…");
    expect(view).toContain("Inspecting and converting the archive on the server…");
    await panel.previewForTest();
    await panel.confirmForTest();
    panel.cancelForTest();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(back).not.toHaveBeenCalled();
    response.resolve(Response.json(preview));
    await pending;
    expect(control(markup(panel.renderForTest()), "confirm-latex-import")).toContain("?disabled=false");
  });

  it("renders initial, root-selection, converted, blocking, and failure states", () => {
    const panel = new TestLatexImportPanel();
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);

    panel.previewSucceeded({ ...preview, conversion: null, archive: { ...preview.archive, rootCandidates: ["a.tex", "b.tex"] } });
    expect(panel.renderForTest()).toBeDefined();
    panel.previewSucceeded(preview);
    expect(panel.renderForTest()).toBeDefined();
    panel.previewSucceeded({
      ...preview,
      conversion: {
        ...preview.conversion!,
        report: {
          ...preview.conversion!.report,
          diagnostics: [{ message: "Unsupported command", severity: "error" }],
        },
      },
    });
    expect(panel.renderForTest()).toBeDefined();
    panel.previewFailed("Could not preview");
    panel.confirmFailed("Could not import");
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns preview, creation, and canonical project navigation", async () => {
    const panel = new TestLatexImportPanel();
    const archive = new File(["zip"], "my-paper.zip", { type: "application/zip" });
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(preview))
      .mockResolvedValueOnce(Response.json({ workspace: { href: "/editor/project" } }));

    panel.archiveFile = archive;
    panel.archiveChangedForTest(archive);
    await panel.previewForTest();
    panel.titleForTest("Reviewed paper");
    await panel.confirmForTest();

    expect(assign.mock.calls).toEqual([["/editor/project"]]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/latex-import-previews", expect.objectContaining({ body: archive, method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/latex-imports?title=Reviewed+paper&archiveSha256=${"b".repeat(64)}&previewDigest=${"a".repeat(64)}&root=paper.tex&bibliography=references.bib`,
      expect.objectContaining({ body: archive, method: "POST" }),
    );
  });

  it("requires re-preview after root changes and rejects oversized archives locally", async () => {
    const panel = new TestLatexImportPanel();
    const archive = new File(["zip"], "paper.zip", { type: "application/zip" });
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });

    panel.archiveFile = archive;
    panel.previewSucceeded(preview);
    panel.rootChangedForTest("other.tex");
    await panel.confirmForTest();
    panel.archiveFile = { name: "large.zip", size: 20 * 1024 * 1024 + 1 } as File;
    await panel.previewForTest();

    expect(assign).not.toHaveBeenCalled();
  });

  it("ignores a stale preview response after the panel is reset for another archive", async () => {
    const panel = new TestLatexImportPanel();
    const firstArchive = new File(["first"], "first.zip", { type: "application/zip" });
    const secondArchive = new File(["second"], "second.zip", { type: "application/zip" });
    const firstResponse = deferred<Response>();
    const secondResponse = deferred<Response>();
    const secondPreview: LatexImportPreview = {
      ...preview,
      archiveSha256: "c".repeat(64),
      previewDigest: "d".repeat(64),
      conversion: {
        ...preview.conversion!,
        report: { ...preview.conversion!.report, rootPath: "second.tex", bibliographyPath: null },
      },
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => await firstResponse.promise)
      .mockImplementationOnce(async () => await secondResponse.promise)
      .mockResolvedValueOnce(Response.json({ workspace: { href: "/editor/second" } }));

    panel.archiveFile = firstArchive;
    const firstRequest = panel.previewForTest();
    panel.reset();
    panel.archiveFile = secondArchive;
    const secondRequest = panel.previewForTest();
    secondResponse.resolve(Response.json(secondPreview));
    await secondRequest;
    firstResponse.resolve(Response.json(preview));
    await firstRequest;
    panel.titleForTest("Second paper");
    await panel.confirmForTest();

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `/api/latex-imports?title=Second+paper&archiveSha256=${"c".repeat(64)}&previewDigest=${"d".repeat(64)}&root=second.tex`,
      expect.objectContaining({ body: secondArchive, method: "POST" }),
    );
  });

  it("presents preview and creation response failures", async () => {
    const panel = new TestLatexImportPanel();
    panel.archiveFile = new File(["zip"], "paper.zip", { type: "application/zip" });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ invalid: true }))
      .mockResolvedValueOnce(Response.json(preview))
      .mockResolvedValueOnce(Response.json({ workspace: null }));

    await panel.previewForTest();
    expect(markup(panel.renderForTest())).toContain("LaTeX import returned an invalid preview");
    await panel.previewForTest();
    panel.titleForTest("Paper");
    await panel.confirmForTest();

    expect(markup(panel.renderForTest())).toContain("LaTeX import returned invalid project data");
  });

  it("owns its native dialog lifecycle", () => {
    const panel = new TestLatexImportPanel();
    const dialog = new FakeDialog();
    vi.stubGlobal("HTMLDialogElement", FakeDialog);
    Object.defineProperty(panel, "closest", { value: () => dialog });

    panel.open();
    panel.cancelForTest();
    expect(dialog.modalCount).toBe(1);
    expect(dialog.closeCount).toBe(1);
    expect(panel.focusCount).toBe(1);
  });
});

function deferred<T>(): { readonly promise: Promise<T>; resolve(value: T): void } {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function markup(value: unknown): string {
  return serialize(value).replace(/\s+/gu, " ");
}

function serialize(value: unknown): string {
  if (value === nothing || value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(serialize).join("");
  if (isTemplateResult(value, 1)) return value.strings.reduce((result, part, index) => result + part + serialize(value.values[index]), "");
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function control(value: string, id: string): string {
  const match = new RegExp(`<[^>]+id="${id}"[^>]*>`, "u").exec(value);
  if (!match) throw new Error(`Missing rendered control: ${id}`);
  return match[0];
}

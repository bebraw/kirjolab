import { afterEach, describe, expect, it, vi } from "vitest";
import type { LatexImportPreview } from "./app-contracts";
import { LatexImportPanel } from "./latex-import-panel";

const preview: LatexImportPreview = {
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
  digest: "a".repeat(64),
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
      `/api/latex-imports?title=Reviewed+paper&previewDigest=${"a".repeat(64)}&root=paper.tex&bibliography=references.bib`,
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

  it("presents preview and creation response failures", async () => {
    const panel = new TestLatexImportPanel();
    panel.archiveFile = new File(["zip"], "paper.zip", { type: "application/zip" });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ invalid: true }))
      .mockResolvedValueOnce(Response.json(preview))
      .mockResolvedValueOnce(Response.json({ workspace: null }));

    await panel.previewForTest();
    await panel.previewForTest();
    panel.titleForTest("Paper");
    await panel.confirmForTest();

    expect(panel.renderForTest()).toBeDefined();
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

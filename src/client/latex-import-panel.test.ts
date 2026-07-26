import { afterEach, describe, expect, it, vi } from "vitest";
import type { LatexImportPreview } from "./app-contracts";
import { LatexImportPanel, latexImportActionEvent, type LatexImportAction } from "./latex-import-panel";

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

  previewForTest(): void {
    this.preview(new Event("submit") as SubmitEvent);
  }

  confirmForTest(): void {
    this.confirm();
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

afterEach(() => vi.unstubAllGlobals());

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

  it("owns local values and emits bounded preview, confirm, and cancel intents", () => {
    const panel = new TestLatexImportPanel();
    const archive = new File(["zip"], "my-paper.zip", { type: "application/zip" });
    const actions: LatexImportAction[] = [];
    panel.addEventListener(latexImportActionEvent, (event) => actions.push((event as CustomEvent<LatexImportAction>).detail));

    panel.archiveFile = archive;
    panel.archiveChangedForTest(archive);
    panel.previewForTest();
    panel.previewSucceeded(preview);
    panel.titleForTest("Reviewed paper");
    panel.confirmForTest();
    panel.confirmFailed("Try again");
    panel.cancelForTest();

    expect(actions).toEqual([
      { action: "preview", archive, root: "" },
      {
        action: "confirm",
        archive,
        bibliographyPath: "references.bib",
        previewDigest: "a".repeat(64),
        root: "paper.tex",
        title: "Reviewed paper",
      },
      { action: "cancel" },
    ]);
  });

  it("requires re-preview after root changes and rejects oversized archives locally", () => {
    const panel = new TestLatexImportPanel();
    const archive = new File(["zip"], "paper.zip", { type: "application/zip" });
    const actions: LatexImportAction[] = [];
    panel.addEventListener(latexImportActionEvent, (event) => actions.push((event as CustomEvent<LatexImportAction>).detail));

    panel.archiveFile = archive;
    panel.previewSucceeded(preview);
    panel.rootChangedForTest("other.tex");
    panel.confirmForTest();
    panel.archiveFile = { name: "large.zip", size: 20 * 1024 * 1024 + 1 } as File;
    panel.previewForTest();

    expect(actions).toEqual([]);
  });

  it("owns its native dialog lifecycle", () => {
    const panel = new TestLatexImportPanel();
    const dialog = new FakeDialog();
    vi.stubGlobal("HTMLDialogElement", FakeDialog);
    Object.defineProperty(panel, "closest", { value: () => dialog });

    panel.open();
    panel.close();
    expect(dialog.modalCount).toBe(1);
    expect(dialog.closeCount).toBe(1);
    expect(panel.focusCount).toBe(1);
  });
});

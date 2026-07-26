import { describe, expect, it } from "vitest";
import type { ProjectFilePreview } from "../domain/project-files";
import {
  PreviewContextStatus,
  PreviewDiagnosticsPanel,
  previewDiagnosticSelectEvent,
  type PreviewDiagnosticSelection,
} from "./preview-presentation";

const filePreview: ProjectFilePreview = {
  content: "Rendered source",
  dependencies: {},
  diagnostics: [
    {
      code: "missing-file",
      fileId: "file:main",
      from: 2,
      includeChain: ["file:main"],
      message: "Missing include",
      path: "main.md",
      to: 5,
    },
  ],
  fileId: "file:main",
  mode: "composed",
  path: "main.md",
  sourceMap: [
    {
      fileId: "file:nested",
      includeChain: ["file:main", "file:nested"],
      outputEnd: 20,
      outputStart: 10,
      path: "nested.md",
      sourceEnd: 8,
      sourceStart: 0,
    },
  ],
};

class TestPreviewContextStatus extends PreviewContextStatus {
  renderForTest() {
    return this.render();
  }
}

class TestPreviewDiagnosticsPanel extends PreviewDiagnosticsPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  selectForTest(index: string): void {
    this.select(eventWithTarget({ dataset: { diagnosticIndex: index } }));
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

describe("preview presentation", () => {
  it("renders default and updated context status", () => {
    const status = new TestPreviewContextStatus();
    expect(status.renderForTest()).toBeDefined();
    status.setFile(filePreview);
    status.setDiagnostics([], filePreview);
    expect(status.renderForTest().values).toEqual(["main.md · composed paper", "main.md · composed paper", "1 issue"]);
    status.setDiagnostics([{ from: 1, message: "Renderer issue", severity: "error", to: 2 }], filePreview);
    expect(status.renderForTest().values.at(-1)).toBe("2 issues");
    status.setDiagnostics([], null);
    expect(status.renderForTest().values.at(-1)).toBe("No syntax errors");
    status.showUnavailable();
    expect(status.renderForTest().values.at(-1)).toBe("Preview unavailable");
  });

  it("renders unavailable, project, mapped renderer, and fallback renderer diagnostics", () => {
    const panel = new TestPreviewDiagnosticsPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.showUnavailable("Renderer unavailable");
    expect(panel.renderForTest()).toBeDefined();
    panel.setDiagnostics(
      [
        { from: 12, message: "Mapped issue", severity: "error", to: 16 },
        { from: 30, message: "Fallback issue", severity: "warning", to: 34 },
      ],
      filePreview,
    );
    expect(panel.renderForTest()).toBeDefined();
    panel.setDiagnostics([{ from: 1, message: "Entry issue", severity: "error", to: 3 }], null);
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits only known selectable diagnostics", () => {
    const panel = new TestPreviewDiagnosticsPanel();
    const selections: PreviewDiagnosticSelection[] = [];
    panel.addEventListener(previewDiagnosticSelectEvent, (event) =>
      selections.push((event as CustomEvent<PreviewDiagnosticSelection>).detail),
    );
    panel.setDiagnostics([{ from: 12, message: "Mapped issue", severity: "error", to: 16 }], filePreview);

    panel.selectForTest("0");
    panel.selectForTest("1");
    panel.selectForTest("2");
    panel.selectForTest("missing");
    panel.showUnavailable("Unavailable");
    panel.selectForTest("0");

    expect(selections).toEqual([
      { fileId: "file:main", from: 2, to: 5 },
      { fileId: "file:nested", from: 0, to: 4 },
    ]);
  });
});

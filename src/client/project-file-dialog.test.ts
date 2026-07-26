import { describe, expect, it } from "vitest";
import {
  ProjectFileDialog,
  projectFileDialogIsCreating,
  projectFileDialogIsFolder,
  projectFileSaveEvent,
  type ProjectFileDialogMode,
  type ProjectFileSave,
} from "./project-file-dialog";

class TestProjectFileDialog extends ProjectFileDialog {
  focusCount = 0;
  showCount = 0;
  readonly input = {
    focus: () => {
      this.focusCount += 1;
    },
    value: "",
  };
  readonly modal = {
    close: () => {
      this.modal.open = false;
    },
    open: false,
    showModal: () => {
      this.showCount += 1;
      this.modal.open = true;
    },
  };

  override get updateComplete(): Promise<boolean> {
    return Promise.resolve(true);
  }

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  configureForTest(mode: ProjectFileDialogMode, path = "", targetId: string | null = null): void {
    this.configure(mode, path, targetId);
  }

  saveForTest(): void {
    this.save(new Event("submit") as SubmitEvent);
  }

  cancelForTest(): void {
    this.cancel();
  }

  protected override get dialog(): HTMLDialogElement {
    return this.modal as HTMLDialogElement;
  }

  protected override get pathInput(): HTMLInputElement {
    return this.input as HTMLInputElement;
  }
}

describe("project file dialog", () => {
  it("classifies file and folder operations", () => {
    expect(projectFileDialogIsFolder("create")).toBe(false);
    expect(projectFileDialogIsFolder("create-folder")).toBe(true);
    expect(projectFileDialogIsFolder("rename-folder")).toBe(true);
    expect(projectFileDialogIsCreating("create-and-include")).toBe(true);
    expect(projectFileDialogIsCreating("rename")).toBe(false);
  });

  it("renders each operation from bounded mode and path state", () => {
    const panel = new TestProjectFileDialog();
    expect(panel.rootForTest()).toBe(panel);
    for (const mode of ["create", "create-and-include", "rename", "create-folder", "rename-folder"] as const) {
      panel.configureForTest(mode, mode.includes("folder") ? "chapters" : "chapters/method.md");
      expect(panel.renderForTest()).toBeDefined();
    }
  });

  it("emits a trimmed save intent", () => {
    const panel = new TestProjectFileDialog();
    const saves: ProjectFileSave[] = [];
    panel.addEventListener(projectFileSaveEvent, (event) => saves.push((event as CustomEvent<ProjectFileSave>).detail));
    panel.configureForTest("create-and-include", "", "file-1");
    panel.input.value = "  chapters/method.md  ";

    panel.saveForTest();

    expect(saves).toEqual([{ mode: "create-and-include", path: "chapters/method.md", targetId: "file-1" }]);
  });

  it("opens, focuses, reuses, and cancels its modal", async () => {
    const panel = new TestProjectFileDialog();

    await panel.show("rename-folder", "chapters");
    expect(panel.showCount).toBe(1);
    expect(panel.focusCount).toBe(1);
    expect(panel.modal.open).toBe(true);

    await panel.show("create");
    expect(panel.showCount).toBe(1);
    expect(panel.focusCount).toBe(2);

    panel.cancelForTest();
    expect(panel.modal.open).toBe(false);
  });
});

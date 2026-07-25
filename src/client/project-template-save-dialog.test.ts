import { describe, expect, it } from "vitest";
import { ProjectTemplateSaveDialog, projectTemplateSaveEvent, type ProjectTemplateSave } from "./project-template-save-dialog";

const personalTemplates = [
  {
    createdAt: "2026-07-25T00:00:00.000Z",
    description: "Reusable review flow",
    id: "template-1",
    name: "Lab review",
    preview: {
      citationStyle: "apa",
      fileCount: 2,
      files: ["main.md", "methods.md"],
      folderCount: 0,
      folders: [],
      hasBibliography: true,
      locale: "en-US",
      paperSize: "a4",
      submissionTemplate: "article",
    },
    source: "personal",
    updatedAt: "2026-07-25T00:00:00.000Z",
  },
] as const;

class TestProjectTemplateSaveDialog extends ProjectTemplateSaveDialog {
  focusCount = 0;
  showCount = 0;
  readonly input = {
    focus: () => {
      this.focusCount += 1;
    },
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

  selectForTest(value: string): void {
    this.selectTemplate(eventWithValue(value));
  }

  nameForTest(value: string): void {
    this.changeName(eventWithValue(value));
  }

  descriptionForTest(value: string): void {
    this.changeDescription(eventWithValue(value));
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

  protected override get nameInput(): HTMLInputElement {
    return this.input as HTMLInputElement;
  }
}

class MissingProjectTemplateSaveDialogElements extends ProjectTemplateSaveDialog {
  override querySelector<E extends Element = Element>(_selectors: string): E | null {
    return null;
  }

  dialogForTest(): HTMLDialogElement {
    return this.dialog;
  }

  nameInputForTest(): HTMLInputElement {
    return this.nameInput;
  }
}

function eventWithValue(value: string): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: { value } });
  return event;
}

describe("project template save dialog", () => {
  it("renders loading, ready, error, and replacement states", () => {
    const dialog = new TestProjectTemplateSaveDialog();
    expect(dialog.rootForTest()).toBe(dialog);
    dialog.setTemplates(personalTemplates);
    expect(dialog.renderForTest()).toBeDefined();
    dialog.selectForTest("template-1");
    expect(dialog.renderForTest()).toBeDefined();
    dialog.showError("Could not load templates.");
    expect(dialog.renderForTest()).toBeDefined();
  });

  it("owns values and emits create and replacement save intents", () => {
    const dialog = new TestProjectTemplateSaveDialog();
    const saves: ProjectTemplateSave[] = [];
    dialog.addEventListener(projectTemplateSaveEvent, (event) => saves.push((event as CustomEvent<ProjectTemplateSave>).detail));
    dialog.nameForTest("New template");
    dialog.descriptionForTest("New description");
    dialog.saveForTest();
    dialog.setTemplates(personalTemplates);
    dialog.selectForTest("template-1");
    dialog.saveForTest();

    expect(saves).toEqual([
      { description: "New description", name: "New template" },
      { description: "Reusable review flow", name: "Lab review", templateId: "template-1" },
    ]);
  });

  it("opens loading state, focuses ready state, and cancels", async () => {
    const dialog = new TestProjectTemplateSaveDialog();

    await dialog.showLoading();
    expect(dialog.showCount).toBe(1);
    expect(dialog.modal.open).toBe(true);
    await dialog.showLoading();
    expect(dialog.showCount).toBe(1);

    await dialog.showReady("Current project");
    expect(dialog.focusCount).toBe(1);
    dialog.cancelForTest();
    expect(dialog.modal.open).toBe(false);
  });

  it("reports missing modal internals clearly", () => {
    const dialog = new MissingProjectTemplateSaveDialogElements();
    expect(() => dialog.dialogForTest()).toThrow("Project template save dialog is unavailable");
    expect(() => dialog.nameInputForTest()).toThrow("Project template name is unavailable");
  });
});

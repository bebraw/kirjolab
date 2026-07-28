import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectTemplateSaveDialog } from "./project-template-save-dialog";

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

  saveForTest(): Promise<void> {
    return this.save(new Event("submit") as SubmitEvent);
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("owns create and replacement requests and binds validated results", async () => {
    const dialog = new TestProjectTemplateSaveDialog();
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(personalTemplates[0]), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const saves: string[] = [];
    const source = { availableTemplates: personalTemplates, refresh: vi.fn().mockResolvedValue(undefined) };
    dialog.bindWorkspace("/api/workspaces/workspace-1", source, { show: (result) => saves.push(result) });
    dialog.nameForTest("New template");
    dialog.descriptionForTest("New description");
    await dialog.saveForTest();
    await vi.waitFor(() => expect(saves).toHaveLength(1));
    dialog.setTemplates(personalTemplates);
    dialog.selectForTest("template-1");
    await dialog.saveForTest();
    await vi.waitFor(() => expect(saves).toHaveLength(2));

    expect(saves).toEqual([
      `Saved “${personalTemplates[0].name}” as a personal template.`,
      `Replaced template “${personalTemplates[0].name}”.`,
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/workspaces/workspace-1/template", {
      body: JSON.stringify({ description: "New description", name: "New template" }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/workspaces/workspace-1/template", {
      body: JSON.stringify({ description: "Reusable review flow", name: "Lab review", templateId: "template-1" }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });

  it("keeps the dialog open and reports request and response failures", async () => {
    const dialog = new TestProjectTemplateSaveDialog();
    dialog.bindWorkspace(
      "/api/workspaces/workspace-1",
      { availableTemplates: personalTemplates, refresh: vi.fn().mockResolvedValue(undefined) },
      { show: () => undefined },
    );
    dialog.nameForTest("New template");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Template limit reached" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ unexpected: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await dialog.saveForTest();
    expect(dialog.renderForTest()).toBeDefined();
    await dialog.saveForTest();
    expect(dialog.renderForTest()).toBeDefined();
    expect(dialog.modal.open).toBe(false);
  });

  it("ignores a duplicate submission while a save is pending", async () => {
    const dialog = new TestProjectTemplateSaveDialog();
    dialog.bindWorkspace(
      "/api/workspaces/workspace-1",
      { availableTemplates: personalTemplates, refresh: vi.fn().mockResolvedValue(undefined) },
      { show: () => undefined },
    );
    dialog.nameForTest("New template");
    let resolveResponse = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingResponse);
    vi.stubGlobal("fetch", fetchMock);

    const firstSave = dialog.saveForTest();
    await dialog.saveForTest();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse(new Response(JSON.stringify(personalTemplates[0]), { status: 200 }));
    await firstSave;
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

  it("owns template loading and retryable open errors", async () => {
    const dialog = new TestProjectTemplateSaveDialog();
    const loadTemplates = vi.fn().mockResolvedValue(undefined);
    dialog.bindWorkspace(
      "/api/workspaces/workspace-1",
      { availableTemplates: personalTemplates, refresh: loadTemplates },
      { show: () => undefined },
    );

    await dialog.open("Current project");
    expect(loadTemplates).toHaveBeenCalledOnce();
    expect(dialog.showCount).toBe(1);
    expect(dialog.focusCount).toBe(1);

    const showError = vi.spyOn(dialog, "showError");
    loadTemplates.mockRejectedValueOnce(new Error("Template service unavailable"));
    await dialog.open("Current project");
    expect(showError).toHaveBeenCalledWith("Template service unavailable");
    expect(dialog.focusCount).toBe(1);
  });

  it("reports missing modal internals clearly", () => {
    const dialog = new MissingProjectTemplateSaveDialogElements();
    expect(() => dialog.dialogForTest()).toThrow("Project template save dialog is unavailable");
    expect(() => dialog.nameInputForTest()).toThrow("Project template name is unavailable");
  });
});

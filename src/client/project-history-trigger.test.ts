import { describe, expect, it, vi } from "vitest";
import { ProjectHistoryTrigger, projectHistoryOpenEvent, type ProjectRevisionOwners } from "./project-history-trigger";

class TestProjectHistoryTrigger extends ProjectHistoryTrigger {
  renderForTest() {
    return this.render();
  }

  openForTest(): void {
    this.open();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }
}

describe("project history trigger", () => {
  it("renders revision state and emits an open intent", () => {
    const trigger = new TestProjectHistoryTrigger();
    let opened = false;
    trigger.addEventListener(projectHistoryOpenEvent, () => {
      opened = true;
    });

    trigger.setRevision(7);
    trigger.openForTest();

    expect(trigger.renderForTest()).toBeDefined();
    expect(trigger.rootForTest()).toBe(trigger);
    expect(trigger.value).toBe(7);
    expect(opened).toBe(true);
  });

  it("owns monotonic revision consequences", () => {
    const trigger = new TestProjectHistoryTrigger();
    const setData = vi.fn();
    const renderHighlight = vi.fn();
    const presentBoundContext = vi.fn();
    const scheduleOfflineSave = vi.fn();
    const configureHistory = vi.fn();
    const toast = { show: vi.fn() };
    const owners = {
      collaboratorSelections: { setData },
      contextResourcePresenter: {
        activeTab: { id: "candidate-1", key: "candidate:candidate-1", kind: "candidate", scrollTop: 0 },
        presentBoundContext,
      },
      editorStatus: { renderHighlight },
      projectFileDialog: { projectFiles: vi.fn(() => []) },
      projectHistoryDialog: { configure: configureHistory },
      toast,
    } satisfies ProjectRevisionOwners;
    trigger.bindWorkspace("/api/workspaces/workspace", owners, { schedule: scheduleOfflineSave });

    trigger.observeRevision(5);
    trigger.observeRevision(3);

    expect(trigger.value).toBe(5);
    expect(setData).toHaveBeenLastCalledWith({ files: [], revision: 5 });
    expect(renderHighlight).toHaveBeenCalledTimes(2);
    expect(scheduleOfflineSave).toHaveBeenCalledTimes(2);
    expect(presentBoundContext).toHaveBeenCalledTimes(2);
    expect(configureHistory).toHaveBeenCalledWith("/api/workspaces/workspace", {
      projectHistoryTrigger: trigger,
      toast,
    });
  });
});

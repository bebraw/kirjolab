import { describe, expect, it, vi } from "vitest";
import { ProjectHistoryDialog, projectHistoryDialogCloseEvent } from "./project-history-dialog";

class TestProjectHistoryDialog extends ProjectHistoryDialog {
  renderForTest() {
    return this.render();
  }

  closeFromPanelForTest(): void {
    this.handlePanelClose();
  }

  closeDialogForTest(): void {
    this.handleDialogClose();
  }
}

describe("project history dialog", () => {
  it("preserves server-rendered history content through its slot", () => {
    expect(new TestProjectHistoryDialog().renderForTest()).toBeDefined();
  });

  it("owns modal lifecycle, busy state, and timeline presentation", () => {
    const control = new TestProjectHistoryDialog();
    const dialog = {
      close: vi.fn(),
      open: false,
      setAttribute: vi.fn(),
      showModal: vi.fn(() => {
        dialog.open = true;
      }),
    };
    const panel = {
      setBusy: vi.fn(),
      showError: vi.fn(),
      showLoading: vi.fn(),
      showTimeline: vi.fn(),
    };
    Object.defineProperty(control, "querySelector", {
      value: (selector: string) => (selector === "#project-history-dialog" ? dialog : panel),
    });
    let closed = false;
    control.addEventListener(projectHistoryDialogCloseEvent, () => {
      closed = true;
    });

    control.openLoading();
    control.openLoading();
    control.showTimeline([]);
    control.showError("Unavailable");
    control.setBusy(true);
    control.closeFromPanelForTest();
    control.closeDialogForTest();

    expect(control.isOpen()).toBe(true);
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(dialog.close).toHaveBeenCalledOnce();
    expect(dialog.setAttribute).toHaveBeenCalledWith("aria-busy", "true");
    expect(panel.showLoading).toHaveBeenCalledTimes(2);
    expect(panel.showTimeline).toHaveBeenCalledWith([]);
    expect(panel.showError).toHaveBeenCalledWith("Unavailable");
    expect(panel.setBusy).toHaveBeenCalledWith(true);
    expect(closed).toBe(true);
  });

  it("tolerates unavailable server-rendered children", () => {
    const control = new TestProjectHistoryDialog();
    Object.defineProperty(control, "querySelector", { value: () => null });

    control.openLoading();
    control.showTimeline([]);
    control.showError("Unavailable");
    control.setBusy(false);
    control.closeFromPanelForTest();

    expect(control.isOpen()).toBe(false);
  });
});

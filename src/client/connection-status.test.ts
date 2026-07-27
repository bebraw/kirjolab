import { describe, expect, it, vi } from "vitest";
import { ConnectionStatus } from "./connection-status";

class TestConnectionStatus extends ConnectionStatus {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }
}

describe("connection status", () => {
  it("renders pending, connected, and disconnected presentation", () => {
    const status = new TestConnectionStatus();
    expect(status.renderForTest()).toBeDefined();

    status.setConnection("Live · 1 writer", true);
    expect(status.renderForTest()).toBeDefined();

    status.setConnection("Offline", false);
    expect(status.renderForTest()).toBeDefined();
    expect(status.rootForTest()).toBe(status);
  });

  it("owns collaboration status, editability, and availability projection", () => {
    const status = new TestConnectionStatus();
    const source = { disabled: false } as HTMLTextAreaElement;
    const bibliography = { disabled: false } as HTMLTextAreaElement;
    const refreshAvailability = vi.fn();
    const setSave = vi.fn();

    status.presentWorkflow();
    status.bindWorkflow(
      { canEdit: false, status: { connected: false, label: "Offline" } },
      { assistantGenerationPresenter: { refreshAvailability }, bibliography, editorStatus: { setSave }, source },
    );
    status.presentWorkflow();
    status.presentOfflineRestore(true);

    expect(source.disabled).toBe(true);
    expect(bibliography.disabled).toBe(true);
    expect(refreshAvailability).toHaveBeenCalledTimes(2);
    expect(setSave).toHaveBeenCalledWith("Saved offline");
    expect(status.renderForTest()).toBeDefined();
  });
});

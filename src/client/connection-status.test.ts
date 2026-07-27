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

    status.presentWorkflow();
    status.bindWorkflow(
      { canEdit: false, status: { connected: false, label: "Offline" } },
      { assistantGenerationPresenter: { refreshAvailability }, bibliography, source },
    );
    status.presentWorkflow();

    expect(source.disabled).toBe(true);
    expect(bibliography.disabled).toBe(true);
    expect(refreshAvailability).toHaveBeenCalledOnce();
    expect(status.renderForTest()).toBeDefined();
  });
});

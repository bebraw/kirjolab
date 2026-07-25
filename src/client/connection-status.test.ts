import { describe, expect, it } from "vitest";
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
});

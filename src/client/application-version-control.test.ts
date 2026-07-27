import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationVersionControl } from "./application-version-control";

class TestApplicationVersionControl extends ApplicationVersionControl {
  copyForTest(): Promise<void> {
    return this.copyVersion();
  }

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }
}

describe("application version control", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders and copies the active application version", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const control = new TestApplicationVersionControl();
    const notices: string[] = [];
    control.bindNotice((message) => notices.push(message));

    control.setVersion("build-123");
    await control.copyForTest();

    expect(writeText).toHaveBeenCalledWith("build-123");
    expect(notices).toEqual(["Copied application version build-123."]);
    expect(control.renderForTest()).toBeDefined();
    expect(control.rootForTest()).toBe(control);
  });

  it("uses the textarea fallback and reports an unavailable clipboard", async () => {
    vi.stubGlobal("navigator", {});
    const input = {
      readOnly: false,
      remove: vi.fn(),
      select: vi.fn(),
      style: { opacity: "", position: "" },
      value: "",
    };
    const execCommand = vi.fn(() => true);
    vi.stubGlobal("document", {
      body: { append: vi.fn() },
      createElement: vi.fn(() => input),
      execCommand,
    });
    const control = new TestApplicationVersionControl();
    const notices: string[] = [];
    control.bindNotice((message) => notices.push(message));
    control.setVersion("fallback-456");

    await control.copyForTest();
    execCommand.mockReturnValue(false);
    await control.copyForTest();

    expect(input.value).toBe("fallback-456");
    expect(input.select).toHaveBeenCalledTimes(2);
    expect(input.remove).toHaveBeenCalledTimes(2);
    expect(notices).toEqual(["Copied application version fallback-456.", "Could not copy the application version"]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelProviderSettings, modelProviderChangeEvent, modelProviderDiscoveryEvent } from "./model-provider-settings";

class TestModelProviderSettings extends ModelProviderSettings {
  focusCount = 0;

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  changeForTest(field: "connection" | "endpoint" | "model" | "reasoning", value: string): void {
    const event = eventWithValue(value);
    if (field === "connection") this.changeConnection(event);
    else if (field === "endpoint") this.changeEndpoint(event);
    else if (field === "model") this.changeModel(event);
    else this.changeReasoningEffort(event);
  }

  discoverForTest(): void {
    this.discover();
  }

  override focusConnection(): void {
    this.focusCount += 1;
  }
}

class FakeDetails extends EventTarget {
  open = false;
}

afterEach(() => vi.unstubAllGlobals());

function eventWithValue(value: string): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: { value } });
  return event;
}

describe("model provider settings", () => {
  it("owns restored values and bounded model options", () => {
    const panel = new TestModelProviderSettings();
    expect(panel.rootForTest()).toBe(panel);
    expect(panel.value.reasoningEffort).toBe("none");
    panel.restore({
      connection: "companion",
      endpoint: "http://127.0.0.1:8790/v1/chat/completions",
      model: "saved-local",
      reasoningEffort: "low",
    });
    expect(panel.value).toEqual({
      connection: "companion",
      endpoint: "http://127.0.0.1:8790/v1/chat/completions",
      model: "saved-local",
      reasoningEffort: "low",
    });
    panel.setModels([" qwen/local ", "qwen/local", "gemma/local"], "missing");
    expect(panel.value.model).toBe("qwen/local");
    panel.setStatus("Ready");
    panel.setBusy(true);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("normalizes changes and emits status and discovery intents", () => {
    const panel = new TestModelProviderSettings();
    const statuses: Array<string | null> = [];
    let discoveries = 0;
    panel.addEventListener(modelProviderChangeEvent, (event) => {
      statuses.push((event as CustomEvent<string | null>).detail);
    });
    panel.addEventListener(modelProviderDiscoveryEvent, () => {
      discoveries += 1;
    });

    panel.changeForTest("connection", "companion");
    panel.changeForTest("endpoint", "http://127.0.0.1:9999/v1/chat/completions");
    panel.changeForTest("model", "qwen-local");
    panel.changeForTest("reasoning", "invalid");
    panel.discoverForTest();

    expect(panel.value).toEqual({
      connection: "companion",
      endpoint: "http://127.0.0.1:9999/v1/chat/completions",
      model: "qwen-local",
      reasoningEffort: "provider-default",
    });
    expect(statuses).toEqual([
      "The local companion starts with npm run dev; select manuscript text and grounding evidence.",
      null,
      "Using qwen-local for new writing assistant requests.",
      null,
    ]);
    expect(discoveries).toBe(1);
  });

  it("opens its preferences host and focuses the connection control", () => {
    const panel = new TestModelProviderSettings();
    const menu = new FakeDetails();
    vi.stubGlobal("HTMLDetailsElement", FakeDetails);
    Object.defineProperty(panel, "closest", { value: () => menu });

    panel.open();

    expect(menu.open).toBe(true);
    expect(panel.focusCount).toBe(1);
  });
});

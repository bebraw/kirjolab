import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelProviderSettings, modelProviderChangeEvent } from "./model-provider-settings";
import { OpenAICompatibleBrowserProvider } from "./model-provider";

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

  override focusConnection(): void {
    this.focusCount += 1;
  }

  restoreStoredForTest(): void {
    this.restoreStoredPreferences();
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
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() =>
        JSON.stringify({
          connection: "companion",
          endpoint: "http://127.0.0.1:8790/v1/chat/completions",
          model: "saved-local",
          reasoningEffort: "low",
        }),
      ),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    });
    const panel = new TestModelProviderSettings();
    expect(panel.rootForTest()).toBe(panel);
    expect(panel.value.reasoningEffort).toBe("none");
    panel.restoreStoredForTest();
    expect(panel.value).toEqual({
      connection: "companion",
      endpoint: "http://127.0.0.1:8790/v1/chat/completions",
      model: "saved-local",
      reasoningEffort: "low",
    });
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns browser-local preference restoration and persistence", () => {
    const stored = new Map([
      [
        "kirjolab:model-preferences",
        JSON.stringify({
          connection: "companion",
          endpoint: "http://127.0.0.1:8790/v1/chat/completions",
          model: "stored-local",
          reasoningEffort: "medium",
        }),
      ],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => stored.get(key) ?? null),
      removeItem: vi.fn((key: string) => stored.delete(key)),
      setItem: vi.fn((key: string, value: string) => stored.set(key, value)),
    });
    const panel = new TestModelProviderSettings();

    panel.restoreStoredForTest();
    expect(panel.value.model).toBe("stored-local");
    panel.changeForTest("model", "updated-local");

    expect(JSON.parse(stored.get("kirjolab:model-preferences") ?? "null")).toMatchObject({
      connection: "companion",
      model: "updated-local",
      reasoningEffort: "medium",
    });

    stored.set("kirjolab:model-preferences", "{");
    panel.restoreStoredForTest();
    expect(localStorage.removeItem).toHaveBeenCalledWith("kirjolab:model-preferences");
  });

  it("normalizes changes and emits status intents", () => {
    const panel = new TestModelProviderSettings();
    const statuses: Array<string | null> = [];
    panel.addEventListener(modelProviderChangeEvent, (event) => {
      statuses.push((event as CustomEvent<string | null>).detail);
    });

    panel.changeForTest("connection", "companion");
    panel.changeForTest("endpoint", "http://127.0.0.1:9999/v1/chat/completions");
    panel.changeForTest("model", "qwen-local");
    panel.changeForTest("reasoning", "invalid");
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
    expect(panel.provider()).toBeInstanceOf(OpenAICompatibleBrowserProvider);
  });

  it("owns successful model discovery and ignores overlapping requests", async () => {
    const panel = new TestModelProviderSettings();
    const statuses: Array<string | null> = [];
    panel.addEventListener(modelProviderChangeEvent, (event) => {
      statuses.push((event as CustomEvent<string | null>).detail);
    });
    let resolveModels: (models: readonly string[]) => void = () => undefined;
    const discovery = vi.fn(
      async () =>
        await new Promise<readonly string[]>((resolve) => {
          resolveModels = resolve;
        }),
    );

    const pending = panel.discoverModels(discovery);
    const overlapping = panel.discoverModels(discovery);
    expect(panel.discoveryBusy).toBe(true);
    expect(statuses).toEqual(["Checking the local provider for loaded models…"]);
    resolveModels([" qwen/local ", "qwen/local", "gemma/local"]);
    await Promise.all([pending, overlapping]);

    expect(discovery).toHaveBeenCalledOnce();
    expect(panel.discoveryBusy).toBe(false);
    expect(panel.value.model).toBe("qwen/local");
    expect(statuses.at(-1)).toBe("Found 3 loaded models. Using qwen/local.");
  });

  it("owns discovery failures and clears busy state", async () => {
    const panel = new TestModelProviderSettings();
    const statuses: Array<string | null> = [];
    panel.addEventListener(modelProviderChangeEvent, (event) => {
      statuses.push((event as CustomEvent<string | null>).detail);
    });

    await panel.discoverModels(async () => {
      throw new Error("Provider unavailable");
    });

    expect(panel.discoveryBusy).toBe(false);
    expect(statuses).toEqual(["Checking the local provider for loaded models…", "Provider unavailable"]);
  });

  it("honors coordinator discovery availability", async () => {
    const panel = new TestModelProviderSettings();
    const discovery = vi.fn(async () => ["qwen/local"]);
    panel.setDiscoveryAvailable(false);

    await panel.discoverModels(discovery);

    expect(discovery).not.toHaveBeenCalled();
    expect(panel.discoveryBusy).toBe(false);
    expect(panel.renderForTest()).toBeDefined();
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

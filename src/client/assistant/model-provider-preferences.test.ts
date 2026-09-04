import { describe, expect, it, vi } from "vitest";
import {
  initialModelProviderPreferences,
  modelPreferencesStorageKey,
  persistModelProviderPreferences,
  readStoredModelProviderPreferences,
  sessionCodexTokenStorageKey,
} from "./model-provider-preferences";

describe("model provider preferences", () => {
  it("restores the durable connection separately from the tab-scoped Codex token", () => {
    const local = storage({
      [modelPreferencesStorageKey]: JSON.stringify({
        connection: "codex",
        endpoint: "http://127.0.0.1:8790/v1/chat/completions",
        model: "gpt-5.6-terra",
        reasoningEffort: "medium",
        codexToken: "must-not-be-restored-from-local-storage",
      }),
    });
    const session = storage({ [sessionCodexTokenStorageKey]: "tab-only-token-with-at-least-24-chars" });

    expect(readStoredModelProviderPreferences(local, session)).toEqual({
      connection: "codex",
      endpoint: "http://127.0.0.1:8790/v1/chat/completions",
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      codexToken: "tab-only-token-with-at-least-24-chars",
    });
  });

  it("never persists the Codex token to local storage", () => {
    const local = storage();
    const session = storage();
    persistModelProviderPreferences(
      {
        connection: "codex",
        endpoint: "http://127.0.0.1:8790/v1/chat/completions",
        model: "gpt-5.6-terra",
        reasoningEffort: "none",
        codexToken: "tab-only-token-with-at-least-24-chars",
      },
      local,
      session,
    );

    expect(local.setItem).toHaveBeenCalledOnce();
    expect(String(local.setItem.mock.calls[0]?.[1])).not.toContain("tab-only-token");
    expect(session.setItem).toHaveBeenCalledWith(sessionCodexTokenStorageKey, "tab-only-token-with-at-least-24-chars");
  });

  it("falls back safely and removes malformed durable preferences", () => {
    const local = storage({ [modelPreferencesStorageKey]: "{" });
    expect(readStoredModelProviderPreferences(local, storage())).toEqual(initialModelProviderPreferences);
    expect(local.removeItem).toHaveBeenCalledWith(modelPreferencesStorageKey);
  });
});

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

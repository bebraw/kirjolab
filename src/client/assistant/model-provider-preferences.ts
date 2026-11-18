import * as v from "valibot";

import type { ModelReasoningEffort } from "./model-provider";

export type ModelProviderConnection = "codex" | "companion" | "direct";

export interface ModelProviderPreferences {
  readonly connection: ModelProviderConnection;
  readonly endpoint: string;
  readonly model: string;
  readonly reasoningEffort: ModelReasoningEffort;
  readonly codexToken: string;
  readonly companionToken?: string;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  removeItem(key: string): unknown;
  setItem(key: string, value: string): unknown;
}

export const directModelEndpoint = "http://127.0.0.1:1234/v1/chat/completions";
export const companionModelEndpoint = "http://127.0.0.1:8790/v1/chat/completions";
export const modelPreferencesStorageKey = "kirjolab:model-preferences";
export const sessionCodexTokenStorageKey = "kirjolab:codex-companion-token";
const sessionGatewayTokenStorageKey = "kirjolab:gateway-companion-token";

export const initialModelProviderPreferences: ModelProviderPreferences = {
  connection: "direct",
  endpoint: directModelEndpoint,
  model: "",
  reasoningEffort: "none",
  codexToken: "",
};

const storedPreferencesSchema = v.object({
  connection: v.fallback(v.picklist(["codex", "companion", "direct"]), initialModelProviderPreferences.connection),
  endpoint: v.fallback(v.pipe(v.string(), v.maxLength(2_048)), initialModelProviderPreferences.endpoint),
  model: v.fallback(v.pipe(v.string(), v.maxLength(256)), initialModelProviderPreferences.model),
  reasoningEffort: v.fallback(
    v.picklist(["provider-default", "none", "low", "medium", "high"]),
    initialModelProviderPreferences.reasoningEffort,
  ),
});

export function readStoredModelProviderPreferences(
  persistentStorage: PreferenceStorage | null = availableStorage("localStorage"),
  sessionStorage: PreferenceStorage | null = availableStorage("sessionStorage"),
): ModelProviderPreferences {
  let stored = initialModelProviderPreferences;
  if (persistentStorage) {
    try {
      const parsed = v.safeParse(storedPreferencesSchema, JSON.parse(persistentStorage.getItem(modelPreferencesStorageKey) ?? "null"));
      if (parsed.success) stored = { ...parsed.output, codexToken: "" };
    } catch {
      persistentStorage.removeItem(modelPreferencesStorageKey);
    }
  }
  const codexToken = readSessionToken(sessionStorage, sessionCodexTokenStorageKey);
  const companionToken = readSessionToken(sessionStorage, sessionGatewayTokenStorageKey);
  return { ...stored, codexToken, ...(companionToken ? { companionToken } : {}) };
}

export function persistModelProviderPreferences(
  preferences: ModelProviderPreferences,
  persistentStorage: PreferenceStorage | null = availableStorage("localStorage"),
  sessionStorage: PreferenceStorage | null = availableStorage("sessionStorage"),
): void {
  if (persistentStorage) {
    try {
      const { codexToken: _codexToken, companionToken: _companionToken, ...durable } = preferences;
      persistentStorage.setItem(modelPreferencesStorageKey, JSON.stringify(durable));
    } catch {
      // Preferences remain usable for this page when durable storage is unavailable.
    }
  }
  if (sessionStorage) {
    try {
      if (preferences.codexToken) sessionStorage.setItem(sessionCodexTokenStorageKey, preferences.codexToken);
      else sessionStorage.removeItem(sessionCodexTokenStorageKey);
      if (preferences.companionToken) sessionStorage.setItem(sessionGatewayTokenStorageKey, preferences.companionToken);
      else sessionStorage.removeItem(sessionGatewayTokenStorageKey);
    } catch {
      // The token remains usable for this page when tab storage is unavailable.
    }
  }
}

export function modelCompanionToken(preferences: ModelProviderPreferences): string | undefined {
  if (preferences.connection === "codex") return preferences.codexToken;
  if (preferences.connection === "companion") return preferences.companionToken || undefined;
  return undefined;
}

function readSessionToken(storage: PreferenceStorage | null, key: string): string {
  try {
    const candidate = storage?.getItem(key) ?? "";
    return /^[\x21-\x7e]{24,512}$/u.test(candidate) ? candidate : "";
  } catch {
    return "";
  }
}

function availableStorage(name: "localStorage" | "sessionStorage"): PreferenceStorage | null {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    if (descriptor && "value" in descriptor) return descriptor.value as PreferenceStorage;
    if (typeof window === "undefined") return null;
    return globalThis[name];
  } catch {
    return null;
  }
}

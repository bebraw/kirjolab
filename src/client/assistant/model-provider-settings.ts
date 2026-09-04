import { html, type TemplateResult } from "lit";

import { LightDomElement } from "../platform/light-dom-controller";
import {
  companionModelEndpoint,
  directModelEndpoint,
  initialModelProviderPreferences,
  persistModelProviderPreferences,
  readStoredModelProviderPreferences,
  type ModelProviderConnection,
  type ModelProviderPreferences,
} from "./model-provider-preferences";
import {
  discoverOpenAICompatibleModels,
  OpenAICompatibleBrowserProvider,
  type ModelDiscoveryOptions,
  type ModelReasoningEffort,
} from "./model-provider";

export type { ModelProviderPreferences } from "./model-provider-preferences";

export const modelProviderChangeEvent = "model-provider-change";

export class ModelProviderSettings extends LightDomElement {
  static override properties = {
    busy: { state: true },
    discoveryAvailable: { state: true },
    models: { state: true },
    preferences: { state: true },
    status: { state: true },
  };

  declare private busy: boolean;
  declare private discoveryAvailable: boolean;
  declare private models: readonly string[];
  declare private preferences: ModelProviderPreferences;
  declare private status: string;

  constructor() {
    super();
    this.busy = false;
    this.discoveryAvailable = true;
    this.models = [];
    this.preferences = initialModelProviderPreferences;
    this.status = "Connection details stay on this device.";
  }

  get value(): ModelProviderPreferences {
    return this.preferences;
  }

  get discoveryBusy(): boolean {
    return this.busy;
  }

  provider(): OpenAICompatibleBrowserProvider {
    const usesCodex = this.preferences.connection === "codex";
    return new OpenAICompatibleBrowserProvider({
      endpoint: this.preferences.endpoint,
      model: this.preferences.model,
      providerLabel:
        this.preferences.connection === "codex"
          ? "Codex via local companion"
          : this.preferences.connection === "companion"
            ? "Local companion · OpenAI-compatible"
            : "Browser-local OpenAI-compatible",
      reasoningEffort: this.preferences.reasoningEffort,
      ...(usesCodex ? { bearerToken: this.preferences.codexToken, temperature: 0 } : {}),
    });
  }

  setDiscoveryAvailable(available: boolean): void {
    this.discoveryAvailable = available;
  }

  async discoverModels(
    discover: (endpoint: string, options?: ModelDiscoveryOptions) => Promise<readonly string[]> = discoverOpenAICompatibleModels,
  ): Promise<void> {
    if (this.busy || !this.discoveryAvailable) return;
    this.busy = true;
    this.status = "Checking the local provider for loaded models…";
    this.emitChange(this.status);
    try {
      const selectedModel = this.preferences.model.trim();
      const models = await discover(
        this.preferences.endpoint,
        this.preferences.connection === "codex" ? { bearerToken: this.preferences.codexToken } : {},
      );
      this.setModels(models, models.includes(selectedModel) ? selectedModel : (models[0] ?? selectedModel));
      this.status = models.length
        ? `Found ${models.length} loaded model${models.length === 1 ? "" : "s"}. Using ${this.preferences.model}.`
        : "The local provider is reachable but reports no loaded models.";
    } catch (error) {
      this.status = error instanceof Error ? error.message : "Could not discover models from the local provider.";
    } finally {
      this.busy = false;
      this.emitChange(this.status);
    }
  }

  private setModels(models: readonly string[], selectedModel: string): void {
    const selected = selectedModel.trim();
    this.models = [...new Set(models.map((model) => model.trim()).filter(Boolean))];
    const options = this.modelOptions(selected);
    this.preferences = {
      ...this.preferences,
      model: options.includes(selected) ? selected : (options[0] ?? ""),
    };
  }

  focusConnection(): void {
    void this.updateComplete.then(() => this.select("llm-connection").focus());
  }

  open(): void {
    const menu = this.closest("details");
    if (!(menu instanceof HTMLDetailsElement)) throw new Error("Model provider settings require a details parent");
    menu.open = true;
    this.focusConnection();
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) {
      this.restoreStoredPreferences();
    }
    super.connectedCallback();
  }

  protected override render(): TemplateResult {
    const options = this.modelOptions(this.preferences.model);
    return html`
      <section class="preferences-model" aria-labelledby="model-preference-heading">
        <div>
          <h3 id="model-preference-heading">Writing model</h3>
          <p>Configure the OpenAI-compatible connection used by Writing assistant.</p>
        </div>
        <div class="preferences-model-grid">
          <label class="field-label"
            >Connection
            <select class="field" id="llm-connection" .value=${this.preferences.connection} @change=${this.changeConnection}>
              <option value="direct">Direct browser connection</option>
              <option value="companion">Local companion</option>
              <option value="codex">Codex via local companion</option>
            </select>
          </label>
          ${
            this.preferences.connection === "codex"
              ? html`<label class="field-label preferences-endpoint"
                  >Companion token
                  <input
                    class="field"
                    id="llm-codex-token"
                    type="password"
                    autocomplete="off"
                    spellcheck="false"
                    .value=${this.preferences.codexToken}
                    @input=${this.changeCodexToken}
                  />
                </label>`
              : null
          }
          <label class="field-label preferences-endpoint"
            >Endpoint
            <input class="field" id="llm-endpoint" type="url" .value=${this.preferences.endpoint} @input=${this.changeEndpoint} />
          </label>
          <label class="field-label"
            >Model
            <select class="field" id="llm-model" .value=${this.preferences.model} @change=${this.changeModel}>
              ${
                options.length
                  ? options.map((model) => html`<option value=${model}>${this.models.length ? model : `${model} · saved`}</option>`)
                  : html`<option value="">Find loaded models</option>`
              }
            </select>
          </label>
          <label class="field-label"
            >Reasoning
            <select
              class="field"
              id="llm-reasoning-effort"
              .value=${this.preferences.reasoningEffort}
              @change=${this.changeReasoningEffort}
            >
              <option value="none">Off · fastest</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="provider-default">Provider default</option>
            </select>
          </label>
          <button
            class="button-secondary justify-center"
            id="discover-llm-models"
            type="button"
            ?disabled=${this.busy || !this.discoveryAvailable}
            @click=${this.discover}
          >
            ${this.busy ? "Finding models…" : "Find loaded models"}
          </button>
        </div>
        ${
          this.preferences.connection === "codex"
            ? html`<p class="preferences-model-status">
                Codex authentication stays local, but the selected passage, instruction, and evidence are sent to OpenAI. The companion
                token stays only in this tab session.
              </p>`
            : null
        }
        <p class="preferences-model-status ui-status" id="preferences-model-status" role="status" aria-live="polite">${this.status}</p>
      </section>
    `;
  }

  protected changeConnection(event: Event): void {
    const connection = readConnection(controlValue(event));
    this.preferences = {
      ...this.preferences,
      connection,
      endpoint: connection === "direct" ? directModelEndpoint : companionModelEndpoint,
    };
    const status =
      connection === "codex"
        ? "Codex uses the local companion; selected writing inputs will be sent to OpenAI."
        : connection === "companion"
          ? "The local companion starts with npm run dev; select manuscript text and grounding evidence."
          : "The browser will contact the configured loopback provider directly.";
    this.status = status;
    this.emitChange(status);
  }

  protected changeEndpoint(event: Event): void {
    this.preferences = { ...this.preferences, endpoint: controlValue(event) };
    this.emitChange();
  }

  protected changeModel(event: Event): void {
    const model = controlValue(event);
    this.preferences = { ...this.preferences, model };
    const status = model ? `Using ${model} for new writing assistant requests.` : "Find a loaded model before using Writing assistant.";
    this.status = status;
    this.emitChange(status);
  }

  protected changeReasoningEffort(event: Event): void {
    this.preferences = { ...this.preferences, reasoningEffort: readModelReasoningEffort(controlValue(event)) };
    this.emitChange();
  }

  protected changeCodexToken(event: Event): void {
    this.preferences = { ...this.preferences, codexToken: controlValue(event).slice(0, 512) };
    this.emitChange();
  }

  protected discover(): void {
    void this.discoverModels();
  }

  private emitChange(status: string | null = null): void {
    this.persistPreferences();
    this.dispatchEvent(new CustomEvent<string | null>(modelProviderChangeEvent, { bubbles: true, detail: status }));
  }

  protected restoreStoredPreferences(): void {
    const stored = readStoredModelProviderPreferences();
    this.preferences = stored;
    this.setModels([], stored.model);
  }

  private persistPreferences(): void {
    persistModelProviderPreferences(this.preferences);
  }

  private modelOptions(selected: string): readonly string[] {
    return this.models.length === 0 && selected ? [selected] : this.models;
  }

  private select(id: string): HTMLSelectElement {
    const select = this.querySelector<HTMLSelectElement>(`#${id}`);
    if (!select) throw new Error(`Model provider select ${id} is unavailable`);
    return select;
  }
}

function readConnection(value: string): ModelProviderConnection {
  if (value === "codex" || value === "companion") return value;
  return "direct";
}

function controlValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement | HTMLSelectElement).value;
}

function readModelReasoningEffort(value: string): ModelReasoningEffort {
  if (value === "none" || value === "low" || value === "medium" || value === "high") return value;
  return "provider-default";
}

if (typeof customElements !== "undefined" && !customElements.get("model-provider-settings")) {
  customElements.define("model-provider-settings", ModelProviderSettings);
}

declare global {
  interface HTMLElementTagNameMap {
    "model-provider-settings": ModelProviderSettings;
  }
}

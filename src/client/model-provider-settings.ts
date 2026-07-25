import { html, LitElement, type TemplateResult } from "lit";
import type { ModelReasoningEffort } from "./model-provider";

export const modelProviderChangeEvent = "model-provider-change";
export const modelProviderDiscoveryEvent = "model-provider-discovery";

export interface ModelProviderPreferences {
  readonly connection: "companion" | "direct";
  readonly endpoint: string;
  readonly model: string;
  readonly reasoningEffort: ModelReasoningEffort;
}

const directEndpoint = "http://127.0.0.1:1234/v1/chat/completions";
const companionEndpoint = "http://127.0.0.1:8790/v1/chat/completions";

const initialPreferences: ModelProviderPreferences = {
  connection: "direct",
  endpoint: directEndpoint,
  model: "",
  reasoningEffort: "none",
};

export class ModelProviderSettings extends LitElement {
  static override properties = {
    busy: { state: true },
    models: { state: true },
    preferences: { state: true },
    status: { state: true },
  };

  declare private busy: boolean;
  declare private models: readonly string[];
  declare private preferences: ModelProviderPreferences;
  declare private status: string;

  constructor() {
    super();
    this.busy = false;
    this.models = [];
    this.preferences = initialPreferences;
    this.status = "Connection details stay on this device.";
  }

  get value(): ModelProviderPreferences {
    return this.preferences;
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
  }

  setModels(models: readonly string[], selectedModel: string): void {
    const selected = selectedModel.trim();
    this.models = [...new Set(models.map((model) => model.trim()).filter(Boolean))];
    const options = this.modelOptions(selected);
    this.preferences = {
      ...this.preferences,
      model: options.includes(selected) ? selected : (options[0] ?? ""),
    };
  }

  setStatus(status: string): void {
    this.status = status;
  }

  restore(stored: Record<string, unknown>): void {
    const connection =
      stored.connection === "direct" || stored.connection === "companion" ? stored.connection : this.preferences.connection;
    const endpoint = typeof stored.endpoint === "string" && stored.endpoint.length <= 2_048 ? stored.endpoint : this.preferences.endpoint;
    const model = typeof stored.model === "string" && stored.model.length <= 256 ? stored.model : this.preferences.model;
    const reasoningEffort =
      typeof stored.reasoningEffort === "string" ? readModelReasoningEffort(stored.reasoningEffort) : this.preferences.reasoningEffort;
    this.preferences = { connection, endpoint, model, reasoningEffort };
    this.setModels([], model);
  }

  focusConnection(): void {
    void this.updateComplete.then(() => this.select("llm-connection").focus());
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const options = this.modelOptions(this.preferences.model);
    return html`
      <section class="preferences-model" aria-labelledby="model-preference-heading">
        <div>
          <h3 id="model-preference-heading">Local model</h3>
          <p>Configure the OpenAI-compatible connection used by Writing assistant.</p>
        </div>
        <div class="preferences-model-grid">
          <label class="field-label"
            >Connection
            <select class="field" id="llm-connection" .value=${this.preferences.connection} @change=${this.changeConnection}>
              <option value="direct">Direct browser connection</option>
              <option value="companion">Local companion</option>
            </select>
          </label>
          <label class="field-label preferences-endpoint"
            >Endpoint
            <input class="field" id="llm-endpoint" type="url" .value=${this.preferences.endpoint} @input=${this.changeEndpoint} />
          </label>
          <label class="field-label"
            >Model
            <select class="field" id="llm-model" .value=${this.preferences.model} @change=${this.changeModel}>
              ${options.length
                ? options.map((model) => html`<option value=${model}>${this.models.length ? model : `${model} · saved`}</option>`)
                : html`<option value="">Find loaded models</option>`}
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
            ?disabled=${this.busy}
            @click=${this.discover}
          >
            ${this.busy ? "Finding models…" : "Find loaded models"}
          </button>
        </div>
        <p class="preferences-model-status ui-status" id="preferences-model-status" role="status" aria-live="polite">${this.status}</p>
      </section>
    `;
  }

  protected changeConnection(event: Event): void {
    const connection = controlValue(event) === "companion" ? "companion" : "direct";
    this.preferences = {
      ...this.preferences,
      connection,
      endpoint: connection === "companion" ? companionEndpoint : directEndpoint,
    };
    const status =
      connection === "companion"
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

  protected discover(): void {
    if (!this.busy) this.dispatchEvent(new CustomEvent(modelProviderDiscoveryEvent, { bubbles: true }));
  }

  private emitChange(status: string | null = null): void {
    this.dispatchEvent(new CustomEvent<string | null>(modelProviderChangeEvent, { bubbles: true, detail: status }));
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

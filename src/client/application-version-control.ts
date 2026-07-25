import { html, LitElement, type TemplateResult } from "lit";

export const applicationVersionNoticeEvent = "application-version-notice";

export class ApplicationVersionControl extends LitElement {
  static override properties = { version: { state: true } };

  declare private version: string;

  constructor() {
    super();
    this.version = "Loading…";
  }

  setVersion(version: string): void {
    this.version = version;
  }

  protected async copyVersion(): Promise<void> {
    try {
      await copyText(this.version);
      this.notice(`Copied application version ${this.version}.`);
    } catch {
      this.notice("Could not copy the application version");
    }
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`<button
      class="application-version-copy"
      id="copy-application-version"
      type="button"
      aria-label="Copy application version"
      @click=${this.copyVersion}
    >
      <code id="application-version">${this.version}</code><span>Copy</span>
    </button>`;
  }

  private notice(detail: string): void {
    this.dispatchEvent(new CustomEvent<string>(applicationVersionNoticeEvent, { bubbles: true, composed: true, detail }));
  }
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(value);
    if (navigator.clipboard) return;
  } catch {
    // Fall back when clipboard permission is unavailable in a browser or installed PWA.
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.readOnly = true;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}

if (typeof customElements !== "undefined" && !customElements.get("application-version-control")) {
  customElements.define("application-version-control", ApplicationVersionControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "application-version-control": ApplicationVersionControl;
  }
}

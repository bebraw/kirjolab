import { html, LitElement, type TemplateResult } from "lit";
import { applicationVersion, cacheOfflineNavigation, registerOfflineServiceWorker } from "./offline-service-worker";

export interface OfflineShellBinding {
  readonly persist: () => Promise<void>;
  readonly pinUpdate: (refresh: () => void) => void;
}

export class ApplicationVersionControl extends LitElement {
  static override properties = { version: { state: true } };

  declare private version: string;
  private presentNotice: ((message: string) => void) | null = null;

  constructor() {
    super();
    this.version = applicationVersion;
  }

  setVersion(version: string): void {
    this.version = version;
  }

  bindNotice(presentNotice: (message: string) => void): void {
    this.presentNotice = presentNotice;
  }

  async prepareOfflineShell(workspace: boolean, binding: OfflineShellBinding): Promise<void> {
    try {
      const registered = await registerOfflineServiceWorker(navigator.serviceWorker, () => {
        binding.pinUpdate(() => void binding.persist().finally(() => location.reload()));
      });
      if (!registered || !workspace || typeof caches === "undefined") return;
      if (await cacheOfflineNavigation(caches, fetch, location.href)) document.body.dataset.offlineReady = "true";
    } catch {
      // The online application remains fully usable when offline APIs are unavailable.
    }
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
    this.presentNotice?.(detail);
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

import { html, LitElement, nothing, type TemplateResult } from "lit";

export const appToastActionEvent = "kirjolab-app-toast-action";
export const appToastDismissEvent = "kirjolab-app-toast-dismiss";

export interface AppToastOptions {
  readonly actionLabel?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly persistent?: boolean | undefined;
}

interface AppToastNotice extends AppToastOptions {
  readonly message: string;
}

export class AppToast extends LitElement {
  static override properties = { notice: { state: true } };

  declare private notice: AppToastNotice | null;
  #timer: number | undefined;
  #actionAvailable = false;

  constructor() {
    super();
    this.notice = null;
  }

  show(message: string, options: AppToastOptions = {}): void {
    window.clearTimeout(this.#timer);
    this.notice = { ...options, message };
    this.#actionAvailable = Boolean(options.actionLabel);
    this.dataset.visible = "true";
    this.#present();
    if (options.persistent) return;
    this.#timer = window.setTimeout(() => this.#dismiss(), options.durationMs ?? 3_200);
  }

  protected emitAction(): void {
    if (!this.#actionAvailable) return;
    this.#actionAvailable = false;
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent(appToastActionEvent, { bubbles: true, composed: true }));
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const notice = this.notice;
    if (!notice) return html``;
    return html`<span>${notice.message}</span>${notice.actionLabel
        ? html`<button class="toast-action" type="button" ?disabled=${!this.#actionAvailable} @click=${this.emitAction}>
            ${notice.actionLabel}
          </button>`
        : nothing}`;
  }

  #dismiss(): void {
    delete this.dataset.visible;
    if (this.matches(":popover-open")) this.hidePopover();
    this.dispatchEvent(new CustomEvent(appToastDismissEvent, { bubbles: true, composed: true }));
  }

  #present(): void {
    const modal = document.querySelector<HTMLDialogElement>("dialog:modal");
    if (modal) {
      if (this.matches(":popover-open")) this.hidePopover();
      this.removeAttribute("popover");
      modal.append(this);
      modal.addEventListener(
        "close",
        () => {
          if (!this.dataset.visible || this.closest("dialog") !== modal) return;
          document.body.append(this);
          this.setAttribute("popover", "manual");
          this.showPopover();
        },
        { once: true },
      );
      return;
    }
    if (this.parentElement !== document.body) document.body.append(this);
    this.setAttribute("popover", "manual");
    if (!this.matches(":popover-open")) this.showPopover();
  }
}

if (typeof customElements !== "undefined" && !customElements.get("app-toast")) customElements.define("app-toast", AppToast);

declare global {
  interface HTMLElementTagNameMap {
    "app-toast": AppToast;
  }
}

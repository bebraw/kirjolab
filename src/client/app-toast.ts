import { html, nothing, type TemplateResult } from "lit";
import { LightDomElement } from "./light-dom-controller";

export const appToastActionEvent = "kirjolab-app-toast-action";
export const appToastDismissEvent = "kirjolab-app-toast-dismiss";

export interface AppToastOptions {
  readonly action?: (() => void) | undefined;
  readonly actionLabel?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly persistent?: boolean | undefined;
}

interface AppToastNotice extends AppToastOptions {
  readonly message: string;
}

export class AppToast extends LightDomElement {
  static override properties = { notice: { state: true } };

  declare private notice: AppToastNotice | null;
  #timer: number | undefined;
  #actionAvailable = false;
  #pinnedNotice: AppToastNotice | null = null;

  constructor() {
    super();
    this.notice = null;
  }

  show(message: string, options: AppToastOptions = {}): void {
    this.#showNotice({ ...options, message });
  }

  pin(message: string, options: AppToastOptions): void {
    this.#pinnedNotice = { ...options, message, persistent: true };
    this.#showNotice(this.#pinnedNotice);
  }

  #showNotice(notice: AppToastNotice): void {
    window.clearTimeout(this.#timer);
    this.notice = notice;
    this.#actionAvailable = Boolean(notice.actionLabel);
    this.dataset.visible = "true";
    this.#present();
    if (notice.persistent) return;
    this.#timer = window.setTimeout(() => this.#dismiss(), notice.durationMs ?? 3_200);
  }

  protected emitAction(): void {
    if (!this.#actionAvailable) return;
    this.#actionAvailable = false;
    this.requestUpdate();
    this.notice?.action?.();
    this.dispatchEvent(new CustomEvent(appToastActionEvent, { bubbles: true, composed: true }));
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
    const pinned = this.#pinnedNotice;
    if (pinned && this.notice !== pinned) {
      this.#showNotice(pinned);
      this.dispatchEvent(new CustomEvent(appToastDismissEvent, { bubbles: true, composed: true }));
      return;
    }
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

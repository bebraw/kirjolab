import { html, LitElement, type TemplateResult } from "lit";
import { previewNavigationPresentation, previewNavigationStorageKey, storedPreviewNavigationHidden } from "./preview-navigation";

export class PreviewNavigationControl extends LitElement {
  private toggleButton: HTMLButtonElement | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.connectToggle();
    this.restoreButton()?.addEventListener("click", this.showNavigation);
    this.restoreNavigation();
  }

  override disconnectedCallback(): void {
    this.toggleButton?.removeEventListener("click", this.toggleNavigation);
    this.restoreButton()?.removeEventListener("click", this.showNavigation);
    this.toggleButton = null;
    super.disconnectedCallback();
  }

  protected override render(): TemplateResult {
    return html`<slot></slot>`;
  }

  setPreviewActive(active: boolean): void {
    if (this.toggleButton) this.toggleButton.hidden = !this.libraryMode && !active;
  }

  protected connectToggle(): void {
    this.toggleButton = document.querySelector<HTMLButtonElement>("#toggle-preview-navigation");
    this.toggleButton?.addEventListener("click", this.toggleNavigation);
  }

  protected restoreNavigation(): void {
    let hidden = false;
    try {
      hidden = storedPreviewNavigationHidden(localStorage.getItem(previewNavigationStorageKey));
    } catch {
      // Browser storage can be unavailable in restricted browsing modes.
    }
    this.setHidden(hidden, false);
  }

  protected readonly toggleNavigation = (): void => {
    const hidden = document.body.dataset.previewNavigation !== "hidden";
    this.setHidden(hidden);
    if (hidden && this.libraryMode) this.restoreButton()?.focus();
  };

  protected readonly showNavigation = (): void => {
    this.setHidden(false);
    this.toggleButton?.focus();
  };

  private setHidden(hidden: boolean, persist = true): void {
    const presentation = previewNavigationPresentation(hidden);
    document.body.dataset.previewNavigation = hidden ? "hidden" : "visible";
    this.toggleButton?.setAttribute("aria-pressed", String(hidden));
    this.toggleButton?.setAttribute("aria-label", presentation.title);
    if (this.toggleButton) this.toggleButton.title = presentation.title;
    const label = this.toggleButton?.querySelector<HTMLElement>("#preview-navigation-toggle-label");
    if (label) label.textContent = presentation.label;
    const restore = this.restoreButton();
    if (restore) restore.hidden = !this.libraryMode || !hidden;
    if (!persist) return;
    try {
      if (hidden) localStorage.setItem(previewNavigationStorageKey, "true");
      else localStorage.removeItem(previewNavigationStorageKey);
    } catch {
      // The visible state still applies when persistence is unavailable.
    }
  }

  private get libraryMode(): boolean {
    return this.getAttribute("app-mode") === "library";
  }

  private restoreButton(): HTMLButtonElement | null {
    return this.querySelector<HTMLButtonElement>("#restore-preview-navigation");
  }
}

if (typeof customElements !== "undefined" && !customElements.get("preview-navigation-control")) {
  customElements.define("preview-navigation-control", PreviewNavigationControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "preview-navigation-control": PreviewNavigationControl;
  }
}

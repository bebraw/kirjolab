import { nothing, type TemplateResult } from "lit";
import { LightDomHost } from "../platform/light-dom-controller";

export class ActionMenuController extends LightDomHost {
  protected get menuDocument(): Document {
    return this.ownerDocument;
  }

  protected readonly closeFromClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    for (const menu of this.menuDocument.querySelectorAll<HTMLDetailsElement>("details[data-action-menu][open]")) {
      if (!menu.contains(event.target) || event.target.closest("button, a")) menu.open = false;
    }
    const settings = this.menuDocument.querySelector<HTMLDetailsElement>("details[data-settings-menu][open]");
    if (settings && !settings.contains(event.target)) settings.open = false;
  };

  protected readonly closeFromKeyboard = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    const menus = this.menuDocument.querySelectorAll<HTMLDetailsElement>(
      "details[data-action-menu][open], details[data-settings-menu][open]",
    );
    const menu = Array.from(menus).at(-1);
    if (!menu) return;
    menu.open = false;
    menu.querySelector<HTMLElement>("summary")?.focus();
    event.preventDefault();
  };

  override connectedCallback(): void {
    super.connectedCallback();
    this.menuDocument.addEventListener("click", this.closeFromClick);
    this.menuDocument.addEventListener("keydown", this.closeFromKeyboard);
  }

  override disconnectedCallback(): void {
    this.menuDocument.removeEventListener("click", this.closeFromClick);
    this.menuDocument.removeEventListener("keydown", this.closeFromKeyboard);
    super.disconnectedCallback();
  }

  protected override render(): TemplateResult | typeof nothing {
    return nothing;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("action-menu-controller")) {
  customElements.define("action-menu-controller", ActionMenuController);
}

declare global {
  interface HTMLElementTagNameMap {
    "action-menu-controller": ActionMenuController;
  }
}

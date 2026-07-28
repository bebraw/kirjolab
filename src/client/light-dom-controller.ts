import { html, LitElement, type TemplateResult } from "lit";

export abstract class LightDomElement extends LitElement {
  override connectedCallback(): void {
    if (!this.hasUpdated && typeof this.replaceChildren === "function") this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }
}

export abstract class LightDomController extends LightDomElement {
  protected override render(): TemplateResult {
    return html``;
  }

  protected element<T extends HTMLElement>(id: string, constructor: abstract new () => T): T | null {
    const element = this.ownerDocument.getElementById(id);
    return element instanceof constructor ? element : null;
  }
}

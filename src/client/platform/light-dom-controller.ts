import { html, LitElement, type TemplateResult } from "lit";

export abstract class LightDomHost extends LitElement {
  protected override createRenderRoot(): HTMLElement {
    return this;
  }
}

export abstract class LightDomElement extends LightDomHost {
  override connectedCallback(): void {
    if (!this.hasUpdated && typeof this.replaceChildren === "function") this.replaceChildren();
    super.connectedCallback();
  }

  protected requiredElement<T extends Element>(selector: string, label: string): T {
    const element = this.querySelector<T>(selector);
    if (!element) throw new Error(`${label} is unavailable`);
    return element;
  }
}

export abstract class EagerLightDomElement extends LightDomHost {
  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.hasUpdated && typeof this.replaceChildren === "function") {
      this.replaceChildren();
      this.performUpdate();
    }
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

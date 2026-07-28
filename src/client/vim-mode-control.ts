import { html, type TemplateResult } from "lit";

import { LightDomElement } from "./light-dom-controller";
import { createVimSession, handleVimKey, visualVimSession, type VimSession } from "./vim-keybindings";

const storageKey = "kirjolab:vim-keybindings";
type VimCommand = ReturnType<typeof handleVimKey>;

export class VimModeControl extends LightDomElement {
  static override properties = { enabled: { state: true } };

  declare private enabled: boolean;
  private session: VimSession;
  private shell: HTMLElement | undefined;
  private textarea: HTMLTextAreaElement | undefined;

  constructor() {
    super();
    this.enabled = false;
    this.session = createVimSession();
  }

  bindEditor(textarea: HTMLTextAreaElement, shell: HTMLElement): void {
    this.unbindEditor();
    this.textarea = textarea;
    this.shell = shell;
    this.enabled = localStorage.getItem(storageKey) === "true";
    textarea.addEventListener("keydown", this.handleKey);
    textarea.addEventListener("mouseup", this.handleMouseUp);
    this.renderMode();
  }

  protected toggle(): void {
    this.enabled = !this.enabled;
    localStorage.setItem(storageKey, String(this.enabled));
    this.session = createVimSession();
    if (this.enabled && this.textarea) {
      this.textarea.focus();
      this.textarea.setSelectionRange(this.textarea.selectionStart, this.textarea.selectionStart);
    }
    this.renderMode();
  }

  override disconnectedCallback(): void {
    this.unbindEditor();
    super.disconnectedCallback();
  }

  protected override render(): TemplateResult {
    return html`<button
      class="preference-toggle"
      id="vim-toggle"
      type="button"
      aria-pressed=${String(this.enabled)}
      title=${this.enabled ? "Disable Vim keybindings" : "Enable Vim keybindings"}
      @click=${this.toggle}
    >
      <span>Vim mode</span>
      <span class="editor-mode-status" id="vim-mode-status" role="status" aria-live="polite" ?hidden=${!this.enabled}
        >${this.session.mode.toUpperCase()}</span
      >
    </button>`;
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    if (!this.textarea) return;
    const key = vimCommandKey(event, this.enabled);
    if (!key) return;
    const command = handleVimKey(this.session, this.snapshot(), key);
    if (!command.handled) return;
    event.preventDefault();
    event.stopPropagation();
    this.session = command.session;
    applyVimCommand(this.textarea, command);
    this.renderMode();
  };

  private readonly handleMouseUp = (): void => {
    if (!this.enabled || !this.textarea) return;
    this.session =
      this.textarea.selectionStart === this.textarea.selectionEnd
        ? { ...this.session, mode: "normal", pending: null, count: "" }
        : visualVimSession(this.session);
    this.renderMode();
  };

  private renderMode(): void {
    if (this.shell) this.shell.dataset.vimMode = this.enabled ? this.session.mode : "off";
    this.requestUpdate();
  }

  private snapshot() {
    if (!this.textarea) throw new Error("Vim editor is not bound");
    return {
      value: this.textarea.value,
      selectionStart: this.textarea.selectionStart,
      selectionEnd: this.textarea.selectionEnd,
      selectionDirection: this.textarea.selectionDirection,
    };
  }

  private unbindEditor(): void {
    this.textarea?.removeEventListener("keydown", this.handleKey);
    this.textarea?.removeEventListener("mouseup", this.handleMouseUp);
    this.textarea = undefined;
    this.shell = undefined;
  }
}

function vimCommandKey(event: KeyboardEvent, enabled: boolean): string | null {
  if (!enabled || event.isComposing) return null;
  const controlBracket = event.ctrlKey && !event.altKey && !event.metaKey && event.key === "[";
  if (!controlBracket && (event.altKey || event.ctrlKey || event.metaKey)) return null;
  return controlBracket ? "Ctrl-[" : event.key;
}

function applyVimCommand(textarea: HTMLTextAreaElement, command: VimCommand): void {
  if (command.changed) textarea.value = command.value;
  textarea.setSelectionRange(command.selectionStart, command.selectionEnd, command.selectionDirection);
  if (command.changed) textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
}

if (typeof customElements !== "undefined" && !customElements.get("vim-mode-control")) {
  customElements.define("vim-mode-control", VimModeControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "vim-mode-control": VimModeControl;
  }
}

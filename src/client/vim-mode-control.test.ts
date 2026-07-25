import { afterEach, describe, expect, it, vi } from "vitest";
import { VimModeControl } from "./vim-mode-control";

class FakeElement extends EventTarget {
  readonly dataset: Record<string, string> = {};
  focused = false;

  focus(): void {
    this.focused = true;
  }
}

class FakeTextarea extends FakeElement {
  value = "alpha";
  selectionStart = 1;
  selectionEnd = 1;
  selectionDirection: "forward" | "backward" | "none" = "none";

  setSelectionRange(start: number, end: number, direction: "forward" | "backward" | "none" = "none"): void {
    this.selectionStart = start;
    this.selectionEnd = end;
    this.selectionDirection = direction;
  }
}

class TestInputEvent extends Event {
  readonly inputType: string;

  constructor(type: string, init: InputEventInit = {}) {
    super(type, init);
    this.inputType = init.inputType ?? "";
  }
}

class TestVimModeControl extends VimModeControl {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  toggleForTest(): void {
    this.toggle();
  }
}

function keyboard(key: string, overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return Object.assign(new Event("keydown", { cancelable: true }), {
    altKey: false,
    ctrlKey: false,
    isComposing: false,
    key,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }) as KeyboardEvent;
}

describe("Vim mode control", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("owns stored mode, guarded edits, selection state, and teardown", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("InputEvent", TestInputEvent);
    const textarea = new FakeTextarea();
    const shell = new FakeElement();
    const control = new TestVimModeControl();
    control.bindEditor(textarea as never, shell as never);
    expect(shell.dataset.vimMode).toBe("off");

    control.toggleForTest();
    expect(values.get("kirjolab:vim-keybindings")).toBe("true");
    expect(textarea.focused).toBe(true);
    textarea.dispatchEvent(keyboard("x"));
    expect(textarea.value).toBe("apha");
    textarea.dispatchEvent(keyboard("x", { metaKey: true }));
    textarea.dispatchEvent(keyboard("x", { isComposing: true }));

    textarea.setSelectionRange(0, 2, "forward");
    textarea.dispatchEvent(new Event("mouseup"));
    expect(shell.dataset.vimMode).toBe("visual");
    textarea.setSelectionRange(1, 1);
    textarea.dispatchEvent(new Event("mouseup"));
    expect(shell.dataset.vimMode).toBe("normal");
    expect(control.renderForTest()).toBeDefined();
    expect(control.rootForTest()).toBe(control);

    control.disconnectedCallback();
    textarea.dispatchEvent(keyboard("x"));
    expect(textarea.value).toBe("apha");
  });
});

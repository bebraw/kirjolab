import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionMenuController } from "./action-menu-controller";

class FakeTarget {
  constructor(readonly action = false) {}

  closest(): FakeTarget | null {
    return this.action ? this : null;
  }
}

class FakeSummary {
  focused = false;

  focus(): void {
    this.focused = true;
  }
}

class FakeMenu {
  readonly summary = new FakeSummary();
  readonly inside = new Set<FakeTarget>();
  open = true;

  contains(target: FakeTarget): boolean {
    return this.inside.has(target);
  }

  querySelector(): FakeSummary {
    return this.summary;
  }
}

class FakeMenuDocument extends EventTarget {
  actionMenus: FakeMenu[] = [];
  settingsMenu: FakeMenu | null = null;

  querySelectorAll(selector: string): FakeMenu[] {
    return selector.includes(",") ? [...this.actionMenus, ...(this.settingsMenu ? [this.settingsMenu] : [])] : this.actionMenus;
  }

  querySelector(): FakeMenu | null {
    return this.settingsMenu;
  }
}

class TestActionMenuController extends ActionMenuController {
  constructor(private readonly root: FakeMenuDocument) {
    super();
  }

  protected override get menuDocument(): Document {
    return this.root as never;
  }

  dispatchClick(target: FakeTarget): void {
    const event = new Event("click");
    Object.defineProperty(event, "target", { value: target });
    this.closeFromClick(event as MouseEvent);
  }

  dispatchKey(key: string): KeyboardEvent {
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key }) as KeyboardEvent;
    this.closeFromKeyboard(event);
    return event;
  }

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }
}

describe("action menu controller", () => {
  beforeEach(() => vi.stubGlobal("Element", FakeTarget));
  afterEach(() => vi.unstubAllGlobals());

  it("closes action menus outside or after choosing an action", () => {
    const root = new FakeMenuDocument();
    const menu = new FakeMenu();
    const inside = new FakeTarget();
    menu.inside.add(inside);
    root.actionMenus = [menu];
    const controller = new TestActionMenuController(root);

    controller.dispatchClick(inside);
    expect(menu.open).toBe(true);
    controller.dispatchClick(new FakeTarget(true));
    expect(menu.open).toBe(false);
    expect(controller.renderForTest()).toBeDefined();
    expect(controller.rootForTest()).toBe(controller);
  });

  it("keeps settings open for internal controls and closes them outside", () => {
    const root = new FakeMenuDocument();
    const settings = new FakeMenu();
    const inside = new FakeTarget();
    settings.inside.add(inside);
    root.settingsMenu = settings;
    const controller = new TestActionMenuController(root);

    controller.dispatchClick(inside);
    expect(settings.open).toBe(true);
    controller.dispatchClick(new FakeTarget());
    expect(settings.open).toBe(false);
  });

  it("closes the last open menu on Escape and restores summary focus", () => {
    const root = new FakeMenuDocument();
    const first = new FakeMenu();
    const last = new FakeMenu();
    root.actionMenus = [first];
    root.settingsMenu = last;
    const controller = new TestActionMenuController(root);

    expect(controller.dispatchKey("Enter").defaultPrevented).toBe(false);
    const escape = controller.dispatchKey("Escape");

    expect(escape.defaultPrevented).toBe(true);
    expect(first.open).toBe(true);
    expect(last.open).toBe(false);
    expect(last.summary.focused).toBe(true);
  });
});

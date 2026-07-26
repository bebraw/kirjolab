import { describe, expect, it } from "vitest";
import { LibraryToolsMenu, libraryToolsActionEvent, type LibraryToolsAction } from "./library-tools-menu";

class TestLibraryToolsMenu extends LibraryToolsMenu {
  renderForTest() {
    return this.render();
  }

  openForTest(): void {
    this.openCitationNetwork();
  }

  toggleForTest(): void {
    this.toggleArchived();
  }
}

describe("library tools menu", () => {
  it("owns archived-reference presentation", () => {
    const menu = new TestLibraryToolsMenu();
    menu.setShowArchived(true);
    expect(menu.renderForTest()).toBeDefined();
  });

  it("emits citation-network and archived-reference intents", () => {
    const menu = new TestLibraryToolsMenu();
    const actions: LibraryToolsAction[] = [];
    menu.addEventListener(libraryToolsActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryToolsAction>).detail);
    });

    menu.openForTest();
    menu.toggleForTest();
    menu.setShowArchived(true);
    menu.toggleForTest();

    expect(actions).toEqual([
      { action: "open-citation-network" },
      { action: "show-archived", show: true },
      { action: "show-archived", show: false },
    ]);
  });
});

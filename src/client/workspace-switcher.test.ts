import { describe, expect, it } from "vitest";
import type { WorkspaceSummary } from "../domain/workspace";
import { WorkspaceSwitcher, workspaceSwitchEvent } from "./workspace-switcher";

class TestWorkspaceSwitcher extends WorkspaceSwitcher {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitForTest(workspaceId: string): void {
    this.emitSelection({ currentTarget: { value: workspaceId } } as unknown as Event);
  }
}

const workspace = (id: string, archivedAt: string | null = null): WorkspaceSummary => ({
  id,
  title: `Project ${id}`,
  href: `/editor/${id}`,
  archivedAt,
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:00.000Z",
});

describe("workspace switcher", () => {
  it("owns fallback, active, available, and archived project presentation", () => {
    const switcher = new TestWorkspaceSwitcher();
    expect(switcher.rootForTest()).toBe(switcher);
    expect(switcher.renderForTest()).toBeDefined();
    switcher.setData([workspace("active", "archived"), workspace("available"), workspace("hidden", "archived")], "active");
    expect(switcher.renderForTest()).toBeDefined();
  });

  it("emits only a different non-empty project selection", () => {
    const switcher = new TestWorkspaceSwitcher();
    switcher.setData([workspace("active"), workspace("next")], "active");
    const selections: string[] = [];
    switcher.addEventListener(workspaceSwitchEvent, (event) => selections.push((event as CustomEvent<string>).detail));
    switcher.emitForTest("");
    switcher.emitForTest("active");
    switcher.emitForTest("next");
    expect(selections).toEqual(["next"]);
  });
});

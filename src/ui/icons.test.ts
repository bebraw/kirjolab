import { describe, expect, it } from "vitest";
import { renderIcon } from "./icons";

describe("renderIcon", () => {
  it("renders a typed decorative SVG", () => {
    expect(renderIcon("comments", "rail-mode-icon")).toBe(
      '<svg class="rail-mode-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.25h16v11.5H9l-5 3z"></path></svg>',
    );
  });

  it("escapes a supplied class attribute", () => {
    expect(renderIcon("close", 'icon" data-unsafe="true')).toContain('class="icon&quot; data-unsafe=&quot;true"');
  });
});

import { describe, expect, it } from "vitest";
import { renderIcon } from "../ui/icons";
import { renderProjectFileActions, renderProjectRailNavigation } from "./home-rail-components";

describe("renderProjectRailNavigation", () => {
  it("binds each project section to its labelled tab and icon", () => {
    const html = renderProjectRailNavigation();

    const contracts = [
      ["show-files-rail", "Files", "files"],
      ["show-research-rail", "Research", "research"],
      ["show-comments-rail", "Comments", "comments"],
      ["show-guide-rail", "Writing guide", "guide"],
    ] as const;
    for (const [id, label, icon] of contracts) {
      const button = html.slice(html.indexOf(`id="${id}"`), html.indexOf("</button>", html.indexOf(`id="${id}"`)));
      expect(button).toContain(`aria-label="${label}"`);
      expect(button).toContain(renderIcon(icon, "rail-mode-icon"));
    }
    expect(html).toContain('role="tablist" aria-label="Project navigation"');
    expect(html).toContain('id="show-files-rail" type="button" role="tab"');
    expect(html).toContain('id="manuscript-comment-count">0</span>');
  });

  it("renders a labelled collapse control with the left-arrow icon", () => {
    const html = renderProjectRailNavigation();
    const collapseButton = html.slice(html.indexOf('id="collapse-source-rail"'));

    expect(collapseButton).toContain('aria-label="Collapse project rail"');
    expect(collapseButton).toContain(renderIcon("arrowLeft"));
  });
});

describe("renderProjectFileActions", () => {
  it("binds each file action to its label and icon", () => {
    const html = renderProjectFileActions();

    const contracts = [
      ["new-project-file-rail", "Add file", "fileAdd"],
      ["new-project-folder-rail", "Add folder", "folderAdd"],
      ["upload-project-images", "Add image", "imageAdd"],
    ] as const;
    for (const [id, label, icon] of contracts) {
      const start = html.indexOf(`id="${id}"`);
      const button = html.slice(start, html.indexOf("</button>", start));
      expect(button).toContain(`aria-label="${label}"`);
      expect(button).toContain(renderIcon(icon, "rail-action-icon"));
    }
    expect(html).toContain(">Files</h1>");
  });
});

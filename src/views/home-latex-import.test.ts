import { describe, expect, it } from "vitest";
import { exampleRoutes } from "../app-routes";
import { renderHomePage } from "./home";

describe("LaTeX import home surface", () => {
  it("offers a thin server-conversion workflow with explicit preview and confirmation", () => {
    const html = renderHomePage(exampleRoutes, "demo", "local@kirjolab.invalid", "local");

    for (const id of [
      "open-latex-import",
      "latex-import-dialog",
      "latex-import-form",
      "latex-import-archive",
      "latex-import-root",
      "latex-import-preview",
      "preview-latex-import",
      "confirm-latex-import",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("Uploaded LaTeX is not stored or executed.");
    expect(html).toContain("Choose an archive to inspect it without creating a project.");
  });
});

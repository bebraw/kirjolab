import { describe, expect, it } from "vitest";
import { exampleRoutes } from "../app-routes";
import { renderHomePage } from "./home";

describe("renderHomePage", () => {
  it("renders the complete scholarly workspace shell", () => {
    const html = renderHomePage(exampleRoutes);

    expect(html).toContain("KIRJOLAB");
    expect(html).toContain("Fast preview");
    expect(html).toContain("Select, annotate, connect");
    expect(html).toContain("Import BibTeX");
    expect(html).toContain('id="publication-list"');
    expect(html).toContain('id="knowledge-search-form"');
    expect(html).toContain('id="knowledge-connection-list"');
    expect(html).toContain('id="claim-list"');
    expect(html).toContain('id="claim-form"');
    expect(html).toContain('id="paper-text-layer"');
    expect(html).toContain("Propose, inspect, apply");
    expect(html).toContain('src="/app.js"');
    expect(html).toContain('href="/styles.css"');
    expect(html).toContain("/api/workspaces/demo");
    expect(html).toContain("Collaborative scholarly workspace");
    expect(html).toContain("Portable workspace resource");
    expect(html).toContain("Stable workspace resource");
    expect(html).toContain("Workspace catalog");
    expect(html).toContain("Authenticated identity");
    expect(html).toContain("JSON health endpoint for tooling and smoke tests");
    expect(html).not.toContain("Stryker was here!");
    expect(renderHomePage(exampleRoutes, "workspace", `person\"@example.org`)).toContain("person&quot;@example.org");
  });
});

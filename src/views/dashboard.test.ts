import { describe, expect, it } from "vitest";
import type { ReferenceLibrarySnapshot } from "../domain/reference-library";
import type { WorkspaceSummary } from "../domain/workspace";
import { renderDashboardPage } from "./dashboard";

const workspaces: readonly WorkspaceSummary[] = [
  {
    id: "recent-project",
    title: "Recent project",
    href: "/editor/recent-project",
    createdAt: "2026-07-17T09:00:00.000Z",
    updatedAt: "2026-07-19T09:00:00.000Z",
    archivedAt: null,
  },
  {
    id: "older-project",
    title: "Older project",
    href: "/editor/older-project",
    createdAt: "2026-07-15T09:00:00.000Z",
    updatedAt: "2026-07-18T09:00:00.000Z",
    archivedAt: null,
  },
  {
    id: "archived-project",
    title: "Archived project",
    href: "/editor/archived-project",
    createdAt: "2026-07-10T09:00:00.000Z",
    updatedAt: "2026-07-20T09:00:00.000Z",
    archivedAt: "2026-07-20T10:00:00.000Z",
  },
];

const library: ReferenceLibrarySnapshot = {
  references: [
    {
      id: "reference-1",
      referenceKey: "source2026",
      type: "article",
      title: "A recent source",
      authors: ["Researcher, Ada"],
      year: "2026",
      venue: "Journal of Tests",
      doi: "10.1000/test",
      url: "https://example.test/source",
      abstract: "",
      provenance: {},
      archivedAt: null,
      deletedAt: null,
      createdAt: "2026-07-19T10:00:00.000Z",
      updatedAt: "2026-07-19T10:00:00.000Z",
    },
  ],
  referenceKeyStates: { "reference-1": "final" },
  artifacts: [],
  webSources: [],
  webSnapshots: [],
  notes: [],
  highlights: [],
  tags: {},
  collections: {},
  reading: [],
};

describe("renderDashboardPage", () => {
  it("renders a compact recent-work dashboard without loading the editor application", () => {
    const html = renderDashboardPage(workspaces, library);

    expect(html).toContain('data-app-mode="dashboard"');
    expect(html).toContain('<h1 id="dashboard-heading">Pick up the thread.</h1>');
    expect(html).toContain('<a class="primary-navigation-link" href="/" aria-current="page">Dashboard</a>');
    expect(html).toContain('<a class="primary-navigation-link" href="/editor/recent-project">Editor</a>');
    expect(html).toContain('href="/editor?create=1">New project</a>');
    expect(html).toContain('href="/review">Start a review</a>');
    expect(html).toContain('href="/library">Add references</a>');
    expect(html).toContain("2 projects");
    expect(html).toContain("1 sources · 0 PDFs");
    expect(html).not.toContain("Archived project");
    expect(html.indexOf("A recent source")).toBeLessThan(html.indexOf("Recent project"));

    expect(html).not.toContain('<script type="module" src="/app.js"></script>');
    expect(html).not.toContain('id="workspace-surfaces"');
    expect(html).not.toContain('id="source-editor"');
  });

  it("renders a useful empty state without an existing project or library snapshot", () => {
    const html = renderDashboardPage([], null, "person@example.org", "access");

    expect(html).toContain('<a class="primary-navigation-link" href="/editor">Editor</a>');
    expect(html).toContain("Create a writing project or add a source to begin.");
    expect(html).toContain("0 projects");
    expect(html).toContain("0 sources · 0 PDFs");
    expect(html).toContain('<a href="/cdn-cgi/access/logout">Log out</a>');
  });
});

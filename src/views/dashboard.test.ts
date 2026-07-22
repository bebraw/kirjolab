import { describe, expect, it } from "vitest";
import type { ReferenceLibrarySnapshot } from "../domain/reference-library";
import type { ReviewSummary } from "../domain/review-catalog";
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

const reviews: readonly ReviewSummary[] = [
  {
    id: "00000000-0000-4000-8000-000000000151",
    title: "Recent systematic review",
    profile: "slr",
    href: "/review/00000000-0000-4000-8000-000000000151",
    role: "owner",
    createdAt: "2026-07-19T08:00:00.000Z",
    updatedAt: "2026-07-19T11:00:00.000Z",
    archivedAt: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000152",
    title: "Archived review",
    profile: "mlr",
    href: "/review/00000000-0000-4000-8000-000000000152",
    role: "owner",
    createdAt: "2026-07-19T08:00:00.000Z",
    updatedAt: "2026-07-20T11:00:00.000Z",
    archivedAt: "2026-07-20T12:00:00.000Z",
  },
];

describe("renderDashboardPage", () => {
  it("renders a compact recent-work dashboard without loading the editor application", () => {
    const html = renderDashboardPage(workspaces, library, reviews);

    expect(html).toContain('data-app-mode="dashboard"');
    expect(html).toContain('<h1 id="dashboard-heading">Pick up the thread.</h1>');
    expect(html).toContain('<a class="primary-navigation-link" href="/" aria-current="page">Dashboard</a>');
    expect(html).toContain('<a class="primary-navigation-link" href="/editor/recent-project">Editor</a>');
    expect(html).toContain('href="/editor?create=1">New project</a>');
    expect(html).toContain('href="/review">Start a review</a>');
    expect(html).toContain('href="/library">Add references</a>');
    expect(html).toContain("2 projects");
    expect(html).toContain("1 sources · 0 PDFs");
    expect(html).toContain('<span class="dashboard-area-meta">1 review</span>');
    expect(html).toContain("Recent systematic review");
    expect(html).toContain("Systematic literature review");
    expect(html).toContain("Researcher, Ada · 2026");
    expect(html).not.toContain("Archived project");
    expect(html).not.toContain("Archived review");
    expect(html.indexOf("Recent systematic review")).toBeLessThan(html.indexOf("A recent source"));
    expect(html.indexOf("A recent source")).toBeLessThan(html.indexOf("Recent project"));
    expect(html).toContain(
      '</a><a class="dashboard-activity-row" href="/library">\n    <span class="dashboard-activity-kind">Library</span>',
    );
    expect(html).toContain(
      `<time datetime="2026-07-19T11:00:00.000Z">${new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date("2026-07-19T11:00:00.000Z"))}</time>`,
    );

    expect(html).not.toContain('<script type="module" src="/app.js"></script>');
    expect(html).not.toContain('id="workspace-surfaces"');
    expect(html).not.toContain('id="source-editor"');
  });

  it("renders a useful empty state without an existing project or library snapshot", () => {
    const html = renderDashboardPage([], null, [], "person@example.org", "access");

    expect(html).toContain('<a class="primary-navigation-link" href="/editor">Editor</a>');
    expect(html).toContain("Create a writing project, evidence review, or source to begin.");
    expect(html).toContain("0 projects");
    expect(html).toContain("0 sources · 0 PDFs");
    expect(html).toContain("0 reviews");
    expect(html).toContain('<a href="/cdn-cgi/access/logout">Log out</a>');
    const defaultHtml = renderDashboardPage([], null);
    expect(defaultHtml).toContain("Create a writing project, evidence review, or source to begin.");
    expect(defaultHtml).toContain('aria-label="Account for local@kirjolab.invalid"');
  });

  it("renders source, profile, PDF, and date fallbacks without losing escaping", () => {
    const previousYear = new Date().getFullYear() - 1;
    const fallbackLibrary: ReferenceLibrarySnapshot = {
      ...library,
      references: [
        { ...library.references[0]!, title: "", referenceKey: "fallback-key", authors: [], year: "", updatedAt: "not-a-date" },
        {
          ...library.references[0]!,
          id: "reference-2",
          title: "",
          referenceKey: "",
          authors: ["Writer <One>"],
          year: "",
          updatedAt: `${previousYear}-01-02T09:00:00.000Z`,
        },
      ],
      artifacts: [
        {
          id: "artifact-1",
          referenceId: "reference-1",
          name: "paper.pdf",
          contentType: "application/pdf",
          size: 10,
          objectKey: "libraries/owner/paper.pdf",
          fingerprint: "a".repeat(64),
          rights: "private",
          createdAt: "2026-07-19T09:00:00.000Z",
        },
      ],
    };
    const multivocal = { ...reviews[0]!, title: "Review <One>", profile: "mlr" as const };
    const html = renderDashboardPage([], fallbackLibrary, [multivocal]);

    expect(html).toContain("fallback-key");
    expect(html).toContain("Private source");
    expect(html).toContain("Untitled source");
    expect(html).toContain("Writer &lt;One&gt;");
    expect(html).toContain("Review &lt;One&gt;");
    expect(html).toContain("Multivocal literature review");
    expect(html).toContain("2 sources · 1 PDFs");
    expect(html).toContain('<time datetime="not-a-date">not-a-date</time>');
    const previousDate = new Date(`${previousYear}-01-02T09:00:00.000Z`);
    expect(html).toContain(
      `<time datetime="${previousDate.toISOString()}">${new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(previousDate)}</time>`,
    );
  });

  it("limits recent work to the eight newest activities", () => {
    const manyProjects = Array.from({ length: 9 }, (_, index): WorkspaceSummary => {
      const position = index + 1;
      return {
        id: `project-${position}`,
        title: `Project ${position}`,
        href: `/editor/project-${position}`,
        createdAt: `2026-01-${String(position).padStart(2, "0")}T09:00:00.000Z`,
        updatedAt: `2026-01-${String(position).padStart(2, "0")}T09:00:00.000Z`,
        archivedAt: null,
      };
    });
    const html = renderDashboardPage(manyProjects, null);

    expect(html).toContain("<strong>Project 9</strong><small>Writing project</small>");
    expect(html).toContain("<strong>Project 2</strong><small>Writing project</small>");
    expect(html).not.toContain("<strong>Project 1</strong><small>Writing project</small>");

    const singleProjectHtml = renderDashboardPage([manyProjects[0]!], null);
    expect(singleProjectHtml).toContain('<span class="dashboard-area-meta">1 project</span>');
  });
});

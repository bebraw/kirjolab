# Feature: Application Navigation

## Blueprint

### Context

Kirjolab supports several distinct researcher tasks: resuming recent work,
managing private sources, writing a project, and conducting a structured SLR or
MLR. Opening an arbitrary manuscript at `/` and exposing projects through the
implementation term `workspace` made those destinations difficult to
understand and forced project bootstrap on users who intended to work
elsewhere.

The application exposes task-oriented browser routes without renaming project
storage or APIs. [ADR-151](../../docs/adrs/implemented/ADR-151-model-reviews-as-independent-resources.md)
completes the review transition: reviews now have stable identities, access,
lifecycle, and project relationships independent of manuscript projects while
legacy project-associated review locations remain bounded compatibility
entries.

### Architecture

- `/` renders the authenticated dashboard. It presents bounded, condensed
  access to authorized active projects, owner-private Library records, and
  active independent reviews plus direct navigation to their full task
  surfaces.
- Dashboard summaries come from the workspace catalog, private Library, and
  current identity's `ReviewCatalog`. The dashboard does not choose or create a
  project, fetch a workspace snapshot, restore offline manuscript state, or
  connect a collaboration socket merely because it is open. Its only permitted
  write is bounded, idempotent registration of existing legacy review data
  discovered through an authorized project; it never initializes a new review
  workflow.
- Recent work combines at most eight active-project, private-Library, and active-
  review rows. Every row labels its resource kind, uses the existing server-
  owned `updatedAt`, and links to the owning task surface. The interface must
  not relabel catalog maintenance time as precise manuscript or review editing
  activity.
- `/library` and `/library/pdfs/{artifactId}` retain the standalone,
  owner-private bootstrap and routing contracts from the reference-library
  feature.
- `/editor` redirects to the first active authorized project, using the
  compatible `demo` workspace by default. `/editor/{workspaceId}` is the
  canonical browser representation for an authorized project.
- `/review` lists every review discoverable through the current identity's
  independent catalog, including lifecycle and role, and accepts normal form
  creation with a title and `slr` or `mlr` profile. Creating a review requires
  no writing project and redirects to its canonical UUID location.
- `/review/{reviewId}` is the canonical focused browser representation. It
  renders the review's profile, lifecycle, membership context, workflow, and
  complete active and unlinked project-link history outside manuscript chrome.
  The review client derives `/api/reviews/{reviewId}` from that stable UUID.
- Review owners may explicitly link active authorized projects. One review can
  link to several projects and one project can link to several reviews; links
  grant no access in either direction. A link whose project is inaccessible to
  the current review member renders only a permission state, without project
  title or an Editor action.
- `/review/{workspaceId}` remains a bounded legacy adapter. It atomically
  resolves the project's compatibility review entry under one stable review
  UUID, seeds its independent membership once from the then-current project
  members, retains the old storage key behind a private locator, creates the
  explicit project link, and redirects with `308` to the canonical review URL
  while preserving the query string. Canonical review APIs live under
  `/api/reviews/{reviewId}`; `/api/workspaces/{workspaceId}/review-study`
  remains the matching API compatibility adapter.
- `/workspaces/{workspaceId}` redirects to `/editor/{workspaceId}` and
  preserves its query string. New links use `/editor`; the old prefix is a
  compatibility entry, not a second canonical project location.
- Bounded editor query parameters continue to restore authorized file, rail,
  authoring mode, layout, context target, and PDF state under ADR-116. Unknown
  or unauthorized values still canonicalize to safe defaults.
- User-facing navigation uses Dashboard, Library, Editor, and Reviews as task
  destinations. Project remains the user-facing resource noun inside the
  editor; `workspace` remains an API, type, and coordination term.
- Active-destination styling and accessible names identify the current task.
  Compact layouts keep every destination reachable without introducing page
  overflow or obscuring the active task's contextual controls.
- Unknown browser routes retain the shared responsive not-found experience and
  provide a direct return to the dashboard.
- Network-first offline authoring recognizes canonical editor routes. The
  service worker does not cache dashboard data, Library data, review data,
  APIs, WebSockets, model requests, exports, or private PDF bytes.

### Anti-Patterns

- Do not load or create a project, restore a manuscript, or open collaboration
  as an implicit dashboard side effect.
- Do not rename `/api/workspaces`, Durable Object keys, or workspace-scoped
  types merely to match browser navigation terminology.
- Do not use a workspace id as a canonical review identity or generate new
  project-qualified review links after legacy registration.
- Do not infer review access from project membership, project access from review
  membership, or either permission from a project-review link.
- Do not expose an inaccessible linked project's title or Editor action in the
  review surface.
- Do not expose owner-private Library summaries to project collaborators or
  let dashboard aggregation weaken either authorization boundary.
- Do not generate new `/workspaces/{id}` links or maintain divergent route
  state under both browser prefixes.
- Do not turn the dashboard into a large metric-card report; prioritize compact
  paths back into work.

## Contract

### Definition of Done

- [x] `/` opens a compact dashboard instead of the demo manuscript.
- [x] A researcher can reach the standalone Library, resume an active editor,
      and browse independent reviews from stable top-level destinations.
- [x] Authorized UUID projects open at `/editor/{workspaceId}`.
- [x] A researcher can create a review without a project and open it at
      `/review/{reviewId}` through its independent catalog and access boundary.
- [x] Review owners can represent several projects per review and several
      reviews per project through explicit soft links without changing either
      permission boundary.
- [x] Legacy project-associated browser and API locations register one stable
      review UUID without moving the ReviewStudy and continue through bounded
      compatibility adapters.
- [x] `/workspaces/{workspaceId}` redirects to the canonical editor location
      while preserving bounded route state in the query string.
- [x] Dashboard navigation does not initialize collaborative manuscript state.
- [x] Responsive and keyboard navigation identify and reach every primary
      destination.
- [x] Route, view, client, Workers, and browser tests cover canonical routes,
      compatibility redirects, destination navigation, dashboard bootstrap
      isolation, independent review creation and linking, legacy adaptation,
      and not-found behavior.

### Regression Guardrails

- `/editor` selects only the first active authorized project catalog entry, and
  `/review` lists only review summaries present in the current identity's
  catalog. An arbitrary project or review id must pass its own catalog and
  access checks.
- Browser route changes must not alter project API paths, workspace Durable
  Object identities, or either resource's membership checks. New review links
  and clients use canonical UUID routes; workspace-qualified review routes are
  adapters only.
- The dashboard must not connect a workspace WebSocket or write project,
  ReviewStudy, or Library state on load. Its only review-side mutation may be
  the idempotent one-time catalog/access/link registration of already existing
  legacy review data.
- Legacy registration must seed exactly one stable UUID and membership snapshot
  under concurrency, retain the old storage key behind the locator, preserve
  query state on the browser redirect, and never synchronize later project
  membership changes into review membership.
- Project-link rendering and actions must resolve project authorization
  independently; review access alone must not expose project metadata or enable
  publication.
- Project unlink or deletion must not remove the independent review, and review
  unlink or deletion must not remove the project or rewrite retained
  materialized artifacts.
- Dashboard Library data remains owner-private and non-cacheable.
- Wrapped dashboard and review hero headings keep enough line height to prevent
  descenders and ascenders from colliding while retaining the compact editorial
  hierarchy.
- Legacy project redirects must not drop query parameters owned by editor
  navigation.
- Editor offline fallback remains identity-and-workspace scoped and cannot make
  dashboard or review data available offline accidentally.
- Review copy and navigation must describe independent ownership, explicit
  links, lifecycle, and permission state honestly.

### Verification

- Worker route tests cover `/`, `/editor`, `/editor/{id}`, `/review`, canonical
  `/review/{reviewId}`, legacy `/review/{workspaceId}`, `/workspaces/{id}`, and
  unknown paths, including method and authorization boundaries.
- View and client tests verify independent creation controls, UUID API bases,
  project-link permission states, and explicit publication targets. Workers
  tests verify catalog/access enforcement, linking, and legacy registration.
- Browser tests verify dashboard links, active task navigation, canonical review
  selection and workflow, project redirect query preservation, compact layout,
  and keyboard access.
- Existing workspace, Library, review, collaboration, and offline suites remain
  green.

### Scenarios

**Scenario: Researcher starts from recent work**

- Given: the authenticated researcher has authorized projects, private Library
  records, and independent reviews
- When: they open `/`
- Then: Kirjolab shows condensed authorized entry points without selecting a
  project or connecting collaboration

**Scenario: Researcher resumes a project**

- Given: an authorized project appears on the dashboard
- When: the researcher opens it
- Then: Kirjolab navigates to `/editor/{workspaceId}` and only then loads and
  synchronizes that project's editor state

**Scenario: Old project link remains useful**

- Given: a bookmark points to `/workspaces/{workspaceId}` with valid workspace
  query state
- When: the researcher follows it
- Then: Kirjolab redirects to `/editor/{workspaceId}` with the query string
  intact and restores only authorized selections

**Scenario: Researcher starts an independent review**

- Given: the researcher is authenticated and has no writing project selected
- When: they create an SLR from `/review`
- Then: Kirjolab creates independent catalog, access, and study authorities and
  redirects to `/review/{reviewId}` without creating or linking a project

**Scenario: Legacy review receives a stable identity**

- Given: an authorized project has project-associated review data that has not
  yet been registered independently
- When: a seeded project member opens `/review/{workspaceId}`
- Then: Kirjolab atomically registers one UUID and membership snapshot, retains
  the existing ReviewStudy storage key, creates the project link, and redirects
  to `/review/{reviewId}` with the query string intact

**Scenario: Link visibility respects both resources**

- Given: a review member can inspect a review but cannot access one linked
  writing project
- When: they open `/review/{reviewId}`
- Then: the link remains represented as requiring project access without
  revealing its title or offering an Editor or publication action

**Scenario: Dashboard does not broaden Library access**

- Given: a collaborator can edit a project but does not own its owner's private
  Library
- When: the collaborator enters the application
- Then: dashboard aggregation reveals only records authorized for that verified
  identity and project access does not expose the owner's private records

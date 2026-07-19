# Feature: Application Navigation

## Blueprint

### Context

Kirjolab supports several distinct researcher tasks: resuming recent work,
managing private sources, writing a project, and conducting a structured SLR or
MLR. Opening an arbitrary manuscript at `/` and exposing projects through the
implementation term `workspace` made those destinations difficult to
understand and forced project bootstrap on users who intended to work
elsewhere.

The first information-architecture slice introduces task-oriented browser
routes without renaming storage or APIs. Review navigation is intentionally
transitional: it gives the existing project-associated workflow a focused
surface but does not implement the independent review resource proposed in
[ADR-151](../../docs/adrs/proposed/ADR-151-model-reviews-as-independent-resources.md).

### Architecture

- `/` renders the authenticated dashboard. It presents bounded, condensed
  access to authorized projects and owner-private Library records plus direct
  navigation to the full Library, editor, and review tasks.
- Dashboard summaries use the existing workspace catalog and private Library
  authorities. The dashboard does not create or choose a project, fetch a
  workspace snapshot, restore offline manuscript state, or connect a
  collaboration socket merely because it is open.
- Recent work combines at most eight active-project and private-Library rows.
  Every row labels its resource kind, uses the existing server-owned
  `updatedAt`, and links to the owning task surface. The interface must not
  relabel workspace-catalog maintenance time as precise manuscript editing
  activity.
- `/library` and `/library/pdfs/{artifactId}` retain the standalone,
  owner-private bootstrap and routing contracts from the reference-library
  feature.
- `/editor` redirects to the first active authorized project, using the
  compatible `demo` workspace by default. `/editor/{workspaceId}` is the
  canonical browser representation for an authorized project.
- `/review` lists the evidence review currently associated with each active
  authorized project. `/review/{workspaceId}` opens that project's one review
  in a focused review layout.
- The review route parameter remains a workspace id. Review storage,
  authorization, history, backup, deletion, and
  `/api/workspaces/{id}/review-study` APIs retain their existing
  one-review-per-project contract. The review index is derived from active
  workspace summaries; browser placement does not create an independent
  durable review catalog, review membership, review id, or many-to-many project
  link.
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
- Do not treat `/review/{workspaceId}` as proof of an independent review id,
  independent access, or support for several reviews per project.
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
      and browse project-linked reviews from stable top-level destinations.
- [x] Authorized UUID projects open at `/editor/{workspaceId}`.
- [x] Project-associated reviews open at `/review/{workspaceId}` without
      changing their API, storage, authorization, or lifecycle authority.
- [x] `/workspaces/{workspaceId}` redirects to the canonical editor location
      while preserving bounded route state in the query string.
- [x] Dashboard navigation does not initialize collaborative manuscript state.
- [x] Responsive and keyboard navigation identify and reach every primary
      destination.
- [x] Browser tests cover canonical routes, compatibility redirects,
      destination navigation, dashboard bootstrap isolation, and not-found
      behavior.

### Regression Guardrails

- `/editor` selects only the first active authorized catalog entry and
  `/review` lists only active authorized project summaries; an arbitrary
  workspace id must pass the normal catalog and access checks.
- Browser route changes must not alter existing workspace or review API paths,
  Durable Object identities, or membership checks.
- The dashboard must not connect a workspace WebSocket or write project,
  review, or Library state on load.
- Dashboard Library data remains owner-private and non-cacheable.
- Legacy project redirects must not drop query parameters owned by editor
  navigation.
- Editor offline fallback remains identity-and-workspace scoped and cannot make
  dashboard or review data available offline accidentally.
- Standalone review copy and navigation must describe the current
  project-associated authority honestly.

### Verification

- Worker route tests cover `/`, `/editor`, `/editor/{id}`, `/review`,
  `/review/{workspaceId}`, `/workspaces/{id}`, and unknown paths.
- Browser tests verify dashboard links, active task navigation, project and
  review selection, redirect query preservation, compact layout, and keyboard
  access.
- Existing workspace, Library, review, collaboration, and offline suites remain
  green.

### Scenarios

**Scenario: Researcher starts from recent work**

- Given: the authenticated owner has cataloged projects and private Library
  records
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

**Scenario: Review route remains transitional**

- Given: a project has its current project-associated review study
- When: a member opens `/review/{workspaceId}`
- Then: the focused review surface uses the existing workspace authorization
  and nested review APIs without implying an independent review resource

**Scenario: Dashboard does not broaden Library access**

- Given: a collaborator can edit a project but does not own its owner's private
  Library
- When: the collaborator enters the application
- Then: dashboard aggregation reveals only records authorized for that verified
  identity and project access does not expose the owner's private records

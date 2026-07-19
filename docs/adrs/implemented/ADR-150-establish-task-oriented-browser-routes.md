# ADR-150: Establish Task-Oriented Browser Routes

**Status:** Partially superseded by
[ADR-151](./ADR-151-model-reviews-as-independent-resources.md)

**Date:** 2026-07-19

**Partially supersedes:**
[ADR-042](./ADR-042-use-per-owner-workspace-catalogs.md)

**Amends:** [ADR-107](./ADR-107-open-library-without-a-project.md) and
[ADR-116](./ADR-116-project-reconstructible-ui-state-into-workspace-urls.md)

## Context

Kirjolab originally opened the compatible `demo` workspace at `/` and exposed
other projects at `/workspaces/{id}`. That made the collaboration and storage
term `workspace` the application's primary navigation model and forced a
researcher to enter an editor before reaching other work.

The private Library already has a project-independent `/library` surface, and
the structured SLR/MLR workflow is large enough to benefit from a focused
browser surface. A concise dashboard is also a better application entry point:
it can expose recent authorized work and direct actions without opening a
project, restoring an offline manuscript, or connecting collaboration.

At the time of this decision, review storage could not be made independent as a
routing side effect. The implemented review authority was still one
project-associated `ReviewStudy`, addressed and authorized through a
workspace. The first browser information architecture therefore needed an
honest transitional route while the separate resource decision was evaluated.

## Decision

Use task-oriented browser routes. The original implementation retained the
existing storage and API identities for every route; ADR-151 later superseded
that constraint for review routes only. The current browser routes are:

| Browser route               | Meaning                                             |
| --------------------------- | --------------------------------------------------- |
| `/`                         | Condensed dashboard over authorized recent work     |
| `/library`                  | Existing owner-private reference Library            |
| `/library/pdfs/{id}`        | Existing owner-private PDF reader                   |
| `/editor`                   | Resume route to the first active authorized project |
| `/editor/{workspaceId}`     | Editor for one authorized project                   |
| `/review`                   | Catalog of authorized independent reviews           |
| `/review/{reviewId}`        | Review workflow for one authorized review           |
| `/workspaces/{workspaceId}` | Compatibility redirect to `/editor/{workspaceId}`   |

The dashboard is the application entry point and must not implicitly choose or
create a project, load manuscript state, or open a collaboration socket. Its
project and Library summaries remain bounded, authorized projections over the
existing catalogs. Selecting a destination performs ordinary navigation to
the owning task surface.

`/editor/{workspaceId}` is the canonical browser representation for a project.
The old `/workspaces/{workspaceId}` location redirects to it while preserving
the query string so existing bookmarks and reconstructible UI selections keep
working. The editor continues to validate the bounded query parameters defined
by ADR-116. `/editor` redirects to the first active catalog entry, which is the
compatible `demo` workspace by default, and preserves its query string.

The original `/review` index derived one review from each active project, and
`/review/{workspaceId}` changed browser placement without changing identity or
authorization. ADR-151 replaces that transitional contract: `/review` now
projects the review catalog, and `/review/{reviewId}` uses a stable review id
with independent membership, storage, backup, and deletion. A legacy
workspace-qualified review location registers the existing study behind a
locator and redirects to its stable review-id route when it can be resolved.

Keep `/api/workspaces` and project-scoped APIs unchanged. Canonical review
requests now use `/api/reviews/{reviewId}`; the workspace-scoped review-study
routes remain bounded migration adapters. Continue using `workspace` for
project storage and coordination identities while using project and editor
terminology in user-facing navigation. Update the network-first offline
authoring allowlist to recognize canonical editor routes; the dashboard,
Library data, review data, APIs, and private PDFs remain outside the
service-worker data cache.

## Trigger

A design pass identified that Kirjolab's primary destinations represent
different researcher tasks: resuming work, managing private sources, writing a
paper, and conducting a structured evidence review. The route hierarchy needed
to express those tasks before the deeper review-ownership change could be
designed safely.

## Consequences

**Positive:**

- Researchers enter through a compact overview instead of an arbitrary demo
  manuscript.
- Library, editor, and review work have clear, directly addressable browser
  destinations.
- Existing workspace APIs and Durable Object identities do not need a risky
  migration merely to improve navigation.
- Old project bookmarks retain a deterministic path to the canonical editor
  route.

**Negative:**

- `editor` is narrower than the full project surface, which also contains
  research, comments, collaboration, history, and export.
- Legacy workspace-qualified review locations require a catalog lookup,
  registration, and redirect until those migration adapters can be retired.
- The editor resume route adds one redirect before reaching its canonical
  id-qualified location.

**Neutral:**

- Workspace ids, project membership, and owner-private Library authorization
  remain unchanged; project membership no longer authorizes a linked review.
- Independent review resources and explicit project links are governed by
  [ADR-151](./ADR-151-model-reviews-as-independent-resources.md).

## Alternatives Considered

### Keep the workspace-first root

This avoids route changes but keeps an implementation term in the primary
navigation and makes every session begin inside one writing project, even when
the researcher's task belongs to Library or review work.

### Rename browser routes and APIs together

Changing `/api/workspaces`, Durable Object keys, and internal types would make
terminology uniform, but it couples a reversible information-architecture
change to a broad compatibility migration with no user-facing benefit.

### Wait until reviews are independent

This would have avoided a transitional review route but delayed the dashboard
and editor improvements. The workspace-qualified review route exposed the
then-current truth while the independent resource model was evaluated.

### Use `/projects` instead of `/editor`

`/projects` describes the underlying resource more completely, but the chosen
navigation emphasizes the writing task. Internal project vocabulary remains
available throughout the interface, so adopting `/editor` does not rename the
domain model.

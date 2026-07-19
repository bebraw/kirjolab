# ADR-151: Model Reviews as Independent Resources

**Status:** Implemented

**Date:** 2026-07-19

**Supersedes:**
[ADR-146](./ADR-146-coordinate-project-review-studies.md)

## Context

Before this decision, Kirjolab coordinated exactly one `ReviewStudy` for each
project. Its Durable Object was addressed by the workspace storage key, project
membership authorized it, project history pinned it, and project backup or
deletion included it. The transitional `/review/{workspaceId}` route introduced
by ADR-150 made that workflow easier to reach but deliberately did not change
its identity or lifecycle.

That ownership model does not fit the emerging research workflow. One writing
project may synthesize evidence from several SLRs or MLRs, and one completed
review may support several manuscripts. Making a review appear independent in
navigation while retaining an implicit one-to-one project relationship would
leave access, lifecycle, provenance, and deletion behavior misleading.

Any replacement must preserve the current audit trail, ADR-059's separation of
owner-private research from collaborative project state, and ADR-147's rule
that review-derived outputs come from one exact evidence revision. Existing
project-associated reviews also need a migration path that does not require an
unsafe all-at-once Durable Object data move.

## Decision

Introduce a stable review identity and catalog that are independent of
workspace ids. Each review becomes its own collaborative resource with its own
membership, lifecycle, revision history, backup, and deletion boundary.
Opening or joining a project must not grant access to a linked live review, and
review membership must not grant access to an owner-private Library.

Connect projects and reviews through explicit many-to-many link resources. A
link identifies the project, review, actor, creation time, and link status. It
does not copy review authority or imply access in either direction. Unlinking a
review removes the live association without deleting the project, review, or
revision-pinned artifacts already materialized into project history.

Project integration remains an explicit publication action. It selects a
target project, exact review revision, named artifact or analysis, and target
artifact identity. The resulting project state retains the review id, review
revision, generator/schema identity, and publication provenance. Several
reviews may contribute without path or directive collisions, and later review
activity never rewrites a project automatically.

Use `/review/{reviewId}` as the canonical browser representation and
`/api/reviews/{reviewId}` as the independent API boundary. Retain the current
workspace-qualified browser and API routes as bounded migration adapters until
every legacy review has a stable review identity and callers have moved to the
new contract.

Migration should register each legacy project review in the new catalog while
initially retaining its existing storage key behind an explicit locator. Data
movement, if later justified, is a separate verified migration. Project
deletion stops cascading to an independently registered review; it removes the
project link and project-owned materializations only after the independent
backup and retention contracts are in place.

## Trigger

The information-architecture pass separated review work from manuscript
editing and exposed the cardinality mismatch: a single paper can incorporate
several evidence reviews, while a review can be reusable across several
papers. ADR-150 intentionally stopped at browser routing so this resource
decision could be reviewed on its own merits.

## Consequences

**Positive:**

- Review identity and lifecycle match how SLR and MLR work is reused across
  manuscripts.
- Many-to-many links make project integration explicit and provenance-bearing.
- A project can consume several revision-pinned review artifacts without
  conflating their protocols, evidence, or histories.
- Deleting or archiving a writing project no longer destroys an otherwise
  reusable review.

**Negative:**

- A review catalog and independent membership model add authorization,
  invitation, quota, backup, restore, and deletion surfaces.
- Legacy review discovery needs a locator migration and a compatibility period
  across browser and API routes.
- Project export and history must qualify every review artifact by review and
  revision identity.
- Collaborators may have access to a project artifact without access to the
  live review that generated it, requiring clear permission states.

**Neutral:**

- `ReviewStudy` remains a SQLite-backed Durable Object with its own monotonic
  revision.
- Review data still does not belong in Markdown, an owner-private Library, or
  flat interchange files.
- ADR-147's evidence-derived output rule remains valid and gains an explicit
  review identity at project boundaries.

## Implementation

The implementation adds an owner-scoped `ReviewCatalog`, independently
addressed `ReviewAccess` and `ReviewStudy` Durable Objects, canonical
review-id browser and API routes, and explicit many-to-many project links.
Legacy project reviews are registered lazily with stable review ids while their
existing workspace storage keys remain behind catalog locators.

Review publication requires an active project link and records the review,
link, revision, generator, and artifact provenance in project state. Project
deletion unlinks independent reviews rather than deleting them; review deletion
is a separate owner-authorized lifecycle. Owner backup schema v3 restores the
review catalog, access, links, and study payload independently while retaining
v1 and project-associated v2 recovery compatibility.

## Alternatives Considered

### Retain one review per project

This preserves the current implementation but cannot represent several SLRs
feeding one manuscript or one review supporting several outputs without
copying state or creating artificial projects.

### Allow several reviews but keep each owned by one project

One-to-many ownership solves the first cardinality problem but still requires
copying a review to reuse it elsewhere and keeps deletion coupled to an
arbitrary manuscript.

### Copy review exports into projects without links

Portable packages remain useful, but copy-only integration loses live
association, access state, and inspectable provenance unless users reconstruct
them manually.

### Store collaborative reviews in the owner-private Library

This would reuse source identities but violate the established privacy
boundary: project and review collaborators must not inherit an owner's private
notes, PDFs, reading state, or unrelated research.

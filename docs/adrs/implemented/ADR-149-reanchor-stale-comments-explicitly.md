# ADR-149: Re-anchor Stale Comments Explicitly

**Status:** Implemented

**Date:** 2026-07-17

## Context

Relative manuscript anchors follow surviving edits, but a passage replacement
can make an otherwise relevant comment stale. Resolution was previously the
only visible closure. Automatically relocating the comment through fuzzy text
matching would make discussion provenance ambiguous, while creating a new
comment would split one thread and discard its lifecycle continuity.

## Decision

Kirjolab will let a collaborator explicitly re-anchor an open stale comment to
the current exact manuscript selection. The server verifies the file, range,
excerpt, and manuscript revision before replacing the comment's live relative
selector.

The comment keeps its stable id, body, author, creation time, and open status.
Re-anchoring records a logical `comment-reanchor` project revision in the same
transaction as the selector update. Earlier project revisions therefore retain
the prior selector and later revisions expose the replacement selector.

Resolved comments cannot be re-anchored. Kirjolab never chooses a replacement
passage automatically from fuzzy matches or original offsets.

## Consequences

**Positive:**

- A still-relevant discussion can follow substantially rewritten prose without
  becoming a disconnected replacement thread.
- Re-anchoring is intentional, exact, and recoverable through project history.
- Canonical Markdown and the manuscript concurrency revision remain unchanged.

**Negative:**

- The collaborator must select the replacement passage manually.
- The live comment shows only its current selector; earlier selectors require
  project-history inspection.

## Alternatives Considered

### Resolve the stale thread and create a new comment

This needs no new mutation but splits one discussion across resources and loses
the stable thread identity.

### Relocate automatically using quote context

This is convenient when wording is similar, but ambiguous matches can attach a
comment to the wrong claim without an explicit researcher decision.

### Store a separate live anchor-history table

This would make every selector directly queryable, but project revisions
already retain authoritative before-and-after comment snapshots. A second
history authority would add complexity without a current inspection need.

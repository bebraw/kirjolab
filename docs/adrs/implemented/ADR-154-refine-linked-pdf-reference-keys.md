# ADR-154: Refine Linked PDF Reference Keys

**Status:** Implemented

**Date:** 2026-07-19

## Context

ADR-083 lets a filename-derived PDF key improve only until the source first
enters a project. In the normal capture-first workflow, however, a researcher
may add the PDF to a project before correcting its author and year. That makes
the first link an accidental metadata deadline and permanently preserves keys
such as `sourceundatedclimate`.

The library UUID is already the stable source identity. Project citation keys
are local aliases whose exact uses can be rewritten atomically by each
`DocumentRoom`.

## Decision

PDF-origin reference keys remain refinable after project linking. Manual edits
and explicitly reviewed metadata continue to run the unique memorable-key
allocator whenever such a record changes.

When the generated library key changes, the authenticated owner API asks every
registered project dependency to replace the old alias. A project accepts that
replacement only when its current alias exactly matches the previous generated
key and the refined key does not collide with another local alias. It rewrites
canonical citation directives and derived bibliography in one project
revision. Custom aliases and collision-bound aliases remain unchanged.

Imported bibliographic records and non-PDF sources still finalize on project
use. A forward-only migration marks linked PDF fallback keys beginning with
`sourceundated` as refinable so existing sparse imports can benefit.

Cross-Durable-Object propagation is convergent rather than a distributed
transaction. A project RPC failure can leave its old alias in place, but that
alias remains a valid project-local handle for the same stable UUID.

This decision supersedes ADR-083's first-project-link finalization rule for
PDF-origin references. Its other lifecycle rules remain in force.

## Consequences

**Positive:**

- Adding a PDF to a project no longer freezes filename-quality citation keys.
- Unmodified generated aliases and manuscript citations improve together.
- Researcher-chosen aliases never change because of library metadata edits.

**Negative:**

- A generated citation alias may change after it has been authored.
- Cross-object propagation cannot be atomic across every dependent project.
- Existing fallback-key recovery uses a deliberately narrow migration rule.

**Neutral:**

- UUIDs remain the only relational identity.
- Alias collisions preserve the existing project alias instead of blocking a
  metadata correction.

## Alternatives Considered

### Keep first-link finalization

This is simple but makes project linking an undocumented metadata deadline.

### Refine only the library key

This avoids project writes but leaves generated project aliases visibly out of
step with the corrected source.

### Rewrite every alias unconditionally

This keeps names uniform but overwrites deliberate researcher choices and can
create local collisions.

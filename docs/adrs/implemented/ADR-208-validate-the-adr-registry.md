# ADR-208: Validate the ADR Registry

**Status:** Implemented

**Date:** 2026-07-30

## Context

Parallel feature work assigned the same sequential ADR identifiers to unrelated
decisions. Several implemented records were also absent from the maintained ADR
index, and a few records used lifecycle metadata that the index could not
reliably inspect. Ambiguous identifiers undermine ADRs as durable context for
contributors and agents.

## Decision

Keep the human-maintained ADR index and add a deterministic repository check
that validates every ADR filename, heading identifier, lifecycle status, date,
index entry, and local ADR link. Run it in the fast quality gate and whenever
affected-file guardrails include the ADR registry or its validator.

Repair collisions by preserving the earlier record's identifier and assigning
new sequential identifiers to later records. Update links but do not rewrite the
recorded decisions.

## Consequences

**Positive:**

- Every ADR identifier once again names exactly one decision.
- Missing index entries and broken local links fail before changes land.
- Parallel contributors receive a concrete collision signal.

**Negative:**

- ADR-only changes now run one additional lightweight Node check.
- Repairing a collision changes the filename and metadata of a historical
  record, even though its decision content remains intact.

## Alternatives Considered

### Generate the entire index

Rejected because the index contains concise editorial summaries that are more
useful than automatically copied headings.

### Rely on review

Rejected because five identifier collisions and many unindexed records passed
review before the inconsistency became visible.

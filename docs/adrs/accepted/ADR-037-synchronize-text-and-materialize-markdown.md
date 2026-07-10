# ADR-037: Synchronize Text and Materialize Clean Markdown

**Status:** Accepted

**Date:** 2026-07-10

## Context

Kirjolab needs real-time concurrent editing, presence, selections, comments, and
recoverable history. It also requires Markdown to remain the canonical authored
representation and must not depend on a collaboration service to recover usable
documents.

Synchronizing a parsed syntax tree would tightly couple collaboration to parser
schema and semantic validity. Synchronizing only files with locks would preserve
portability but would not provide the intended multiplayer experience.

## Decision

Kirjolab will synchronize document text using a conflict-resolving collaborative
sequence model such as a CRDT. Presence, selections, and comments will use
separate collaboration metadata linked to document versions and source ranges.

The collaboration service will regularly and transactionally materialize shared
document state into clean canonical Markdown. A recoverable version boundary
will accompany materialization so the system can reconstruct and audit document
history.

Parsing, validation, and rendering will consume materialized or current text but
will not participate in merge semantics. Derived syntax trees and previews will
never be synchronized as authoritative state.

The first collaboration contract is limited to concurrent editing, presence,
selections, range-anchored comments, and recoverable history. Track changes and
editorial approval are deferred.

## Trigger

The architectural vision requires both multiplayer editing and portable source,
creating an explicit boundary between ephemeral collaboration state and durable
documents.

## Consequences

**Positive:**

- Concurrent edits converge without making parser output authoritative.
- Documents remain usable when the collaboration runtime is unavailable.
- Parsing and collaboration can evolve independently behind a text boundary.
- Materialized versions provide recovery and audit points.

**Negative:**

- CRDT state, clean Markdown, and version history require explicit lifecycle and
  compaction rules.
- Comments and selections must be reconciled as surrounding text changes.
- Formatting normalization can create noisy diffs unless carefully constrained.

**Neutral:**

- The concrete collaboration library and transport will be selected during
  implementation.
- Offline editing may build on the same model but is not guaranteed by this
  decision alone.

## Alternatives Considered

### Synchronize the semantic syntax tree

This would make structured operations explicit but would couple merge behavior
to parser versions and create difficult states when collaborators temporarily
produce invalid Markdown.

### Use server-authoritative operational transformation

Operational transformation can support collaborative editing, but it increases
dependence on ordered server coordination and is less aligned with later local
or intermittent operation. It may be reconsidered if a chosen editor platform
provides a substantially better implementation.

### Use file locking and last-write-wins saves

This would be simpler but does not satisfy concurrent multiplayer editing and
risks silent data loss.

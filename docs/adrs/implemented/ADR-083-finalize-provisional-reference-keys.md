# ADR-083: Finalize Provisional Reference Keys

**Status:** Implemented

**Date:** 2026-07-13

## Context

ADR-076 made every author-facing reference key immutable at intake, and
ADR-079 and ADR-080 preserved that rule during reviewed enrichment. That is a
safe default for imported bibliographic records, but it leaves newly collected
PDFs with permanent fallback keys such as `sourceundatedclimate` even after the
researcher adds an author and publication year. The library UUID already
provides stable relational identity, and a PDF draft is not exposed to a
project merely by existing in the owner's private library.

Changing a key after it has entered a project would still break authored
citations and project aliases. The lifecycle therefore needs an explicit
boundary between private collection and project use.

## Decision

New PDF draft keys are provisional. Manual edits and explicitly reviewed PDF
or Crossref metadata regenerate a provisional key through the existing unique,
memorable key allocator. The Library labels the key as provisional so the
researcher knows it may improve while the source is being refined.

The first project dependency registration permanently changes the key state to
final in the same library transaction that records the dependency. A finalized
key never changes, including after later metadata edits or after every project
unlinks the source. BibTeX imports, web captures, and all records that predate
this migration are final because their keys may already have been exposed.

The internal UUID remains the only relational identity. Key state is
library-owned metadata returned beside bibliographic records in the private
library snapshot; it is not copied into project bibliographic snapshots.

This decision partially supersedes only the key-immutability clauses in
ADR-076, ADR-079, and ADR-080. Their other intake and review boundaries remain
in force.

## Consequences

**Positive:**

- Rapid PDF collection no longer makes missing metadata a permanent citation-ID
  quality problem.
- The stability boundary matches actual exposure to authored project content.
- Existing and imported keys remain stable through a forward-only migration.

**Negative:**

- A private PDF key may change more than once before its first project link.
- The library must persist and expose an additional key-lifecycle state.

**Neutral:**

- Collision handling and the author/year/topic key format do not change.
- Unlinking a source does not reverse finalization.

## Alternatives Considered

### Keep every intake key immutable

This preserves the simplest rule but permanently exposes sparse-ingestion
fallbacks even when the source is refined before use.

### Rewrite every project when metadata changes

This could keep keys aesthetically current, but it couples private enrichment
to every project and risks changing authored citations without an explicit
project edit.

### Let the researcher rename keys

Manual naming adds administration to the capture flow and introduces the same
rewrite problem after project exposure.

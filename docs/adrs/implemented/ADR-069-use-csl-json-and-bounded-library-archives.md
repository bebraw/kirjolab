# ADR-069: Use CSL JSON and Bounded Library Archives

**Status:** Implemented

**Date:** 2026-07-12

## Context

BibTeX is necessary for LaTeX portability but is not the only interchange
format researchers use. Zotero can exchange CSL JSON, and moving private
research organization between Kirjolab installations requires more than a
bibliography file. A portable format must not silently redistribute private or
copyrighted binaries.

## Decision

Support bounded CSL JSON import and export as the Zotero-compatible
bibliographic interchange boundary. Convert reviewed CSL fields into the
existing canonical reference model through the same deduplicating import path
used by BibTeX. CSL JSON is an adapter, not canonical storage.

Define `kirjolab-library-v1` as a deterministic metadata archive containing a
manifest, `references.csl.json`, and `research.json`. Research metadata keeps
tags, collections, notes, and reading state distinct and restores them by
stable exported reference identity after canonical import.

The first portable archive is deliberately metadata-only. It records that
binary artifacts are omitted and never silently embeds private PDFs or web
captures. Archive import accepts only named files, bounded compressed input,
bounded item counts and strings, and no paths, scripts, markup execution, or
remote fetches.

## Consequences

**Positive:**

- Zotero and other CSL JSON tools can exchange canonical bibliography data.
- Private research organization can move without becoming project state.
- Import reuses stable identity and deduplication rules.
- Metadata archives avoid accidental redistribution of source artifacts.

**Negative:**

- CSL fields outside the supported canonical model are not retained yet.
- Metadata-only archives do not provide offline copies of PDFs or web captures.
- Recreated notes receive new local identities and timestamps.

## Alternatives Considered

### Make CSL JSON canonical

This would replace the existing shared reference model and weaken direct BibTeX
projection without improving authoring semantics.

### Include every private binary by default

This risks copyright, rights, size, and accidental disclosure failures.

### Import Zotero's database directly

That couples Kirjolab to private implementation details and a much broader
attachment and synchronization contract.

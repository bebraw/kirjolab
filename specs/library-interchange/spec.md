# Feature: Library Interchange

## Blueprint

### Context

Researchers need Zotero-compatible bibliography exchange and a safe way to
move Kirjolab research organization.

### Architecture

- CSL JSON import/export maps supported fields to and from canonical shared
  references.
- Import passes through existing identity normalization, provenance, and
  deduplication.
- `kirjolab-library-v1` ZIP archives contain `manifest.json`,
  `references.csl.json`, and `research.json`.
- Research metadata preserves distinct tags, collections, notes, and reading
  state.
- The first archive is metadata-only and explicitly omits binary artifacts.

### Security and Validation

- CSL JSON accepts at most 2,000 bounded identified items.
- Portable ZIP input is at most 5 MB and extracts only two exact metadata file
  names needed for import.
- Metadata arrays, labels, notes, ratings, priorities, and timestamps are
  bounded and validated before mutation.
- Import does not execute markup, scripts, TeX, archive paths, or remote URLs.

## Contract

### Definition of Done

- [x] Users can import and export Zotero-compatible CSL JSON.
- [x] Users can export and restore a versioned metadata archive.
- [x] Canonical reference deduplication remains authoritative.
- [x] Private research facets restore without becoming project data.
- [x] Unit, API, and browser tests cover interchange and archive boundaries.

### Regression Guardrails

- CSL JSON and archive representations must never become canonical storage.
- Portable export must not silently include private binary artifacts.
- Archive extraction must never honor caller-controlled paths.

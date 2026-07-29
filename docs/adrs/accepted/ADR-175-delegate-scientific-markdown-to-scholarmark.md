# ADR-175: Delegate Scientific Markdown to Scholarmark

**Status:** Accepted

**Date:** 2026-07-29

**Amends:** [ADR-035](./ADR-035-keep-markdown-canonical.md),
[ADR-062](./ADR-062-use-one-source-mapped-export-pipeline.md),
[ADR-102](./ADR-102-use-javascript-for-live-markdown-preview.md)

## Context

ADR-102 replaced the Satteri runtime with a local unified/remark pipeline. That
made preview substantially lighter, but Kirjolab retained the parser assembly,
sanitizer schema, scholarly transforms, bounded BibTeX parser, comment
projection, native figures, and their implementation tests. Scholarmark was
subsequently published from that renderer and now owns the same language as a
reusable package.

Scholarmark 0.6.0 exposes a tree-shakeable browser entry, a bounded
dependency-free BibTeX parser, synchronous rendering, public integration
helpers, and an optional Citation.js adapter. Its browser graph contains no Node
built-ins, Citation.js, fetch dependency, or implicit network behavior. Bundled
in Kirjolab's production build, it measures 204,779 bytes raw and 62,386 bytes
with gzip, compared with the previous 204,779-byte and 62,540-byte runtime.

Scholarmark standardizes cross-references around labels attached to Markdown
blocks. Kirjolab's earlier explicit heading ids, aliases, and standalone anchors
duplicate that model and keep the application on a private dialect.

## Decision

Pin `scholarmark` and delegate scientific Markdown parsing, sanitization,
diagnostics, bibliography parsing, portable comments, native figures, and
publication text helpers to its public API. Use `scholarmark/browser` for the
lazy preview runtime and the package's bounded default BibTeX parser. Do not
install or bundle the optional Citation.js adapter.

Retain only a narrow Kirjolab adapter where the existing preview runtime name
or result shape differs. Keep project composition, authorized image resolution,
preview lifecycle, source mapping across composed files, citation navigation,
and publication orchestration in Kirjolab.

Adopt Scholarmark's `::label[id]` declaration as the canonical reference form.
Migrate authored templates, LaTeX conversion, fixtures, and tests as follows:

- place a label immediately after a heading or other referenced block;
- remove aliases by rewriting their references to the canonical label;
- replace standalone anchors with labels on the block they identify; and
- retain explicit `text` on references when an old anchor title supplied the
  visible label.

Historical revisions remain immutable. Materialized current source and new
imports use the Scholarmark form; the package is not required to retain
Kirjolab's superseded syntax.

## Trigger

The user asked to integrate the published renderer to reduce local maintenance,
accepted migration to Scholarmark's existing reference forms, and requested a
lightweight bibliography path instead of Citation.js.

## Consequences

**Positive:**

- Kirjolab stops maintaining a second implementation of the Scholarmark
  language.
- Renderer fixes and language enhancements can land once in the package.
- The browser remains local, synchronous, sanitized, and independent of fetch.
- Citation.js and its Node-oriented dependency graph stay outside production.
- Public package helpers replace local copies used by export and analysis code.

**Negative:**

- Scholarmark upgrades become deliberate language and security changes that
  require Kirjolab's parity suite.
- Version 0.6.0 lacks a default export condition, so Playwright's CommonJS
  transform cannot resolve the package until an upstream patch release.
- Existing editable source must move from private aliases, anchors, and heading
  attributes to labels.

**Neutral:**

- Markdown and BibTeX remain canonical while syntax trees and HTML remain
  disposable.
- The lazy runtime retains its raw size and is 154 bytes smaller with gzip.
- The content-fingerprinted same-origin runtime and stale-render protections do
  not change.
- Contract-level tests remain local even when implementation-level tests move
  to Scholarmark.

## Alternatives Considered

### Retain the local renderer

This avoids a dependency but preserves over one thousand lines of duplicate
implementation and makes language fixes land twice.

### Use Scholarmark with Citation.js

Citation.js supports a broader BibTeX surface, but its browser bundle and
dependency graph exceed Kirjolab's bounded bibliography needs. The optional
adapter remains available to other hosts without entering this application.

### Import Scholarmark internals selectively

Private `dist` imports or build-time module substitution could produce a small
bundle, but would couple Kirjolab to unpublished file structure. The supported
browser entry and public helpers provide a stable boundary.

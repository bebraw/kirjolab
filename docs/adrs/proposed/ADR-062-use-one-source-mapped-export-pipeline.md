# ADR-062: Use One Source-Mapped Export Pipeline

**Status:** Proposed

**Date:** 2026-07-11

## Context

Kirjolab currently exports canonical Markdown and BibTeX separately. The
reviewed product model adds transclusion, project-local citation aliases,
shared-reference snapshots, LaTeX project export, and PDF output. Independent
format implementations could resolve includes, citations, templates, and assets
differently, making the preview, `.tex` bundle, and final PDF disagree.

Markdown must remain canonical under ADR-035. LaTeX and PDF are publication
targets with environment-sensitive toolchains and diagnostics that often refer
to generated lines rather than the authored file that caused a failure.

## Decision

All composed publication exports will use one deterministic, source-mapped
pipeline:

1. Resolve root `main.md`, bounded transclusions, citations, and project assets.
2. Build a source-mapped intermediate document carrying original file identity,
   range, and include-chain provenance.
3. Materialize either the maintained Kirjolab LaTeX template or an explicit
   project publication template together with cited bibliography and assets.
4. Run a pinned, isolated typesetting toolchain to produce PDF when requested.

LaTeX project and PDF output must use the same materialized bundle. Composition
and typesetting diagnostics map back to authored project files and ranges where
possible. A failed render preserves the last successful preview, marks it stale,
and exposes actionable diagnostics instead of replacing it with an empty pane.

Normal PDF, LaTeX, Markdown, and standalone bibliography exports include only
references reachable from the composed `main.md`. An archival source bundle may
also contain broader project-linked reference and evidence snapshots. Initial
multi-file exports are downloadable ZIP archives; directory synchronization is
a separate future integration.

The pipeline implementation, intermediate schema, converter, and TeX engine may
be selected during implementation, but their versions and templates must be
pinned at each reproducible export boundary.

## Trigger

The UI review found fragmented extension-specific exports, missing PDF and
LaTeX targets, and no coherent definition of what each export contains.

## Consequences

**Positive:**

- PDF and LaTeX output cannot drift through separate composition logic.
- Source-mapped failures lead researchers back to authored files rather than
  opaque generated output.
- Pinned templates and toolchains make milestone exports reproducible.
- One pipeline centralizes include, citation, asset, and export-scope rules.

**Negative:**

- A TeX-capable isolated execution environment is heavier than Worker-only HTML
  rendering and needs resource and security bounds.
- Source maps must survive multiple transformations and imperfect third-party
  diagnostics.
- Custom publication templates can introduce packages, assets, and failures
  outside Kirjolab's default template contract.

**Neutral:**

- Fast browser HTML preview may remain a separate derived representation, but
  it is not the authoritative PDF renderer.
- Direct local-directory integration may later consume the same materialized
  bundle without changing export semantics.

## Alternatives Considered

### Implement each export format independently

This allows format-specific shortcuts but duplicates include, citation, asset,
and template resolution and makes mismatched output likely.

### Print the browser preview to PDF

Browser printing is convenient but does not provide a portable LaTeX project,
publisher templates, deterministic pagination, or TeX diagnostics.

### Make LaTeX canonical

This would simplify the final typesetting step but rejects ADR-035's portable
Markdown authoring boundary and recreates the verbosity Kirjolab is intended to
hide.

### Export one generated `.tex` file

A single file appears simple but breaks as soon as the paper depends on images,
bibliography, templates, or other assets.

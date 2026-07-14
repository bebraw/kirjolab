# ADR-062: Use One Source-Mapped Export Pipeline

**Status:** Implemented

**Date:** 2026-07-11

**Amended:** 2026-07-14 — keep project identity out of visible publication titles

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
3. Materialize the maintained Kirjolab LaTeX template together with cited
   bibliography, manifest, and source map.
4. Run a pinned, bounded typesetting toolchain over that same intermediate to
   produce PDF when requested.

LaTeX project and PDF output must use the same materialized bundle. Composition
and typesetting diagnostics map back to authored project files and ranges where
possible. A failed render preserves the last successful preview, marks it stale,
and exposes actionable diagnostics instead of replacing it with an empty pane.

Normal PDF, LaTeX, Markdown, and standalone bibliography exports include only
references reachable from the composed `main.md`. An archival source bundle may
also contain broader project-linked reference and evidence snapshots. Initial
multi-file exports are downloadable ZIP archives; directory synchronization is
a separate future integration.

The pipeline implementation, intermediate schema, converter, and rendering
engine may be selected during implementation, but their versions and templates
must be pinned at each reproducible export boundary. Arbitrary project-authored
TeX must not execute in the hosted Worker without a separately isolated,
resource-bounded engine.

The project-settings title identifies the project and remains PDF metadata plus
a non-printing LaTeX declaration. It is not publication body content. Direct
PDF must begin with the composed Markdown blocks, and generated LaTeX must not
call `\maketitle`; an authored Markdown H1 therefore owns the visible document
title without a duplicate settings-derived heading.

## Implementation

The implemented `kirjolab-export-v1` intermediate drives all export endpoints,
the live `kirjolab-prose-v1` statistics projection, and revision word deltas.
It materializes `kirjolab-article-v3`, citation-scoped BibTeX, generated-line
source maps, and pinned manifests. `fflate@0.8.3` produces byte-reproducible
LaTeX and archival ZIPs.

The hosted PDF boundary is `kirjolab-pdf-lib-v2@1.17.1`. It is a bounded,
deterministic renderer over the same intermediate and performs no network
access or authored-code execution. Version 2 removes the settings-derived
visible title while retaining PDF metadata. It deliberately supports a smaller
layout vocabulary than full TeX. The LaTeX ZIP is the publisher-facing
representation for full external compilation. Its `kirjolab-article-v3`
template likewise retains a non-printing title declaration without invoking
`\maketitle`. Attaching and executing arbitrary custom publication templates
remains deferred until Kirjolab has a suitable isolated TeX runtime; adding it
must extend this pipeline rather than create a second composition path.

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
- Authored Markdown, rather than project administration metadata, owns the
  visible publication title.

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

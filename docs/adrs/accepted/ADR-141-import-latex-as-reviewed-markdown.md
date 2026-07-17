# ADR-141: Import LaTeX as Reviewed Markdown

**Status:** Accepted

**Date:** 2026-07-17

## Context

Researchers may have older papers in Overleaf archives whose durable scholarly
content is split across LaTeX files, BibTeX databases, and figures. Kirjolab
keeps Markdown canonical, composes projects through explicit includes, and
models references in a shared owner library. Import should recover content and
structure without making TeX another editable authority or preserving
publisher-specific typesetting machinery.

LaTeX is a programmable macro language. Running an uploaded document through a
native TeX installation in the trusted Worker would create filesystem,
resource, and command-execution risks. Shipping a complete converter to every
browser would make the normal client materially heavier for an occasional,
latency-insensitive migration workflow.

## Decision

Add a two-stage, server-side LaTeX archive import workflow:

1. An authenticated preview endpoint accepts one bounded ZIP as transient
   request data.
2. The Worker validates and normalizes every archive path before extraction.
3. It identifies candidate root documents and resolves archive-local `\input`
   and `\include` relationships without executing TeX.
4. A conservative TypeScript converter maps a documented scholarly LaTeX
   subset into Kirjolab Markdown, citations, references, footnotes, code
   fences, and `::include[path]` directives.
5. The response presents the derived file tree, entry file, diagnostics,
   ignored files, bibliography plan, and preserved TikZ blocks.
6. Confirmation uploads the archive again with a title and reviewed root and
   bibliography selections. The Worker repeats inspection and conversion
   rather than trusting browser-supplied derived content.
7. Only after full validation does the Worker initialize a normal project.

Uploaded ZIP and source TeX are transient request inputs and are never stored.
Imported Markdown becomes canonical immediately; TeX never participates in
editing, collaboration, composition, or export.

Publisher classes, packages, fonts, compiled manuals, auxiliary files, and
layout-only commands are ignored with source-qualified diagnostics. Unsupported
or ambiguous constructs are never guessed or silently deleted. The first
importer explicitly targets common scholarly LaTeX, not arbitrary TeX
compatibility.

## Trigger

An Overleaf archive for “The Case for HTML First Web Development” demonstrated
that existing papers map naturally onto Kirjolab's file composition and
bibliography models while also containing publisher boilerplate that should not
become canonical project source. The project owner chose server-side logic to
keep the client light and accepted one-off conversion latency.

## Consequences

**Positive:**

- Researchers can migrate multi-file archives without flattening authored
  structure.
- Conversion stays out of the normal client bundle and uses the same code for
  preview and confirmation.
- Uploaded source remains transient and never becomes project authority.
- Imported projects immediately follow existing Markdown and history contracts.

**Negative:**

- A conservative converter supports less LaTeX than Pandoc or TeX Live and
  needs compatibility fixtures from real archives.
- Conversion cannot reproduce publisher layout, arbitrary macros, shell-escape
  workflows, or package-defined environments.
- The archive is uploaded twice when a preview is confirmed.

**Neutral:**

- LaTeX remains a one-way import and an export target, not a round-trip format.
- Shared-library reconciliation may report duplicate or incomplete BibTeX
  records for separate review instead of fabricating metadata.

## Alternatives Considered

### Run a native TeX and Pandoc service

This offers broad compatibility but introduces a separate isolated execution
service, operational state, and a materially larger attack surface. It may be
reconsidered if the conservative converter proves insufficient.

### Run Pandoc WebAssembly in the browser

This provides stronger conversion without server execution, but adds a large
optional client asset and GPL distribution obligations. It conflicts with the
decision to keep the client light.

### Flatten the compiled PDF back into Markdown

PDF extraction loses source structure, citation aliases, includes, comments,
code semantics, and reliable reading order. It remains a last-resort recovery
path, not the LaTeX importer.

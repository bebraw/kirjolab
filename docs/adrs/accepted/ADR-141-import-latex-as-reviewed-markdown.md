# ADR-141: Import LaTeX as Reviewed Markdown

**Status:** Accepted

**Date:** 2026-07-17

## Context

Researchers may have older papers in Overleaf archives whose durable scholarly
content is split across LaTeX files, BibTeX databases, and figures. Kirjolab
keeps Markdown canonical, composes projects through explicit includes, and
models references in a shared owner library. A useful import therefore needs to
recover content and structure without making TeX another editable authority or
attempting to preserve publisher-specific typesetting machinery.

LaTeX is a programmable macro language. Running an uploaded document through a
native TeX installation in the hosted Worker would create filesystem, resource,
and command-execution risks that conflict with the existing bounded export
architecture. A hand-written text replacement pipeline would avoid execution
but would be unreliable around nested syntax, environments, citations, math,
and custom commands.

Pandoc provides a maintained LaTeX reader and a WebAssembly build that operates
against an explicitly supplied virtual filesystem. Browser-local conversion can
keep the original archive off the server while producing a reviewable project
seed for normal server validation and project creation.

## Decision

Add an explicit, previewed LaTeX archive import workflow. The browser will:

1. read a bounded ZIP archive without executing its contents;
2. validate and normalize every archive path before extraction;
3. identify candidate root documents and resolve only archive-local
   `\input` and `\include` relationships;
4. use a pinned, lazily loaded Pandoc WebAssembly runtime to parse supported
   LaTeX content;
5. adapt the resulting structure into Kirjolab Markdown, citations,
   cross-references, footnotes, code fences, and `::include[path]` directives;
6. retain supported figures and bibliography inputs as separately identified
   import resources; and
7. present the complete derived file tree, entry file, diagnostics, ignored
   files, and bibliography plan before confirmation.

Confirmation sends only the bounded derived import seed and accepted binary
resources to the Worker. The Worker revalidates paths, UTF-8 text, file counts,
sizes, entry identity, image media types, and inert SVG rules before creating a
normal independent project. Imported Markdown becomes canonical immediately;
the source TeX and Pandoc syntax tree are transient conversion inputs and never
participate in editing, collaboration, composition, or export.

Publisher classes, packages, fonts, compiled manuals, auxiliary files, and
layout-only commands are ignored with diagnostics. Unsupported content is
never silently deleted: the preview identifies its source path and construct,
and retains a bounded source excerpt as inert review material when doing so is
safe and useful.

The initial importer targets common scholarly LaTeX rather than arbitrary TeX
compatibility. Custom macros may be expanded only when their definitions and
uses remain within the imported virtual filesystem and Pandoc's sandboxed
reader can resolve them without external programs or network access.

## Trigger

An Overleaf archive for “The Case for HTML First Web Development” demonstrated
that existing papers map naturally onto Kirjolab's file composition and
bibliography models while also containing substantial publisher boilerplate
that should not become canonical project source.

## Consequences

**Positive:**

- Researchers can migrate multi-file Overleaf papers without flattening their
  authored structure.
- Conversion remains local until an explicit reviewed confirmation.
- Pandoc handles common LaTeX structure more reliably than project-specific
  regular expressions.
- Imported projects immediately follow existing Markdown, reference, history,
  and export contracts.

**Negative:**

- The pinned Pandoc WebAssembly runtime is a large optional browser asset and
  adds GPL-2.0-or-later distribution obligations.
- Conversion cannot reproduce publisher layout, arbitrary macros, shell-escape
  workflows, or every package environment.
- Import diagnostics and compatibility fixtures require ongoing maintenance as
  real archives expose new constructs.

**Neutral:**

- LaTeX remains an export target as well as a one-way import format; it does not
  become a canonical round-trip representation.
- Shared-library reconciliation may report duplicate or incomplete BibTeX
  records for separate review instead of fabricating metadata.

## Alternatives Considered

### Run a native TeX and Pandoc service

This offers broad package compatibility but introduces a separate isolated
execution service, operational state, and a materially larger attack surface.
It is disproportionate for the initial migration workflow.

### Implement a TypeScript-only LaTeX subset

A small parser could cover headings and emphasis, but scholarly archives depend
on nested environments, macro expansion, citations, math, and tables. The
maintenance burden would quickly approach that of a document converter while
remaining less compatible.

### Flatten the compiled PDF back into Markdown

PDF extraction loses source structure, citation aliases, includes, comments,
code semantics, and reliable reading order. It remains a last-resort recovery
path, not the LaTeX importer.

# ADR-114: Accept Inert SVG Project Images

**Status:** Implemented

**Date:** 2026-07-15

## Context

SVG is a common publication figure format because it preserves vector detail,
editable labels, and compact diagrams. Kirjolab's project asset pipeline rejects
SVG because an SVG document can contain scripts, event handlers, embedded HTML,
external resources, and XML entity declarations. Serving arbitrary SVG from an
authenticated same-origin endpoint would cross the passive-image trust boundary
established by ADR-111.

Rasterizing every SVG would require a new image-processing dependency or
service, discard the editable original from normal preview, and complicate the
lightweight Worker deployment. A simple MIME check is insufficient because the
declared type says nothing about active XML content.

## Decision

Kirjolab will accept a constrained SVG subset as `image/svg+xml` below
`figures/`. Upload validation will require bounded, valid UTF-8 input with an
SVG root and reject DTD or entity declarations, scripts, embedded documents,
event-handler attributes, CSS imports, and references outside the document or
embedded raster data. The validator operates on the complete bounded object,
not only a prefix or the declared MIME type.

Authorized SVG responses will retain `image/svg+xml` and `nosniff`, and add a
Content Security Policy with an opaque-origin sandbox, no scripts, and no
network resource access. Kirjolab will use SVG only through ordinary image
elements in the file rail and Markdown Preview. Source archives and backups
retain the accepted original bytes.

The SVG media type and constraint become part of the durable project-asset
schema. Existing raster records require no byte or metadata rewrite.

## Trigger

Researchers need vector figures in the same upload, preview, Markdown, backup,
and source-export workflow as raster project images.

## Consequences

**Positive:**

- Scientific diagrams retain vector quality and portable SVG source.
- The existing asset identity, authorization, backup, and export model remains
  unchanged.
- Active content and external requests fail at upload and again at the response
  sandbox boundary.

**Negative:**

- Interactive SVG and SVG that embeds remote fonts, styles, documents, or
  images is intentionally unsupported.
- The validator maintains a conservative SVG subset rather than implementing a
  complete XML and CSS sanitizer.
- Full-object validation temporarily reads up to the existing 20 MiB image
  limit into Worker memory.

**Neutral:**

- Publication PDF and LaTeX image embedding remain deferred.
- Raster image behavior and limits do not change.

## Alternatives Considered

### Accept arbitrary SVG with its declared MIME type

Rejected because direct same-origin navigation could execute active content or
load attacker-selected resources.

### Rasterize SVG on upload

Rejected because no trusted renderer exists in the current Worker stack and a
new dependency or external service would add disproportionate deployment and
maintenance cost.

### Sanitize and rewrite arbitrary SVG

Rejected because a handwritten XML/CSS sanitizer is difficult to keep correct.
The narrower validator rejects risky constructs instead of attempting to
rewrite them safely.

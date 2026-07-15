# ADR-111: Store Project Images as Assets

**Status:** Implemented

**Date:** 2026-07-15

**Supersedes in part:** [ADR-057](./ADR-057-compose-projects-from-markdown-files.md)

## Context

Project composition previously modeled only collaborative Markdown files and
treated binary asset management as deferred. Authors could write Markdown image
syntax, but the project had no portable place to upload the referenced bytes,
preview them, retain them in history and backups, or include them in a source
archive.

Image bytes are untrusted input. Keeping them in collaborative SQLite and Yjs
state would increase synchronization cost, while accepting active formats such
as SVG would create a same-origin content execution boundary.

## Decision

- A project image has a stable asset id, a project-relative path, bounded media
  metadata, an R2 object key, and a binary fingerprint.
- The reserved durable `figures/` folder is created for every starter and
  existing project. Uploaded images must remain beneath that folder.
- SQLite stores image identity and metadata in the `DocumentRoom`; R2 stores
  the bytes. Asset metadata participates in snapshots, revisions, restore,
  revision seeds, and binary identity comparisons.
- Uploads accept PNG, JPEG, GIF, WebP, and AVIF up to 20 MiB. The API checks the
  declared media type and matching filename extension, rejects SVG, and serves
  authorized objects with `X-Content-Type-Options: nosniff`.
- The file rail uploads one or more images, displays thumbnails, inserts a
  relative Markdown image reference at the collaborative caret, opens the
  original, and deletes it. Live preview resolves relative image paths through
  the composition source map.
- Logical backups reference current project asset objects. Source ZIP export
  copies current image bytes under `project-assets/{path}`.

## Consequences

- Images become normal, portable project resources without entering Yjs update
  traffic or SQLite binary storage.
- Relative paths remain readable Markdown and work from supporting files and
  included compositions.
- Public read-only rendering and publication PDF/LaTeX image embedding remain
  separate follow-up contracts; source archives preserve the original bytes.
- Rejecting SVG excludes a common figure format, but avoids an active-content
  sanitizer and same-origin script policy in this lightweight starter.
- An image upload requires two coordinated writes. Failed metadata registration
  removes the just-uploaded object so it cannot become an orphan.

## Alternatives Considered

Storing base64 images inside Markdown would bloat Yjs state, history, diffs,
and every collaborator sync. Treating images as ordinary Worker static files
would not support runtime uploads or per-project authorization. Accepting SVG
with only a MIME check was rejected because SVG is active document content
rather than a passive raster image.

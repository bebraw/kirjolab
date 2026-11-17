# ADR-251: Rewrite Anonymous PDF Reviews

**Status:** Implemented

**Date:** 2026-11-17

## Context

Researchers need to return annotated papers without exposing reviewer names
stored by Kirjolab or an earlier editor such as Preview. Annotation authors,
ordinary document information, XMP, private editor data, and earlier PDF
revisions are separate identity channels. Removing a displayed author alone
does not remove the underlying data.

## Decision

Add an explicit owner-only **Export anonymous review** action and download
endpoint. Render the selected artifact's complete bounded saved annotations
through the existing renderer and current-object normalization from ADR-250.
Then replace every embedded or new annotation author with **Reviewer**. Remove
annotation identifiers, dates, subjects, rich-text payloads and private editor
extensions while retaining standard content, geometry, appearances, and reply
relationships. Reject rich-text-only comments whose text cannot be preserved.

Remove the complete ordinary information dictionary and trailer identifiers,
all reachable XMP metadata entries, and private application `PieceInfo` data.
Prune all objects unreachable from the sanitized catalog, then write a fresh,
non-incremental PDF with the existing pinned pdf-lib writer. Bound traversal to
250,000 objects and output to 50 MiB before allocating the final buffer. Reopen
the exact saved bytes with metadata updates disabled, check the page count,
author and metadata invariants, references and absence of unreachable objects,
and fail the download if validation fails. Independent PDF.js regressions check
the recipient's page text and annotations.

Use `anonymous-review.pdf` so the original filename cannot leak a reviewer's
name. Preserve original stored bytes and private annotations. Explain in the
action that visible text is retained: identifying words in comments, page
content, and visual appearances require the researcher's own review.

Use the existing artifact-specific, 10,000-annotation/4 MiB source for both
derived download modes; navigation snapshots must not truncate exports. No
storage, schema, authentication, dependency, or public-link change is needed.

## Consequences

- Imported comments and new review comments retain editable annotation content.
- Old revisions, detached author strings, ordinary metadata and XMP cannot
  survive merely because an editor appended a new revision.
- A separate opt-in action keeps ordinary annotated export behavior explicit.
- The additional graph traversal, full write, and reparse cost time and memory.
- Private annotation extensions and rich formatting are discarded. Files with
  rich-text-only comments fail rather than lose their review text.
- This is metadata anonymization, not automated redaction of visible content.

## Alternatives Considered

- Renaming only newly created annotations would leave imported author fields.
- Clearing only the information dictionary would leave XMP and detached objects.
- Incremental saving would preserve identifying historical bytes.
- Flattening comments would lose native editing and reply relationships.
- A second rewriting engine would add a dependency without a demonstrated need.

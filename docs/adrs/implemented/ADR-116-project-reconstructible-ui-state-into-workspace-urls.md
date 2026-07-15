# ADR-116: Project Reconstructible UI State into Workspace URLs

**Status:** Implemented

**Date:** 2026-07-15

## Context

Workspace navigation was browser-local but mostly memory-only. Refreshing a
project returned to the entry file, Files rail, writing surface, and Preview
even when the researcher had been examining another file or research target.
The desktop layout alone survived through local storage, while standalone
private PDF reading already had a useful browser-history contract in ADR-110.

Serializing the whole interface would be unsafe and brittle. Draft form text,
editor selections, scroll offsets, pane geometry, dialogs, and the complete
open-tab session are transient implementation details rather than stable
locations. Resource ids also cannot be trusted merely because they occur in a
URL.

## Decision

- Workspace routes use bounded query parameters for the active non-entry file,
  rail, authoring mode, narrow surface, desktop layout, active context target,
  and active PDF page or focused annotation.
- Defaults are omitted and parameters not owned by workspace navigation are
  preserved.
- Resource and file ids are restored only when present in the current
  authorized workspace or owner-library snapshot. Missing, malformed, or
  unauthorized targets fall back to the entry file and Preview and are removed
  when the URL is canonicalized.
- Context-target changes push a history entry. File, rail, mode, surface,
  layout, and PDF-page changes replace the current entry.
- The URL does not contain drafts, form fields, editor selections, scroll
  positions, pane widths, dialog state, pin state, or inactive open tabs.
  Existing local-storage and in-memory contracts remain responsible for those
  concerns.

## Consequences

- Refreshing or sharing a workspace URL returns to the same meaningful view
  when the recipient is authorized for its resources.
- Browser Back follows research targets without becoming a log of page turns
  and layout adjustments.
- Query state remains a projection of authorized data, never an authorization
  source or collaborative persistence channel.
- The full tab session is intentionally not restored from the URL; only the
  selected target is reconstructed.

## Alternatives Considered

Persisting everything in local storage would survive refresh on one browser
but would not make a location shareable or participate in browser history.
Serializing the entire tab/session model would create long, stale URLs and
expose transient writing state. Pushing every UI change would make Back noisy,
especially while paging through a PDF.

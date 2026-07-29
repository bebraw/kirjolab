# ADR-182: Retain the Native Editor After the CodeMirror Spike

**Status:** Implemented

**Date:** 2026-07-29

## Context

ADR-077 and ADR-078 retained a native textarea while Kirjolab added mirrored
syntax presentation and bounded Vim commands. The editor now also coordinates
Yjs synchronization, awareness, relative selections, shared undo, citation and
include completion, configurable indentation, spellcheck, touch input, and
offline loading. The modularization RFC required a measured CodeMirror 6 spike
before those responsibilities could move to an external editor framework.

The development-only spike binds CodeMirror to two synchronized `Y.Text`
instances through `y-codemirror.next`. It exercises awareness and remote
selection rendering, relative-position stability, shared undo, completion
precedence over indentation, spaces and literal tabs, bounded Scholarmark
presentation, the maintained Vim extension, accessibility attributes, and a
250,000-character document. The runner bundles in memory and loads the result
into a touch-sized Playwright Chromium context without external requests.

All automated checks pass. A representative run initialized the collaborative
editor in 7.2 ms and the long document in 80.3 ms. The isolated minified bundle
is 772,100 raw bytes and 257,760 gzip bytes. Physical iPad hardware and software
keyboard behavior, genuine IME composition, touch selection, screen-reader
editing, and forced-colors behavior are not established by synthetic Chromium
events.

## Decision

Retain the native textarea as Kirjolab's production manuscript input surface.
Keep CodeMirror and its Yjs and Vim adapters as exact-pinned development
dependencies used only by `npm run spike:codemirror`. Do not import them from
the browser application or include them in the fingerprinted offline shell.

The spike is durable evidence, not a parallel editor implementation. A future
adoption proposal must supersede ADR-077, ADR-078, and this decision; repeat the
bundle measurement; and provide physical iPad, real IME, touch-selection,
screen-reader, forced-colors, reconnect, and offline-shell evidence.

## Consequences

**Positive:**

- The production dependency graph and browser artifacts do not gain the
  approximately 258 KB gzip experimental editor runtime.
- Existing native input, accessibility, collaboration, selection, and offline
  contracts remain unchanged.
- The reproducible spike proves that core Yjs, completion, indentation,
  presentation, and delegated Vim mechanics are technically viable.

**Negative:**

- Kirjolab continues maintaining its bounded textarea highlighting,
  completion, indentation, and Vim infrastructure.
- CodeMirror's richer parsing and editor extension ecosystem remains
  unavailable in production.
- Development installs include additional packages and their dev-only audit
  surface; the production audit remains clean.

**Neutral:**

- The spike intentionally provides no runtime fallback or feature flag.
- Timing is diagnostic evidence from local Chromium, not a production service
  objective.

## Alternatives Considered

### Adopt CodeMirror now

The automated mechanics are promising, but adoption would accept a large lazy
bundle and replace a sensitive input boundary before its highest-risk tablet,
IME, and assistive-technology contracts have evidence.

### Remove the spike after deciding

That would minimize development dependencies, but it would discard the
reproducible comparison and make a later reevaluation repeat setup work.

### Ship both editors behind a preference

Two production input and collaboration paths would increase maintenance and
make behavioral drift likely without resolving the parity gaps.

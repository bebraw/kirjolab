# ADR-181: Incubate PDF-Analysis Core

**Status:** Implemented

**Date:** 2026-07-29

## Context

PDF highlight detection and bibliography parsing began in client modules that
also loaded PDF.js documents, rendered pages, and managed browser resources.
The pure mechanics—native annotation normalization, flattened-yellow-region
detection, text matching, bibliography boundary detection, entry parsing,
deduplication, and confidence scoring—do not require PDF.js or a browser.

Keeping those algorithms in browser adapters made server-side analysis appear
client-specific and made a later citation-extraction kind likely to duplicate
normalization or parsing behavior. Publishing a package now would be premature:
the API has only Kirjolab consumers and still needs to evolve with additional
analysis kinds.

## Decision

Incubate a source-local PDF-analysis core behind
`src/lib/pdf-analysis/index.ts`. Its public input contracts describe normalized
pages, text spans, bitmaps, viewports, and native annotations. The core owns:

- native PDF highlight normalization;
- flattened highlight region detection and text matching;
- highlight candidate deduplication;
- bibliography boundary detection;
- reference-entry grouping and parsing;
- reference deduplication and confidence scoring; and
- existing bounded result construction.

The core may import pure Kirjolab domain result contracts. It must not import
PDF.js, browser globals, client UI, API handlers, Durable Objects, queues,
storage, or Cloudflare runtime types.

Client and managed-browser adapters continue to load PDF.js documents, convert
text items and canvas pixels into normalized inputs, enforce page iteration and
resource cleanup, and deliver the existing result contracts. Compatibility
delegates preserve existing internal imports while consumers migrate.

## Trigger

Highlight and reference analysis are two real analysis kinds using the same
mechanics, and the modularization RFC identified citation extraction as the
next likely consumer. This is enough to establish an internal boundary but not
enough to publish a package.

## Consequences

**Positive:**

- Browser and server adapters share one implementation of PDF-analysis
  mechanics.
- Pure algorithms remain fast to test without PDF.js or Cloudflare runtime
  setup.
- Future citation extraction can consume normalized pages and candidates
  without joining the queue or UI lifecycle.
- Heavy PDF.js loading remains outside the core and lazy browser path.

**Negative:**

- Normalization adapters remain responsible for preserving PDF.js coordinate
  and text-order semantics.
- Compatibility delegates temporarily expose both old and new internal import
  paths.
- The source-local API may still change before another analysis kind consumes
  it.

**Neutral:**

- Analysis results, page and candidate bounds, queue state, storage,
  authorization, and UI behavior remain unchanged.
- No dependency, workspace package, or public release process is added.

## Alternatives Considered

### Keep the algorithms in client modules

Rejected because managed-browser execution and future server-side analysis
would continue importing a client authority for pure mechanics.

### Move PDF.js document loading into the core

Rejected because it would couple the reusable boundary to browser execution,
worker configuration, and a heavy runtime dependency.

### Publish `pdf-analysis-core` immediately

Rejected because there is no external consumer, versioned public contract, or
release owner. Source-local incubation provides the boundary without premature
package overhead.

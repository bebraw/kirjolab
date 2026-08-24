# ADR-178: Queue Private Artifact Analysis

**Status:** Implemented

**Date:** 2026-07-29

**Amended:** 2026-08-24 — preserve rollout compatibility, recover Queue publication through a durable outbox, and reconcile pre-outbox jobs

## Context

Imported-highlight detection needs PDF.js text extraction and canvas rendering.
Running that work in the reader made the feature discoverability-dependent,
spent tablet resources, and required an explicit Detect action. Ordinary Worker
execution does not provide the browser canvas environment used by the existing
detector. The same asynchronous infrastructure could later support other
bounded PDF analysis, including citation extraction.

The PDF is owner-private in R2. Any background design must preserve that access
boundary, tolerate Queue at-least-once delivery, avoid transferring document
bytes in messages, and keep machine-derived data reviewable rather than silently
turning it into research records.

## Decision

Queue a versioned artifact-analysis job after successful PDF intake. The job
contains only the owner key, artifact id, immutable fingerprint, analysis kind,
and request time. Store queued, running, ready, and failed state plus bounded
results in the owner's Reference Library Durable Object. Every state transition
checks the artifact fingerprint and request time, making duplicate or stale
deliveries harmless.

Reserve Queue publication atomically in that Durable Object. The additive
`reserveArtifactAnalysisQueuePublication` RPC returns both the current analysis
and whether this caller owns publication. Only the caller that created or
explicitly forced the queued generation sends
the message. Concurrent ordinary starts return the same persisted generation
without publishing duplicates.

Persist a fingerprint- and request-qualified publication outbox row in the
same SQLite transaction as a newly queued generation. Schedule the owner
Durable Object's alarm before that transaction commits. The requesting Worker
still attempts an immediate Queue send for latency and removes the matching
outbox row only after Queue confirms durable acceptance. A send or confirmation
failure leaves the analysis queued and the outbox pending. The alarm publishes
at most 100 pending jobs per batch, deletes only confirmed rows, schedules the
next batch while rows remain, and explicitly reschedules after a Queue failure.
Starting, completing, or failing that exact generation also clears its stale
outbox row. Queue consumers remain idempotent because termination after Queue
acceptance but before outbox deletion can produce a duplicate delivery.

Apply an append-only migration that inserts a placeholder outbox row for every
queued generation left by the pre-outbox workflow. During Durable Object
initialization, arm recovery and replace each placeholder with the object name
before serving events. This upgrade reconciliation runs once, so it recovers
the old commit-before-send failure window without repeatedly republishing a
queued generation whose current outbox row was already confirmed.

Retain `queueArtifactAnalysis` with its original plain `ArtifactAnalysis`
response while an older Worker may call it. New consumers use the additive
reservation RPC. This keeps the provider-first cross-script rollout compatible
when old and new Worker versions overlap.

Use Cloudflare Browser Run with its Puppeteer binding for PDF.js and canvas
execution. The consumer loads the exact bounded R2 object, intercepts the
browser's synthetic PDF and PDF-worker requests, and blocks all other requests.
No public analysis route, signed artifact URL, or reusable bearer credential is
introduced. Close every browser session in `finally`.

Keep `pdf-highlights` as the first analysis kind behind a generic envelope and
add `pdf-references` as the second. Reference analysis locates a conventional
bibliography heading, groups numbered or author-year entries, and preserves the
bounded raw citation beside best-effort title, author, year, DOI, URL, and source
page fields. Each kind has independent lifecycle state and bounded result
validation. Future kinds may reuse the queue, but must retain that separation.

The reader polls server-owned status automatically. It shows highlight
candidates for review and reference candidates for inspection, supports an
explicit retry after either failure, and retains explicit atomic import as the
only operation that creates private highlights. Reference candidates do not
silently create library records or citation-graph assertions.

## Consequences

**Positive:**

- Highlight discovery no longer depends on opening the reader or pressing a
  Detect button.
- Queue retries and Durable Object guards make analysis resilient and
  idempotent.
- Durable alarm recovery prevents a queued analysis from depending on the
  requesting Worker surviving through Queue acceptance.
- Queued generations persisted before the outbox existed enter the same durable
  recovery path on upgrade.
- Concurrent start requests publish one Queue message for one persisted job
  generation.
- Private PDFs are not exposed through a new HTTP capability.
- PDF bibliography extraction reuses the job lifecycle without coupling its
  result schema or UI state to highlights.
- Persisted source-page and identifier fields provide a bounded input for later
  reviewed citation-graph edges.

**Negative:**

- Production requires a Queue, Browser Run usage, and the Cloudflare Puppeteer
  runtime dependency.
- A consumer temporarily buffers one PDF, bounded by the existing 25 MB intake
  limit, while fulfilling the intercepted browser request.
- Local unit tests validate orchestration boundaries; full managed-browser
  behavior still requires a Browser Run integration environment.
- Each owner Durable Object now stores a small publication outbox and may wake
  on an alarm until Queue accepts every pending job.
- Heuristic bibliography parsing favors conventional headings and numbered or
  author-year entries; unusual layouts remain visible only after future parser
  improvements rather than being guessed into library records.

## Alternatives Considered

### Keep detection in the reader

This avoids server infrastructure but preserves an obscure manual action and
makes every device repeat expensive rendering work.

### Expose a temporary artifact URL to Browser Run

A signed or one-time route could stream R2 directly, but it adds credential
state and a new network-access boundary for private documents. Request
interception keeps the document inside the active job.

### Run PDF.js directly in the Worker

Text-only paths can work in server JavaScript, but flattened-highlight
detection depends on browser canvas rendering. Maintaining a second renderer or
native binary path would duplicate behavior and add more infrastructure.

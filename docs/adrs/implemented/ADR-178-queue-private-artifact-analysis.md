# ADR-178: Queue Private Artifact Analysis

**Status:** Implemented

**Date:** 2026-07-29

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

Use Cloudflare Browser Run with its Puppeteer binding for PDF.js and canvas
execution. The consumer loads the exact bounded R2 object, intercepts the
browser's synthetic PDF and PDF-worker requests, and blocks all other requests.
No public analysis route, signed artifact URL, or reusable bearer credential is
introduced. Close every browser session in `finally`.

Keep `pdf-highlights` as the first analysis kind behind a generic envelope.
Future kinds such as citation extraction may reuse the queue and lifecycle, but
must define their own bounded result validation and review workflow.

The reader polls server-owned status automatically. It shows candidates for
review, supports an explicit retry after failure, and retains explicit atomic
import as the only operation that creates private highlights.

## Consequences

**Positive:**

- Highlight discovery no longer depends on opening the reader or pressing a
  Detect button.
- Queue retries and Durable Object guards make analysis resilient and
  idempotent.
- Private PDFs are not exposed through a new HTTP capability.
- Citation extraction can reuse the job lifecycle without coupling its result
  schema to highlights.

**Negative:**

- Production requires a Queue, Browser Run usage, and the Cloudflare Puppeteer
  runtime dependency.
- A consumer temporarily buffers one PDF, bounded by the existing 25 MB intake
  limit, while fulfilling the intercepted browser request.
- Local unit tests validate orchestration boundaries; full managed-browser
  behavior still requires a Browser Run integration environment.

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

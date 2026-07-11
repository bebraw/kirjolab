# ADR-056: Persist Grounded Passage Revisions

**Status:** Accepted

**Date:** 2026-07-11

## Context

ADR-039 requires explicit model context, provenance-aware candidates, and a
separate review-and-apply action. The first implementation approximates that
boundary by sending a selected passage plus annotations to an OpenAI-compatible
endpoint, but it asks for and persists an entire replacement document. The
candidate stores untyped source ids and the review surface exposes raw full
Markdown.

Whole-document output makes a small local model solve a larger task, obscures
the actual change, and risks replacing unrelated concurrent work. Untyped ids
also cannot prove which evidence representation grounded the request.

## Decision

The first fully typed model operation will be `revise-selection`. Before any
provider request, the browser captures one immutable operation base:

- the current manuscript revision and exact selected passage
- a bounded researcher instruction
- one or more typed annotation or claim references with their current version
- the provider endpoint identity and model name

A provider-neutral browser interface will accept that operation request. The
initial adapter will call an explicitly configured OpenAI-compatible HTTP
endpoint from the browser, never from the hosted Worker, and will request only
replacement Markdown for the selected passage. Provider responses are bounded
and mapped before candidate creation.

After the provider returns, `DocumentRoom` will verify that the manuscript
revision, exact passage, and every evidence version still match. It will create
a durable Yjs-relative target anchor and persist an immutable evidence snapshot,
instruction, provider/model identity, and proposed replacement. Stale or
unknown inputs create no candidate.

Candidate review will show the original passage, proposed replacement, and
navigable evidence together. Applying remains explicit and is allowed only for
a pending candidate whose source revision and exact anchored target are still
current. Application replaces only that target range through a Yjs splice and
atomically marks the candidate accepted; rejection changes only candidate
status.

The pre-launch whole-document candidate table will be replaced by an
append-only migration. Legacy candidate rows are disposable derived state and
will not receive compatibility behavior.

## Trigger

The first vertical slice now has durable evidence, claims, manuscript anchors,
and research context. A selection-scoped operation completes the traceable
evidence-to-prose loop without expanding into chat or general automation.

## Consequences

**Positive:**

- Local models receive smaller, clearer tasks and less manuscript data.
- Review focuses on the exact proposed change and its evidence basis.
- Typed, versioned evidence prevents unknown or changed resources from being
  recorded as provenance.
- Targeted Yjs application cannot overwrite unrelated manuscript text.

**Negative:**

- The candidate schema and review UI become richer.
- Conservative revision validation rejects a candidate after any intervening
  manuscript change, even when the target still resolves.
- Claims need version checks in addition to manuscript revision checks.

**Neutral:**

- ADR-039 remains accepted: companion-process support and additional operation
  types are not completed by this slice.
- OpenAI-compatible JSON is an adapter detail, not the domain operation shape.

## Alternatives Considered

### Keep whole-document candidates and render a calculated diff

A diff would improve review but would not reduce provider scope or prevent a
full-document proposal from carrying unrelated changes.

### Store only evidence ids

Ids support navigation but do not preserve the exact annotation or claim basis
used by the model, and edited claims could silently change candidate provenance.

### Let anchors survive unrelated revisions automatically

Yjs anchors can often resolve after concurrent edits, but accepting such output
requires a more nuanced rebase policy. The first operation keeps conservative
revision equality so stale behavior is predictable.

### Apply model output directly to the selected text

This removes candidate storage and a click, but violates the human review and
provenance boundary chosen by ADR-039.

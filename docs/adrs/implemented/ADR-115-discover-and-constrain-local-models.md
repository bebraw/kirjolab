# ADR-115: Discover and Constrain Local Writing Models

**Status:** Implemented

**Date:** 2026-07-15

## Context

Writing assistant accepts an OpenAI-compatible loopback endpoint and a manually
entered model identifier. The starter value `local-model` is not normally a
real loaded identifier, so the first operation can fail before the researcher
knows which models the provider exposes. Direct browser discovery is also
unavailable when a local provider omits CORS headers, even though the existing
companion can safely bridge completion requests.

Real-provider testing with LM Studio and Qwen3.5-9B exposed two further
adapter-level problems. The model could spend an entire output budget in
reasoning and return empty content, or return a provider-shaped `{ok, message}`
envelope when Kirjolab requested replacement prose. Inserting that envelope as
Markdown would violate the review contract even though the request succeeded.

SlideOtter already demonstrates useful local-model patterns: discover live
models from `/models`, keep model choice outside authored content, verify
structured output, and make provider progress or failure visible. Kirjolab can
adopt the small parts that fit its browser-local, review-before-apply boundary
without importing SlideOtter's server-owned provider stack.

## Decision

Writing assistant will discover live model identifiers from a standard
OpenAI-compatible `/models` route derived from the configured
`/chat/completions` endpoint. Discovery is an explicit user action, remains
credential-free and loopback-only, rejects redirects, times out after ten
seconds, reads at most 256 KiB, and accepts at most 256 unique bounded model
identifiers. It does not persist model state into a project.

The optional companion will proxy bounded `GET /v1/models` requests to the
derived route on its already fixed upstream origin. It will preserve the exact
origin, loopback binding, response limit, timeout, and CORS boundary used for
completion requests; the browser cannot choose or modify the upstream.

Reasoning effort becomes an explicit transient setting with `none`, `low`,
`medium`, `high`, and provider-default choices. Focused passage revision and
claim drafting default to `none` so reasoning-capable local models do not spend
the response budget before producing the small reviewed artifact.

Both writing operations will send task-specific JSON Schema response formats.
Revision output contains only `replacement`; claim output contains only `text`
and `note`. Plain replacement text remains a compatibility fallback for
providers that ignore the schema hint, but malformed JSON and provider-created
JSON envelopes are rejected rather than inserted into the manuscript.

## Trigger

A loaded Qwen3.5-9B model is available for hands-on Writing assistant
iteration, and SlideOtter provides an existing local-model implementation to
adapt instead of designing an unrelated provider workflow.

## Consequences

**Positive:**

- Researchers can select an identifier the provider can serve now.
- Qwen3.5-9B produces bounded revision and claim artifacts responsively when
  reasoning is off.
- Provider wrappers and malformed structured data cannot become manuscript
  prose.
- Direct and companion connections share one discovery and generation model.

**Negative:**

- Providers without the standard `/models` or JSON Schema conventions may need
  manual model entry and rely on the plain-text revision fallback.
- Reasoning defaults favor latency for focused transformations; researchers
  must opt into deeper reasoning when it improves a task.
- Model discovery adds one more route to the companion security boundary.

**Neutral:**

- Provider, endpoint, model, and reasoning settings remain transient browser
  configuration rather than project state.
- Candidate review, provenance, and explicit apply/reject behavior do not
  change.

## Alternatives Considered

### Hardcode Qwen3.5-9B in the starter

Rejected because loaded identifiers vary across providers and machines, and a
template should not encode one developer's local catalog.

### Copy SlideOtter's server-owned provider subsystem

Rejected because Kirjolab intentionally keeps local inference in the browser or
explicit companion. Porting provider persistence, cloud adapters, and runtime
state would broaden the architecture without improving the focused operation.

### Accept any successful content string

Rejected because successful HTTP and valid OpenAI-compatible JSON do not prove
that the content satisfies Kirjolab's revision or claim contract.

### Always use provider-default reasoning

Rejected because the tested reasoning model exhausted its output budget without
returning content, while `reasoning_effort: none` produced valid structured
output in under two seconds for both current operations.

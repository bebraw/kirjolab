# ADR-039: Require Reviewable, Provenance-Aware Model Operations

**Status:** Accepted

**Date:** 2026-07-10

## Context

Kirjolab should integrate local language models for explanation, comparison,
claim extraction, evidence discovery, and writing assistance. Local models vary
widely in capability and often work best with small tasks and constrained
context. A hosted browser may also be unable to reach a model bound to the
researcher's machine without a local companion.

Allowing a model to mutate canonical documents or scholarly relationships
directly would make errors difficult to detect and obscure which sources and
instructions produced a change.

## Decision

Kirjolab will expose capability-oriented model operations through a
provider-neutral gateway that supports local providers. When browser networking
cannot reach a local provider safely, a local companion service will bridge the
request under explicit user control.

Every model operation will receive an explicit set of scholarly resources and a
typed task contract. It will return a candidate such as a Markdown patch,
metadata proposal, extracted claim set, or proposed links.

Candidates will record the provider and model identity, operation, selected
source resources, relevant parameters, and output. Applying a candidate will be
a separate explicit user action that validates the proposed change against the
current resource versions.

Models will not directly mutate canonical documents, annotations, claims, or
links without this candidate-and-apply boundary.

## Trigger

The architectural vision adopts SlideOtter's inspectable candidate-review-apply
loop and makes local models a first-class target for scholarly assistance.

## Consequences

**Positive:**

- Researchers can inspect and reject model output before it enters the
  scholarly record.
- Provenance connects accepted suggestions to their grounding material and
  model execution.
- Small typed operations are compatible with weak local models and testable
  without a specific provider.
- Provider integration remains separate from document and resource mutation.

**Negative:**

- Candidate persistence and review add workflow steps and data modeling.
- Model output must be validated and reconciled when source resources change.
- A local companion expands the trusted local runtime and requires clear
  permission and origin controls.

**Neutral:**

- OpenAI-compatible HTTP APIs may be used by providers but are not the domain
  interface.
- Fully automated workflows may later compose approved operations, but they must
  retain equivalent provenance and mutation boundaries.

## Alternatives Considered

### Give models direct write access

This would reduce interaction steps but makes hallucinated edits, stale writes,
and untraceable changes more likely in a high-integrity scholarly workflow.

### Support only one local model provider

This would simplify the first connector but would leak provider-specific
concepts into product workflows and limit future hosted or local choices.

### Send the entire workspace with every request

This avoids context selection UI but performs poorly with local models, weakens
provenance, increases privacy exposure, and makes results harder to reproduce.

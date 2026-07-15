# ADR-119: Model Writing as Typed Contextual Operations

**Status:** Implemented

**Date:** 2026-07-15

## Context

Revision and claim drafting were presented as two special cases. Expanding the
writing assistant to clarity drilling, ideation, reference discovery, and
structured syntax could turn the interface into an ambiguous chat surface or
duplicate target-selection rules in every operation. These actions have
different evidence requirements and outputs, but most depend on the same
remembered manuscript caret or selection.

## Decision

- Define writing-assistant capabilities in one typed operation registry. Each
  operation owns its label, guidance, action, allowed target scopes, evidence
  requirement, and availability.
- Resolve contextual targets through one deterministic function. A non-empty
  researcher selection always wins; otherwise an operation may expand the
  remembered caret to its sentence, paragraph, or Markdown section, or retain
  it as an insertion point.
- Preview the resolved target before model I/O. Continue to store mutation
  outputs as explicit reviewable candidates rather than applying them from the
  assistant response.
- Keep operation-specific structured controls and output contracts. Do not
  flatten the capabilities into a generic conversation protocol.

## Consequences

- New capabilities can share target and presentation rules without sharing an
  unsafe catch-all prompt or response type.
- Caret-based revision is predictable, while an explicit selection preserves
  exact researcher intent regardless of the chosen scope.
- Sentence boundaries use intentionally lightweight punctuation rules and
  section boundaries use Markdown headings; unusual prose may require an
  explicit selection.
- Capability definitions can be exposed incrementally while unavailable
  operations remain disabled.

## Alternatives Considered

A generic chat panel makes target, provenance, and mutation intent implicit.
Separate bespoke forms repeat scope logic and drift in terminology. Sending a
whole file for every operation broadens disclosure and weakens the exact
review/apply boundary.

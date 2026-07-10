# ADR-002: Make Architectural Decisions Explicit

**Status:** Accepted

**Amended by:** [ADR-021](./ADR-021-add-accepted-adr-state.md)

**Date:** 2026-03-28

## Context

`vibe-template` is intended to be cloned repeatedly for small experiments and lightweight projects. In that kind of repo, architectural choices are easy to leave implicit because the codebase is small, the original author remembers the reasoning, and changes happen quickly.

That convenience does not last. Once a project adds a deployment model, persistence strategy, auth boundary, testing baseline, hosting constraint, or toolchain rule, future contributors need to know whether that choice is deliberate, provisional, or accidental. If those decisions stay implicit, later work has to reverse-engineer intent from code, commit history, or conversation context.

The repo already has an ADR baseline in `docs/adrs/`, but the current guidance only says to record "significant" decisions. That wording leaves too much room for omission. The template needs a clearer default: lasting architectural decisions should be explicit unless they are clearly tactical or reversible.

## Decision

We will treat architectural decisions as explicit documentation work.

Whenever a change introduces or changes a lasting architectural constraint, selects between credible architectural alternatives, or supersedes an earlier architectural decision, that change must add or update an ADR in `docs/adrs/`.

Draft ADRs belong in `docs/adrs/proposed/`. Accepted and implemented ADRs belong in `docs/adrs/implemented/`, including decisions that are later superseded.

Small, reversible, or purely tactical choices do not require an ADR.

## Trigger

The template already relied on ADRs as local architectural memory, but it did not clearly require new architectural decisions to be recorded as part of the same change. This ADR makes that expectation explicit so architectural intent does not remain implicit in code or chat history.

## Consequences

**Positive:**

- Architectural intent becomes durable, searchable, and available to both humans and agents.
- Architectural changes are reviewed with their trade-offs instead of being smuggled in as incidental implementation details.
- The repo gains a clearer distinction between global rules in `ARCHITECTURE.md`, feature behavior in `specs/`, and cross-cutting architectural choices in ADRs.

**Negative:**

- Some changes will require extra documentation work before they are considered ready.
- Contributors need to exercise judgment about whether a decision is architectural or merely tactical.

**Neutral:**

- ADRs become part of the normal delivery workflow for architecture-affecting changes.

## Alternatives Considered

### Keep ADRs optional and rely on contributor judgment

This was rejected because the existing "record significant decisions" guidance is too easy to interpret loosely. Important decisions can still remain implicit even when contributors are acting in good faith.

### Record all decisions in `ARCHITECTURE.md` only

This was rejected because `ARCHITECTURE.md` is for current global rules, not decision history. It does not preserve alternatives, trade-offs, or the lifecycle of superseded architectural choices.

# ADR-218: Adopt Repository-Local Wayfinding

**Status:** Implemented

**Date:** 2026-08-03

## Context

Some Kirjolab initiatives remain too uncertain for a responsible feature spec
or implementation plan while also exceeding one agent session. The upstream
`mattpocock/skills` Wayfinder workflow preserves a destination, open questions,
dependencies, and decision fog across sessions.

Its default workflow uses an issue tracker as the canonical map and assumes
labels, assignments, child issues, and companion skills. Kirjolab keeps its
durable engineering context in the repository and does not need external
tracker state for occasional discovery work. It also already treats
`ARCHITECTURE.md`, ADRs, and feature specs as the authority for lasting
decisions.

## Decision

Adopt a project-local `wayfinder` skill derived from `mattpocock/skills`
revision `2ab958093e83e0ec752e6c1c5932da465bf23e0c`, retaining the upstream
MIT license and provenance under `.codex/skills/wayfinder/`.

Wayfinder is explicit-only. Use it only when the user asks to map a large,
uncertain, multi-session initiative that is not yet clear enough to specify or
plan responsibly. Store one reviewable `docs/wayfinding/<effort>.md` map per
effort by default, without issue-tracker state, labels, assignments,
coordination branches, setup files, or a companion workflow suite.

Treat each map as temporary working context. When a resolution changes a global
constraint, lasting architecture decision, or feature contract, update the
appropriate architecture document, ADR, or feature spec and leave only a
concise pointer in the map. Keep throwaway research and prototypes outside the
repository unless the user approves a lasting artifact.

## Trigger

The user asked Kirjolab to review newer reusable `vibe-template` improvements
and approved explicit repository-local wayfinding as part of the low-risk
workflow batch.

## Consequences

**Positive:**

- Large multi-session discovery efforts gain one reviewable handoff artifact.
- Kirjolab retains useful destination, frontier, blocking, and fog concepts
  without adopting tracker infrastructure.
- Lasting outcomes continue to graduate into the repository's existing durable
  architecture and feature records.
- The workflow adds no package dependency or runtime behavior.

**Negative:**

- Concurrent sessions editing the same map can create ordinary Git conflicts.
- A single Markdown map is less interactive than tracker relationships.
- Agents must actively promote lasting decisions rather than treating the map
  as sufficient documentation.

**Neutral:**

- Wayfinding does not implement its destination or replace normal
  specification and planning.
- Projects that never invoke the skill create no wayfinding files.

## Alternatives Considered

### Use the upstream tracker workflow unchanged

Rejected because it introduces external state, setup, and companion-skill
dependencies that are unnecessary for Kirjolab's repository-local context.

### Use feature specs as discovery maps

Rejected because unresolved questions and temporary fog do not belong in the
living contract for accepted feature behavior.

### Keep discovery only in conversation history

Rejected because multi-session initiatives would lose reviewable context and a
stable handoff point.

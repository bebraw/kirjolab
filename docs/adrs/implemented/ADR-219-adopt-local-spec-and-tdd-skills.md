# ADR-219: Adopt Local Specification and TDD Skills

**Status:** Implemented

**Date:** 2026-08-03

## Context

Kirjolab requires living feature specs, explicit ADRs for lasting architecture
decisions, and high automated coverage for source behavior. It has workflows
for brainstorming, review, and test adequacy, but no focused path for converting
settled discussion into the repository's Blueprint/Contract format or for
driving observable implementation through verified failing tests.

The upstream `mattpocock/skills` collection provides `to-spec` and `tdd`. Its
specification workflow assumes issue-tracker publication and a parallel PRD
shape. Its TDD guidance contains useful red-green, public-seam,
vertical-slice, and independent-expected-value discipline, but must retain
Kirjolab's existing test seams, authorization boundaries, and readiness gate.

## Decision

Vendor adapted `to-spec` and `tdd` skills from `mattpocock/skills` revision
`2ab958093e83e0ec752e6c1c5932da465bf23e0c` under the canonical
`.codex/skills/` root, retaining the upstream MIT licenses and provenance.

Make `to-spec` explicit-only. It synthesizes only settled context into the
existing `specs/<feature-domain>/spec.md` Blueprint/Contract format, updates an
owning domain spec instead of creating a parallel PRD, creates no issue-tracker
state, and routes architectural rationale to ADRs and global constraints to
`ARCHITECTURE.md`. It must stop rather than invent a material unresolved
decision.

Allow `tdd` to be selected for observable runtime behavior and regression fixes
when a stable public test seam exists. Work in focused red-green slices, confirm
that each test fails for the intended missing behavior before changing
production code, and use expected values independent of the implementation.
Ask the user only when adding or moving a seam would create a lasting
architecture choice.

Skip TDD when no meaningful red test exists, including documentation-only,
prototype, generated, and purely mechanical changes, and state the alternative
deterministic verification instead. TDD complements rather than replaces
focused debugging, test review, or the repository quality gate.

## Trigger

The user asked Kirjolab to review newer reusable `vibe-template` improvements
and approved the repository-local specification and TDD workflows.

## Consequences

**Positive:**

- Settled discussion and wayfinding results gain a direct path into Kirjolab's
  durable feature contracts.
- Runtime changes gain a concise test-first feedback loop through stable public
  seams.
- Both workflows reuse existing ADR, spec, test, and quality-gate conventions
  without external services or runtime dependencies.
- Explicit exceptions keep non-behavioral work proportionate.

**Negative:**

- The adapted skills can drift from upstream and require deliberate review.
- TDD adds a targeted failing-test execution before production edits when it
  applies.
- Agents still need judgment to distinguish a stable seam from an architecture
  decision requiring user input.

**Neutral:**

- `to-spec` does not replace brainstorming or Wayfinder and begins only after
  material decisions settle.
- TDD does not prove that every important scenario was selected; test review
  remains available for a separate adequacy pass.

## Alternatives Considered

### Install the upstream skills unchanged

Rejected because that would introduce tracker assumptions, companion setup, a
parallel PRD structure, and broader seam-confirmation ceremony.

### Extend Wayfinder and test review instead

Rejected because the workflows own different phases: Wayfinder preserves
unresolved discovery, `to-spec` captures accepted state, test review evaluates
coverage, and TDD drives implementation feedback.

### Encode both workflows only in AGENTS.md

Rejected because detailed process guidance would load into every session and
be harder to invoke, review, adapt, or remove independently.

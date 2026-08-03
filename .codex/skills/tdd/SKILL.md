---
name: tdd
description: Implement or repair observable source behavior through focused red-green slices. Use for new runtime behavior, regression fixes, or explicit test-first requests when a stable test seam exists; skip documentation-only, prototype, generated, and purely mechanical changes.
---

# Test-Driven Development

Build one observable behavior slice at a time: prove the missing behavior with a red test, make it green with the smallest production change, then repeat.

## Context and seam

Read `AGENTS.md`, the relevant feature spec and ADRs, nearby source, and existing tests before writing anything. If the requested behavior changes a contract, update the spec in the same change set.

Test through the highest stable public seam that exposes the behavior. Prefer an existing seam. Ask the user only when adding or moving a seam would create a lasting architecture choice; ordinary tests at an established seam need no extra confirmation.

Skip this workflow when no meaningful red test exists, including documentation-only edits, generated output, throwaway prototypes, and mechanical changes already proven by deterministic tooling. State the alternative verification instead.

## Red-green loop

1. **Red:** Add the smallest behavioral test for one vertical slice.
2. Use an expected result independent of the implementation: a spec scenario, regression example, protocol requirement, or worked literal.
3. Run the narrowest relevant test and confirm it fails for the intended missing behavior. A test that passes, crashes for unrelated setup, or fails for the wrong reason is not red.
4. **Green:** Make the smallest production change that satisfies the test without anticipating later slices.
5. Run the narrow test until it passes, then choose the next behavior slice informed by what the cycle revealed.

Keep every cycle independently understandable and reviewable. Do not write all tests first or all implementation first.

## Test quality

- Assert observable outcomes through public interfaces, not private methods, internal call order, or implementation details.
- Mock true external boundaries such as third-party APIs, time, randomness, or unavailable infrastructure. Prefer real local collaborators and test substitutes already used by the project.
- Keep expected values independent; never recompute the assertion using the same algorithm as production code.
- Give each test one behavioral reason to fail and a name that reads as a specification.
- Avoid broad refactors during green. Perform only cleanup needed to keep the touched slice clear; handle wider simplification separately after behavior is proven.

## Completion

After the final slice:

1. Run the focused tests for the changed behavior.
2. Run the repository's required quality gate.
3. Confirm the relevant spec, regression guardrails, and verification commands match the delivered behavior.
4. Use `test-review` when a separate adequacy pass is requested; TDD does not prove that every meaningful scenario was chosen.

## Provenance

Adapted from Matt Pocock's MIT-licensed [`tdd`](https://github.com/mattpocock/skills) skill at revision `2ab958093e83e0ec752e6c1c5932da465bf23e0c`. This version uses the template's living specs, existing test seams, and quality gate without a companion skill suite.

---
name: tdd
description: Implement observable runtime behavior through focused red-green slices when a stable public test seam exists.
---

# Test-Driven Development

Read `AGENTS.md`, the relevant spec and ADRs, nearby source, and existing tests. Update the feature spec when the requested behavior changes its contract.

Test through the highest stable public seam already exposing the behavior. Ask only when adding or moving that seam would create a lasting architecture choice. Skip TDD for documentation, generated output, throwaway prototypes, and mechanical changes with no meaningful red test; state the alternative verification.

## Loop

1. Add the smallest test for one observable behavior.
2. Use an expected value independent of the production algorithm.
3. Run the narrow test and confirm it fails for the intended missing behavior.
4. Make the smallest production change that turns it green.
5. Repeat for the next vertical slice.

Assert outcomes, not private methods or internal call order. Mock true external boundaries; prefer real local collaborators. Give each test one behavioral reason to fail. Avoid unrelated refactors during green.

After the final slice, run focused tests and the required quality gate. Confirm tests, spec, and verification commands describe the delivered behavior.

Adapted from Matt Pocock's MIT-licensed `tdd` skill, revision `2ab958093e83e0ec752e6c1c5932da465bf23e0c`.

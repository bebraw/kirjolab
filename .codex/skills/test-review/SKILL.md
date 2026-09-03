---
name: test-review
description: Review whether changed behavior has meaningful, maintainable regression coverage without demanding tests for trivial or type-only behavior.
license: MIT
metadata:
  source: https://github.com/cniska/skills
  revision: 7d79c7754f2b9d656f7db7b9ecefcb7532b6d256
---

# Test Review

Compare changed behavior with existing tests. Look for unguarded branches, errors, boundaries, configuration variants, and public contracts; also identify brittle, duplicative, obsolete, timing-dependent, or implementation-coupled tests.

Flag a missing test only when you can name the concrete bug or regression it would catch. Prefer public behavior, independent expected values, and mocks only at true external boundaries. Do not demand 100% coverage or tests for behavior the type system already guarantees.

Label findings `Must-add`, `Should-add`, `Optional`, or `Remove`. Include source and test locations, the untested behavior, the concrete regression, and a fix direction. Cap required additions to the highest-value cases. If nothing clears the evidence threshold, report "No test findings."

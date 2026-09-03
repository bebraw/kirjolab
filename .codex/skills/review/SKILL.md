---
name: review
description: Review proposed changes for concrete bugs, regressions, architecture drift, documentation gaps, and missing verification before landing them.
---

# Review

Inspect the actual diff and enough surrounding code to understand intent. Prioritize:

1. behavioral or security regressions;
2. broken contracts and quality-gate gaps;
3. architecture or maintainability drift;
4. missing documentation for changed behavior;
5. low-priority polish.

Report findings first, ordered by severity. Each finding must name the location, concrete failure or maintenance cost, why it matters, and a fix direction. Do not present preferences or unsupported possibilities as defects.

Check fit with the repository's lightweight template purpose, specs, ADRs, tests, type checks, and required gates. If no findings remain, say so and state residual verification gaps.

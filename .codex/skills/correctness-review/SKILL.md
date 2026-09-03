---
name: correctness-review
description: Check changed logic for concrete bugs, edge cases, async failures, and broken caller contracts rather than style or structure.
license: MIT
metadata:
  source: https://github.com/cniska/skills
  revision: 7d79c7754f2b9d656f7db7b9ecefcb7532b6d256
---

# Correctness Review

Read the diff, claimed behavior, surrounding callers, and relevant tests. Trace valid inputs, boundary values, failure paths, ordering, and asynchronous interleavings through the changed code.

Flag a bug only when you can name a triggering input or sequence and the wrong observable result. Check for incorrect comparisons or operands, missed empty or boundary cases, swallowed failures, missing awaits, unexpected mutation, return-shape changes, nullability changes, and caller assumptions invalidated by the change. Do not re-report behavior an adequate existing test already proves.

For each finding include severity, file, bug, `trigger → wrong result`, and fix direction. Order findings by severity. If no concrete trigger breaks behavior, report "No correctness findings" and any unverified boundary.

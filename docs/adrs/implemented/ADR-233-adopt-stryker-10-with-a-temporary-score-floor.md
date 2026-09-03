# ADR-233: Adopt Stryker 10 with a Temporary Score Floor

**Status:** Implemented

**Date:** 2026-09-03

**Amends:** [ADR-022](./ADR-022-add-mutation-testing-gate.md),
[ADR-098](./ADR-098-ignore-static-mutants-locally.md),
[ADR-134](./ADR-134-keep-mutation-explicit.md),
[ADR-176](./ADR-176-rebase-aggregate-mutation-threshold.md), and
[ADR-225](./ADR-225-use-instrumented-dry-run-for-required-mutation-ci.md)

## Context

The August 2026 `vibe-template` dependency refresh upgrades all Stryker
packages from 9.6.1 to 10.0.0. Kirjolab's Stryker 10 instrumented dry run
completed successfully after boundary-sized LaTeX stress fixtures were kept
outside mutation workers. Small deterministic fixtures retain mutation
coverage through the unchanged public converter while an isolated Vitest mock
tightens only the provenance and list-depth ceilings. This avoids changing the
source or bytes of the immutable published paper-import 0.1.3 artifact.

The first complete Stryker 10 audit then ran for 2 hours 14 minutes and produced
59,680 mutants. It killed 31,102, timed out 211, left 14,218 surviving and 4,052
without coverage, ignored 17, and classified 10,055 as compile errors plus 25
as runtime errors. The resulting aggregate score was 63.15%, below the existing
68% floor. The covered-code score remained higher because Stryker excludes
compile and runtime errors from its valid-mutant denominator and treats
no-coverage mutants as undetected.

The audit included 4,178 static mutants. Stryker estimated that testing those
mutants accounted for 81% of the remaining execution time during the run. They
remain useful in the explicit authoritative audit, but make repeating a full
run solely to confirm a configuration-only threshold change disproportionate.

Stryker's default clear-text reporter also emitted every discovered test and
every surviving or uncovered mutant. At Kirjolab's scale this obscured the
score, threshold margin, status totals, static-mutant cost, and highest-impact
files that guide the next test-hardening work.

## Decision

Keep the exact Stryker 10.0.0 core, TypeScript checker, and Vitest runner pins.
Temporarily lower only the blocking aggregate floor from 68 to 63, which the
measured 63.15% result clears. Keep the low and high reporting bands at 80 and
90, retain the configured mutation surface and TypeScript checker, and include
static mutants in explicit full audits. A further floor reduction requires a
new measured result and an explicit ADR. Future mutation-hardening work should
first restore the floor to at least 68 and then raise it as tests improve.

Make long-run output concise and layered. Full and incremental commands retain
Stryker's progress reporter plus HTML and JSON reports, but omit its exhaustive
clear-text dump. A dependency-free wrapper preserves Stryker's exit status and,
when a fresh JSON report exists, prints the aggregate and covered-code scores,
threshold margin, status and static-mutant counts, and the ten files with the
most survived plus no-coverage mutants. It prints the summary even when Stryker
fails the configured threshold. `npm run mutation:report` summarizes the latest
JSON report on demand. Direct affected runs retain undetected-mutant diffs and
the score table because their mutation surface is deliberately bounded, but
omit the full related-test inventory and cap the displayed relevant tests for a
survivor at three. Pull-request dry runs continue to request progress only and
produce no scored report.

Keep `reports/mutation/index.html` as the interactive drill-down and
`reports/mutation/mutation.json` as the machine-readable result. The summary is
console output, not a new persisted report target.

Keep the boundary-sized provenance and nesting fixtures active in normal unit
and coverage CI but outside Stryker workers. Their mutation-selected counterpart
must call the unchanged public conversion interface with only the relevant
hard ceilings mocked downward, proving each exact accepted boundary and first
rejected value. Do not extract or otherwise change immutable paper-import 0.1.3
production source merely to create a test seam.

## Trigger

The latest `vibe-template` sync exposed the Stryker 10 upgrade. After reviewing
the complete 63.15% result, the user chose to keep Stryker 10 and temporarily
accept the measured lower baseline rather than roll back the major version.
The same run showed that its default terminal output needed a more useful
signal-to-noise ratio.

## Consequences

**Positive:**

- Kirjolab stays on the current template Stryker major and preserves a blocking
  regression floor based on a complete measured run.
- Static and no-coverage mutation debt remains visible instead of being hidden
  through exclusions or score semantics.
- Long runs show stable progress and end with a compact prioritization summary,
  while HTML and JSON retain every mutant detail.
- A threshold failure still produces the diagnostic summary and original
  non-zero exit status.
- Boundary guards remain mutation-selected without invalidating the immutable
  paper-import 0.1.3 converter fingerprint or release artifact.

**Negative:**

- The gate temporarily permits a lower aggregate score than ADR-176's 68%
  baseline.
- A complete authoritative audit remains expensive while static mutants stay
  enabled.
- The reporting wrapper adds a small piece of local tooling that must track the
  mutation-testing report schema.

**Neutral:**

- The 80 and 90 bands continue to communicate the desired direction without
  blocking current work.
- Required pull-request mutation CI remains an instrumented dry run and does
  not evaluate any score.
- The existing ignored HTML and JSON report targets do not change.

## Alternatives Considered

### Roll Back to Stryker 9.6.1

Rejected because the user preferred adopting Stryker 10 and addressing the
measured score change as explicit follow-up debt.

### Keep the 68% Floor Immediately

Rejected because it would leave every complete Stryker 10 audit red before the
separate repository-wide test-hardening work begins.

### Ignore Static or Low-Scoring Mutants in Full Audits

Rejected because that would improve runtime or the displayed score by hiding
part of the authoritative mutation surface. Static mutants remain excluded only
from the already-bounded affected and incremental workflows established by
earlier ADRs.

### Keep Stryker's Exhaustive Clear-Text Output

Rejected because thousands of test and mutant detail lines obscure the live
progress and final decisions. The HTML report is a better drill-down surface.

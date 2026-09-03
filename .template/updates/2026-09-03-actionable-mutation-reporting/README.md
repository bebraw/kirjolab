# Add Actionable Mutation Reporting

Use this update when a Stryker project has grown large enough that the default
clear-text output hides the decisions contributors need. It keeps live progress
and complete HTML/JSON details while replacing exhaustive long-run terminal
dumps with a concise, deterministic summary.

## Apply

1. Add `scripts/report-mutation-results.mjs` and its focused unit test. The
   formatter must use Stryker's score semantics: killed plus timeout mutants are
   detected, survived plus no-coverage mutants are undetected, and compile or
   runtime errors are excluded from the valid-mutant denominator.
2. Add `scripts/run-mutation.mjs` and its focused unit test. The wrapper must
   compare the JSON report before and after Stryker, summarize only a newly
   written report, print that summary even on threshold failure, and preserve
   Stryker's exit status.
3. Route long full and incremental commands through the wrapper. Add
   `mutation:report` as a read-only command for the latest JSON report.
4. Configure long runs with `progress`, `html`, and `json` reporters and set the
   HTML and JSON filenames explicitly under `reports/mutation/`.
5. Retain a separate bounded affected command with `clear-text` when individual
   mutant output is useful. Suppress its full test inventory while retaining
   survivor diffs, the score table, and at most three relevant tests per
   survivor. A dry-run-only CI path may continue to request only progress
   because it finalizes no mutation report.
6. Document the layered output contract in the target project's quality spec.

The summary reports the aggregate score and configured-floor margin, the
covered-code score, all terminal mutant statuses, a reconciled static-mutant
breakdown, and the files with the most survived plus no-coverage mutants. It
does not create another persisted artifact; HTML remains the human drill-down
and JSON remains the machine-readable authority.

## Fallback

If the target project uses another package manager or script layout, keep the
formatter independent of process orchestration and adapt only the wrapper's
Stryker executable path. If long and affected runs need different report
locations, choose explicit non-overlapping HTML and JSON targets rather than
allowing one run to silently replace another.

Do not summarize a stale report after instrumentation or dry-run failure. Do
not convert reporting failures into successful mutation exits. Do not drop the
HTML or JSON reporter merely because the console is concise.

## Verify

- `node --test scripts/report-mutation-results.test.mjs scripts/run-mutation.test.mjs`
- `npm run mutation -- --dryRunOnly`
- `npm run format:check`

After the next scored mutation run, use `npm run mutation:report` and confirm
that the status totals reconcile with the HTML report and that the displayed
threshold margin matches Stryker's exit result.

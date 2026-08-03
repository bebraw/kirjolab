# Add Repository-Local Specification And TDD

Use this update when a downstream project needs an explicit path from settled discussion into its living feature specs and a focused red-green implementation loop for observable behavior.

## Apply

1. Inspect the target project's existing specification format, ADR policy, test conventions, and implementation skills.
2. Add `.codex/skills/to-spec/` and `.codex/skills/tdd/`, retaining their MIT licenses, reviewed source revision, invocation policies, and UI metadata where supported.
3. Register To Spec as an explicit workflow that updates the target project's existing feature-spec location without publishing to an issue tracker.
4. Adapt To Spec's section mapping to the target's durable specification format; do not introduce a parallel PRD format.
5. Register TDD for observable runtime behavior and regression fixes when a stable public seam exists.
6. Preserve explicit exceptions for documentation, prototypes, generated output, and mechanical changes without meaningful red tests.
7. Keep the target project's readiness gate authoritative and run its normal validation.

## Fallback

If the patch does not apply because the target uses different skill, spec, or ADR paths, copy the two skill directories manually and translate only these integration points:

- project-local skill root;
- feature-spec location and structure;
- ADR and architecture-document paths;
- test commands and readiness gate; and
- agent-guidance registration.

If the target already has an equivalent spec-synthesis or TDD skill, merge the repository-local write boundary, red-proof requirement, and explicit exceptions instead of adding a duplicate workflow.

## Verify

- Confirm To Spec is explicitly invoked and creates no tracker state.
- Confirm To Spec updates the target's existing durable feature-spec format.
- Confirm TDD is available for runtime behavior and regression fixes without applying to every change type.
- Confirm a red test must fail for the intended missing behavior before production changes.
- Confirm both upstream revisions and MIT licenses remain recorded.
- Run skill metadata validation and the target repo's normal quality gate.

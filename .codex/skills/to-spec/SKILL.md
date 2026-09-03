---
name: to-spec
description: Turn settled discussion or wayfinding results into the repository's existing feature spec without reopening discovery or inventing decisions.
---

# To Spec

Write accepted behavior to `specs/<feature-domain>/spec.md`. Prefer an existing domain spec; keep architectural rationale in ADRs and global constraints in `ARCHITECTURE.md`.

## Readiness

Read the settled conversation, referenced wayfinding map, `AGENTS.md`, architecture docs, relevant ADRs, existing spec, and enough code to verify current behavior. Stop and name any unresolved decision that would materially change the contract or architecture. Do not ask for facts available in the repository.

## Process

1. Select one independently evolvable feature domain.
2. Present the target path and concise synthesis of problem, behavior, and architecture impact; confirm before writing.
3. Use `specs/feature-template/spec.md` as the baseline while preserving useful domain sections.
4. Record only verified context: purpose, entry points, data and dependency boundaries, prohibited approaches, observable completion criteria, regression guardrails, exact verification, and important Given/When/Then scenarios.
5. Add or update an ADR when settled context changes a lasting architecture decision; link it instead of duplicating rationale.
6. Remove planning history, discarded alternatives, speculation, and empty placeholders.
7. Run the smallest documentation checks. Do not implement the feature unless requested.

Finish only when the domain is unambiguous, every contract statement is supported, success and regression criteria are observable, and lasting decisions point to their durable records.

Adapted from Matt Pocock's MIT-licensed `to-spec` skill, revision `2ab958093e83e0ec752e6c1c5932da465bf23e0c`.

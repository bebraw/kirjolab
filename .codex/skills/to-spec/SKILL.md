---
name: to-spec
description: Turn settled conversation, wayfinding results, or an approved design into a repository-local feature spec. Use when the user explicitly asks to capture the agreed behavior as a spec without reopening discovery or publishing to an issue tracker.
---

# To Spec

Synthesize settled context into the repository's durable feature contract. Preserve decisions; do not invent missing ones or restart the interview.

## Boundaries

- Write to `specs/<feature-domain>/spec.md`; never publish to an issue tracker.
- Prefer updating the existing domain spec over creating another document.
- Keep one spec per independently evolvable feature domain.
- Capture accepted state, not the conversation, discarded options, or planning history.
- Route unresolved product or architecture decisions back to `brainstorming` or `wayfinder` instead of guessing.
- Keep architectural rationale in ADRs and global constraints in `ARCHITECTURE.md`; link them from the spec.

## Readiness

Read the current conversation, any referenced wayfinding map, `AGENTS.md`, `ARCHITECTURE.md`, relevant ADRs, the relevant existing spec, and enough code to verify the current state.

Continue only when the feature's intended behavior and important constraints are settled. If a missing answer would materially change the contract or architecture, name that decision and stop. Do not interview the user about facts available in the repository.

## Process

1. Select the target spec. Reuse an existing feature domain when one owns the behavior; otherwise propose a concise kebab-case domain under `specs/`.
2. State the target path and a short synthesis of the problem, architecture impact, and behavioral contract before writing. When the explicit request, target, and framing are unambiguous, proceed without redundant confirmation; ask only when a material choice remains.
3. Create or update the spec using `specs/feature-template/spec.md` as the structural baseline. Preserve useful domain-specific sections already present.
4. Record only verified, settled context:
   - **Context:** why the feature exists and whose problem it solves.
   - **Architecture:** entry points, data models, dependencies, and relevant source paths.
   - **Anti-Patterns:** tempting approaches that would violate an accepted constraint, with the reason.
   - **Definition of Done:** observable outcomes, including required documentation and tests.
   - **Regression Guardrails:** behavior that must remain true across later changes.
   - **Verification:** exact checks and critical paths that prove the contract.
   - **Scenarios:** concrete Given/When/Then examples for important behavior and edge cases.
5. When settled context introduces or changes a lasting architectural decision, add or update the corresponding ADR in the same change set. Link it rather than duplicating its rationale.
6. Review the result against the conversation and codebase. Remove speculative requirements, implementation narration, duplicated ADR content, and placeholders that are not explicit open items.
7. Write the spec and run the smallest relevant documentation checks. Do not implement the feature unless the user asks for that next step.

## Completion

Finish only when:

- the target feature domain is unambiguous;
- every contract statement is supported by settled context or current code;
- observable success criteria and regression guardrails are present;
- architectural decisions point to their durable ADRs; and
- no issue-tracker or temporary planning state is required to understand the spec.

## Provenance

Adapted from Matt Pocock's MIT-licensed [`to-spec`](https://github.com/mattpocock/skills) skill at revision `2ab958093e83e0ec752e6c1c5932da465bf23e0c`. This version targets the template's repository-local Blueprint/Contract specs and ADR workflow.

# ADR-018: Add Capability Kits

**Status:** Accepted

**Date:** 2026-04-24

## Context

`vibe-template` is useful as a starter repo, but some projects only need one practice from it. Agent CI setup is a good example: it has dependency, script, local env, skill, and documentation pieces that are easy to miss when copied by prompt alone.

The repo needs a way to make those partial upgrades repeatable without turning the template into a heavy generator or assuming every target project shares this repo's structure.

## Decision

We will store reusable partial-upgrade instructions as capability kits under `.capabilities/{capability-name}/`.

Each kit will include:

- a README for purpose, fit, poor fit, and apply steps
- a `manifest.json` for dependencies, scripts, files, docs, and checks
- copyable files under `files/`
- package-manager recipes under `recipes/`
- validation notes in `checks.md`

The initial kits cover Agent CI, the quality gate, pre-push quality hooks, local README screenshots, and local Lighthouse performance checks.

Capability kits are instructional by default. Agents should merge them into target-project conventions rather than apply them as blind scaffolding. If a kit can add an adjacent capability, such as creating a GitHub Actions workflow while installing Agent CI, it must prompt the user before doing so.

## Trigger

The template is increasingly used as a source for individual capabilities, not only as a whole-project bootstrap. Prompt-only transfer works, but it leaves too much implicit context for agents to reconstruct each time.

## Consequences

**Positive:**

- Partial upgrades become easier to apply consistently.
- Agents get a concrete source of truth for capability-specific files, scripts, and checks.
- The template can share practices without requiring target projects to clone all template structure.
- Kits can cover common adjacent setup without silently expanding the target repo's behavior.
- The template now has more surfaces to keep aligned when shared scripts change.

**Negative:**

- Capability kits add another documentation surface that can drift if not maintained with the implementation.

**Neutral:**

- Kits do not replace the starter-template workflow.
- Kits do not enforce a package manager or documentation structure on target repos unless a specific kit says so.

## Alternatives Considered

### Build an automated upgrader

This was rejected for now because target repos differ in package manager, docs structure, workflow names, and existing conventions. A reviewable kit is safer than a script that rewrites unknown repos.

### Keep relying on prompt memory

This was rejected because the repeated Agent CI setup has enough moving parts that omissions are likely.

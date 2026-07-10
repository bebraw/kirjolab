# ADR-019: Tighten Agent Workflow Guardrails

**Status:** Accepted

**Date:** 2026-05-04

## Context

`vibe-template` is meant to be cloned and adapted by agents across many small projects. The existing rules already require ADRs, specs, strict TypeScript, high coverage, and local Agent CI, but some operational expectations were still implicit.

In particular, new tools can quietly introduce generated outputs, local state, caches, archives, or other write targets. Agents can also treat a targeted command as enough validation after a narrow change unless the readiness path is restated near the workflow guidance.

## Decision

We will make three workflow guardrails explicit:

- TypeScript boundary rules should prefer explicit domain types at module, API, fixture, and workflow boundaries.
- Type errors should be resolved with local guards, narrower interfaces, or small helper types instead of broad casts or suppression comments.
- New workflow write targets must be documented in the same change that introduces them.

Targeted checks remain encouraged for iteration, but `npm run quality:gate` and `npm run ci:local` remain the readiness baseline before proposing or landing changes.

## Trigger

The `slideotter` repository now carries stricter agent rules around TypeScript boundaries, workflow validation, and explicit generated-output handling. Those rules are useful for this template when generalized away from slide-specific rendering work.

## Consequences

**Positive:**

- Future agent work has clearer expectations for typed boundaries and validation.
- Generated output and local state paths are less likely to appear without review.
- The template can borrow stricter project hygiene without importing product-specific rules.

**Negative:**

- Small tooling additions need a little more documentation when they introduce new write paths.

**Neutral:**

- This does not add dependencies, scripts, or CI jobs.
- Targeted checks remain available for local iteration.

## Alternatives Considered

### Import the stricter source rules wholesale

This was rejected because many of the source rules are specific to presentation slides, rendered PDFs, deck baselines, and browser studio workflows. Those do not belong in a lightweight starter template.

### Keep the existing guidance unchanged

This was rejected because the write-target and targeted-validation expectations are useful outside the source project and reduce avoidable drift in cloned projects.

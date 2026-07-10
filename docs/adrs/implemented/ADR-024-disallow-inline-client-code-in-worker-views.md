# ADR-024: Disallow Inline Client Code in Worker Views

**Status:** Implemented

**Date:** 2026-05-25

## Context

The Worker starter renders HTML from TypeScript files. That makes small pages easy to ship, but it also makes it easy for agents to hide browser JavaScript inside template strings. Inline client code in rendered HTML is not type checked, is harder to test directly, and can grow inside Worker files without the usual TypeScript guardrails.

The template should keep its Worker-first shape while steering browser behavior into typed source files whenever a project needs client-side interactivity.

## Decision

We will disallow executable browser code inline in Worker-rendered HTML.

The fast quality gate now runs `scripts/assert-no-worker-client-scripts.mjs`, which scans `src/worker.ts` and runtime view files under `src/views/` for:

- inline `<script>` tags
- inline event-handler attributes such as `onclick=`
- `javascript:` URLs

When a project needs client behavior, that behavior should be written in typed TypeScript modules and served through an explicit client build or asset path instead of embedded inside Worker HTML strings.

## Trigger

The template already enforces strict TypeScript for source files, but inline browser code inside Worker-rendered HTML bypasses that baseline. This guard closes that gap before cloned projects inherit the weaker default.

## Consequences

**Positive:**

- Agents cannot silently add untyped browser JavaScript inside Worker/view template strings.
- The fast gate catches this class of regression before browser tests or review.
- Future client-side behavior has to introduce an explicit, typed boundary.

**Negative:**

- Very small one-off browser interactions require a typed client path instead of a quick inline script.
- Projects that intentionally want inline scripts must make and document a new architectural decision.

**Neutral:**

- The starter app behavior does not change because it does not currently use browser JavaScript.

## Alternatives Considered

### Rely on review and documentation only

This was rejected because the problem is easy for agents to reintroduce in generated template strings and hard to spot in larger HTML blocks.

### Add a full client bundler now

This was rejected because the template does not currently need client-side JavaScript, and adding a bundler would make the starter heavier than the problem requires.

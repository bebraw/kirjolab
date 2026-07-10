# ADR-005: Separate Worker Views and API

**Status:** Accepted

**Date:** 2026-03-28

## Context

The starter Worker was intentionally small, but its first version placed routing, API responses, HTML rendering, and utility helpers in a single `src/worker.ts` file.

That shape is acceptable for a throwaway spike, but it is the wrong default for a template that is meant to evolve. Once developers add more routes, responses, or UI states, a single-file Worker becomes harder to extend safely and harder to navigate during review.

The template should steer contributors toward a source layout that already distinguishes between API behavior and rendered views, even while the app surface remains minimal.

## Decision

We will keep the Worker entry point in `src/worker.ts`, but separate implementation concerns under `src/api/` and `src/views/`.

The starter layout now uses:

- `src/api/` for response-producing API modules
- `src/views/` for HTML rendering modules and view helpers
- `src/worker.ts` for request routing and composition

This keeps the baseline small while making future expansion easier and more legible.

## Trigger

The Worker baseline now exists and is runnable, which makes its source layout a real architectural choice rather than a temporary placeholder. The template should encode the more evolvable structure now instead of waiting for the file to become crowded.

## Consequences

**Positive:**

- Developers get a clearer starting point for evolving the app.
- View rendering and API behavior can grow independently.
- Tests can target smaller modules directly instead of only the top-level Worker file.

**Negative:**

- The starter app uses more files than the smallest possible stub.
- Contributors need to understand one extra layer of routing composition.

**Neutral:**

- The external behavior of the stub Worker remains unchanged.

## Alternatives Considered

### Keep all starter logic in `src/worker.ts`

This was rejected because it optimizes for the first few lines of code at the expense of the template's long-term evolvability.

### Introduce a heavier framework-style folder structure

This was rejected because the template should stay lightweight and avoid prescribing a larger application architecture than necessary.

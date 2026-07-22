# ADR-163: Separate Review Export Formatters Behind One Facade

**Status:** Implemented

**Date:** 2026-07-22

**Supports:** [ADR-147](./ADR-147-derive-review-outputs-from-evidence.md)

## Context

Review exports share one revision-pinned authority but have distinct jobs:
stable JSON and history, extraction CSV and bibliography, PRISMA data and SVG,
and deterministic ZIP assembly. Keeping all of those jobs in one module made a
change to any formatter appear coupled to every export consumer and mixed
format-specific helpers with package orchestration.

Consumers still benefit from one stable import boundary. Requiring API,
backup, and Durable Object code to know the internal formatter layout would
spread the refactor and make future moves part of the application contract.

## Decision

Keep `src/domain/review-export.ts` as the stable public facade and separate its
implementation by responsibility:

- `review-export-types.ts` owns the revision-pinned authority and public flow
  types;
- `review-export-json.ts` owns deterministic JSON and audit-history output;
- `review-export-tabular.ts` owns extraction CSV and review bibliography;
- `review-export-prisma.ts` owns PRISMA derivation and accessible SVG;
- `review-export-package.ts` composes those outputs into the deterministic ZIP.

Format modules may depend on the authority types, while package assembly may
depend on every formatter. Formatters must not depend on package assembly or
the API layer. Existing consumers continue importing the facade unless they
are implementing another review-export formatter internally.

## Consequences

**Positive:**

- Each output format has a focused implementation and mutation surface.
- ZIP concerns and `fflate` no longer share a source unit with CSV, BibTeX,
  JSON, or SVG rules.
- External consumers retain one stable import path.
- A formatter can evolve without increasing the apparent size and complexity
  of every other format.

**Negative:**

- The review-export domain contains several small modules instead of one file.
- The facade and package assembler add an intentional internal dependency
  layer.

**Neutral:**

- Export bytes, filenames, schemas, ordering, timestamps, and digests remain
  unchanged.
- The authority snapshot remains the sole input to every format.

## Alternatives Considered

### Keep one export module

This minimizes file count but preserves the mixed responsibilities and broad
change surface identified by maintainability analysis.

### Make consumers import format modules directly

This removes the facade but leaks the internal layout into API, backup, and
Durable Object code, increasing coupling during future formatter changes.

### Give each formatter its own authority projection

This could narrow types further, but risks format-specific snapshots drifting
from the revision-pinned export authority and weakening deterministic package
assembly.

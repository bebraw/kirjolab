# ADR-034: Adopt TypeScript 7 Type Checking

**Status:** Implemented

**Date:** 2026-07-08

## Context

TypeScript 7.0 is a native port of the compiler and language service. It is
published through the `typescript` package and provides a much faster `tsc`.

TypeScript 7.0 does not yet ship the stable compiler API used by several
tooling integrations. This template uses Stryker's TypeScript checker, so a
direct replacement of the `typescript` package would risk breaking mutation
testing even if project type checking succeeds.

## Decision

Use TypeScript 7.0.2 for the template's project type-checking command while
keeping the TypeScript 6 compatibility package available under the canonical
`typescript` dependency name for tools that import the compiler API.

The dependency layout is:

- `typescript`: `npm:@typescript/typescript6@6.0.2`
- `typescript-7`: `npm:typescript@7.0.2`

`npm run typecheck` invokes `node ./node_modules/typescript-7/bin/tsc --noEmit`
so the project check runs TypeScript 7 even when npm links `node_modules/.bin/tsc`
to the compatibility package.

## Trigger

The user asked to update after TypeScript 7 became available.

## Consequences

**Positive:**

- Project type checking uses the faster TypeScript 7 compiler.
- Existing tooling that imports `typescript` can keep using the TypeScript 6
  API during the 7.0 transition.
- The dependency layout matches the migration direction documented by the
  TypeScript team.

**Negative:**

- The template temporarily carries two TypeScript packages.
- The typecheck script must call the TypeScript 7 package path directly because
  npm may link `tsc` to the compatibility package.

**Neutral:**

- Remove the compatibility package and direct script path once the surrounding
  tooling supports the TypeScript 7 API directly.

## Alternatives Considered

### Replace `typescript` With TypeScript 7 Directly

This was rejected for the first migration because TypeScript 7.0 does not ship
the stable compiler API expected by compiler-API tooling.

### Stay On TypeScript 6

This was rejected because the project can adopt TypeScript 7 for `tsc` without
dropping the TypeScript 6 API compatibility needed by other tools.

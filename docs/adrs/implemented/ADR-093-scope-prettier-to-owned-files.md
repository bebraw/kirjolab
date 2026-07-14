# ADR-093: Scope Prettier to Owned Files

**Status:** Implemented

**Date:** 2026-07-14

## Context

Kirjolab carries skill content for multiple agent surfaces. The complete
`.github/skills/` tree duplicates externally maintained material, while
`.codex/skills/**/references/` contains vendored reference documents. Running
Prettier over those trees spends time and can create local formatting drift from
their actual upstream owners.

Project-owned skill entrypoints and all Kirjolab source, configuration, specs,
ADRs, and documentation still benefit from one consistent formatting gate.

## Decision

Exclude `.github/skills/` and `.codex/skills/**/references/` through
`.prettierignore`. Keep project-owned `.codex/skills/*/SKILL.md` entrypoints and
the rest of the repository inside the formatting baseline.

## Consequences

**Positive:**

- Full formatting checks avoid large duplicated and vendored reference trees.
- Upstream-owned material is not rewritten into Kirjolab-specific style.
- Project-authored skill instructions remain formatted and reviewable.

**Negative:**

- Formatting defects inside excluded reference material are not detected here.
- New vendored locations must be classified explicitly rather than assumed.

**Neutral:**

- Type checking, tests, and security checks are unchanged.
- `.prettierignore` remains the visible ownership boundary.

## Alternatives Considered

### Ignore every skill directory

This is broader but would also remove project-owned skill entrypoints from the
formatting contract.

### Continue formatting vendored references

This keeps one universal command but wastes work and can diverge from upstream
formatting without improving Kirjolab's authored surfaces.

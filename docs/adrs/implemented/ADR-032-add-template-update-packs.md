# ADR-032: Add Template Update Packs

**Status:** Implemented

**Date:** 2026-06-14

## Context

Projects that start from `vibe-template` usually diverge. They keep some of the
template's workflow ideas, but rename scripts, prune files, add product code,
and reshape docs. A direct upstream merge from this template is useful only
while a project remains very close to the starter.

Capability kits already cover first-time adoption of larger reusable practices.
They do not solve the smaller recurring problem of syncing later template
maintenance changes, such as a CI workflow simplification or quality-gate
policy update, into projects that already adopted the relevant capability.

## Decision

The template will keep reviewable update packs under `.template/updates/`.

Each update pack must include:

- `update.json` for metadata
- `README.md` for the migration intent and manual fallback
- `patch.diff` for a focused first-attempt patch

Update packs are plain files. Contributors and agents should apply them as
small migrations, run the listed checks, and record applied update IDs in the
target project.

Capability kits remain the path for adopting a capability for the first time.
Update packs are the path for syncing later maintenance changes.

## Trigger

The user asked for a simple way to sync template changes to projects that use
`vibe-template`, then asked to implement the approach and backfill patches for
past changes.

## Consequences

**Positive:**

- Downstream projects can pull selected template maintenance changes without
  merging unrelated starter files.
- Agents have a concrete, reviewable artifact to inspect before editing a
  target project.
- Historical reusable changes have migration records instead of living only in
  commit history and ADRs.

**Negative:**

- Reusable template maintenance now has one more artifact to keep current.
- Patch files may not apply cleanly after downstream projects diverge, so each
  pack still needs manual fallback instructions.

**Neutral:**

- No CLI is introduced.
- Capability kits remain separate from update packs.
- Routine dependency automation can still handle dependency-only refreshes in
  downstream projects.

## Alternatives Considered

### Use Git upstream merges

This was rejected because downstream projects are expected to diverge from the
starter, and merges would frequently include unrelated template files.

### Build a sync CLI first

This was rejected because a CLI would add maintenance surface before the update
format has proven useful. Plain files are enough for agents and contributors.

### Use capability kits for every update

This was rejected because kits describe capability adoption. Later maintenance
sync needs smaller migration records that can supersede or amend earlier kits.

# ADR-123: Centralize Browser-Local Preferences

**Status:** Implemented

**Date:** 2026-07-15

## Context

Personal controls had accumulated in task-specific surfaces. Appearance lived
in the global header, Vim editing in the editor action menu, and local model
connection fields inside Writing assistant. Vim and appearance already
persisted locally, while model configuration reset on refresh. This made stable
preferences both scattered and inconsistently durable.

## Decision

Add one compact Preferences panel beside the Kirjolab heading. It owns settings
that apply across projects and are expected to change infrequently:

- appearance;
- Vim source editing;
- local model connection type, endpoint, model id, and reasoning effort.

The panel is a keyboard-operable disclosure that closes on Escape or an outside
click. Writing assistant retains a connection-settings shortcut that opens the
shared panel; it does not duplicate the fields.

Persist model preferences in browser local storage, matching the existing
appearance and Vim behavior. Keep project layout, publication profile, sharing,
and export controls outside the panel because their scope or frequency differs.
No preference becomes collaborative project state.

## Consequences

**Positive:**

- Stable personal choices have one predictable home.
- The main header and Writing assistant lose redundant controls.
- Model configuration survives refreshes and project changes.
- The boundary between browser preference and project state is explicit.

**Negative:**

- Local preferences do not follow a person to another browser or device.
- Moving model controls adds one navigation step when configuring a new model.
- The header disclosure must remain usable in compact layouts.

## Alternatives Considered

### Extend project settings

This would incorrectly make personal editor and local-machine model choices look
project-scoped and potentially collaborative.

### Keep settings near each feature

This minimizes movement but preserves the scattered discovery problem and makes
cross-project persistence unclear.

### Add a dedicated settings page

A full route is unnecessary for this small preference set and would interrupt
the writing context for quick changes.

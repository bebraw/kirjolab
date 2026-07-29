# ADR-168: Configure Native Editor Indentation

**Status:** Implemented

**Date:** 2026-07-29

## Context

The native source textarea lets Tab follow browser focus navigation, so writers
cannot indent without entering whitespace another way. A hard-coded Tab handler
would solve focus loss but would impose one whitespace convention. Replacing the
textarea with a code-editor dependency would disturb the established Yjs,
selection, highlighting, accessibility, and Vim boundaries.

Tab also already accepts visible source-completion suggestions, while Vim modes
give the same key mode-specific meaning. Indentation must coexist with both.

## Decision

Add a browser-local indentation controller over the existing collaborative
textarea. Default to spaces with a tab size of two, and let users choose spaces
or literal tab characters plus a bounded tab size from one through eight in
Settings.

Handle Tab as insertion or selected-line indentation and Shift+Tab as line
outdent. Apply edits to the native textarea and emit its ordinary input event so
the existing Yjs binding remains authoritative. Bind source completion first so
its visible choice retains Tab acceptance. Apply indentation only in standard
editing and Vim Insert mode; Vim Normal and Visual modes retain keyboard
authority.

## Consequences

**Positive:**

- Tab can indent without moving focus out of the manuscript.
- Writers can choose project-agnostic whitespace behavior familiar from code
  editors without adding an editor framework.
- Indentation edits continue through the existing collaboration and undo path.

**Negative:**

- The browser adapter must maintain selection offsets for multi-line edits.
- Browser-local preferences do not travel with a user to another device.
- The bounded tab-size range is intentionally smaller than unrestricted editor
  configuration.

## Alternatives Considered

### Always insert two spaces

This is the simplest behavior but prevents writers from using literal tabs or a
different indentation width.

### Keep native Tab focus navigation

This preserves default browser behavior but leaves keyboard indentation
unavailable in the primary writing surface.

### Replace the textarea with a code editor

A full editor provides indentation settings but adds a dependency and replaces
the established native input, Yjs, highlighting, accessibility, and Vim
integration boundaries for a bounded interaction.

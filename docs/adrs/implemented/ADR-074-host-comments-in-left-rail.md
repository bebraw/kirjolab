# ADR-074: Host Comments in the Left Rail

**Status:** Implemented

**Date:** 2026-07-13

## Context

Collaborative manuscript comments began in a collapsible drawer below the
Markdown editor. Even when collapsed, the drawer competes with the manuscript
and derived bibliography for vertical space. Opening it makes the primary
authoring surface shorter at the exact moment a collaborator needs to retain
the selected passage and its surrounding prose.

The left project rail already switches between Files and Research without
changing collaborative state. Comments is another project-level navigation
mode: it needs the manuscript selection, but its composer and history do not
belong inside canonical source or the research evidence inventory.

## Decision

Kirjolab will host Comments as the third left-rail mode after Files and
Research. Its tab exposes the open-comment count. Its panel contains the
selected-passage composer and open/resolved comment history.

Switching rail modes is local browser navigation and does not mutate Markdown,
Yjs state, comment resources, or collaboration messages. Creating, navigating,
and resolving comments retains the existing anchor, attribution,
authorization, history, and API contracts.

The editor-bottom comment drawer is removed. The manuscript editor expands to
use the released vertical space on desktop.

## Trigger

The UI refinement identified the left sidebar as the more stable home for
Comments.

## Consequences

**Positive:**

- Comment work remains visible beside the selected manuscript passage without
  shortening the editor.
- Files, research material, and collaboration discussion have distinct,
  labelled rail modes.
- The open-comment count remains visible from the rail tab.
- No modal or second bottom-navigation pattern is introduced.

**Negative:**

- A third rail mode makes each tab narrower.
- Long comment bodies and histories have less horizontal space than the former
  editor-width drawer.

**Neutral:**

- Comments remain durable attributed resources stored outside Markdown.
- Narrow layouts keep their existing Authoring/Context surface switch; the left
  rail remains part of the authoring workspace.

## Alternatives Considered

### Keep the editor-bottom drawer

This preserves a wider composer but continues to reduce manuscript height and
mixes discussion navigation into the editor's document stack.

### Put Comments in the Research inventory

Comments are attached to manuscript passages and collaboration history, not
source evidence. Nesting them among papers and claims would blur that boundary
and make their count less visible.

### Use a modal

A modal would cover the manuscript context needed to write and review a
passage-anchored comment.

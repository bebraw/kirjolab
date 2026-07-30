# ADR-201: Prioritize Frequent PDF Tools

**Status:** Implemented

**Date:** 2026-07-30

## Context

ADR-124 moved private-PDF controls into one space-efficient rail, but the rail
still presented page navigation, reading controls, annotation modes,
inspectors, references, and downloads at the same visual level. Short landscape
viewports needed two columns merely to keep that undifferentiated list visible.
The result preserved page width but made common reading and annotation actions
harder to scan.

Established PDF applications use progressive disclosure for this problem.
Frequently used modes stay directly available, while view configuration,
specialized tools, and file actions appear contextually or in secondary menus.

## Decision

Order private-PDF controls by expected interaction frequency:

- Keep previous/next page, the page indicator, PDF search, Select, Note, Draw,
  and the annotation overview persistently visible.
- Keep drawing color, width, and undo contextual to the active Draw mode.
- Group contents, continuous scrolling, zoom, fit, rotation, and spread in a
  labelled View menu.
- Group references, original download, and annotated export in a separate
  labelled PDF-action menu.

Persistent controls retain 44-pixel targets, accessible names, tooltips, focus
treatment, and pressed state. Secondary menu actions use visible text as well
as icons. The existing viewer, annotation-toolbar, and context-presenter owners
keep their current events and side-effect boundaries.

## Consequences

**Positive:**

- The compact rail exposes fewer competing symbols and fits with substantial
  unused vertical room even in short landscape viewports.
- Common navigation and annotation modes remain one action away.
- Unfamiliar and consequential document actions gain visible labels.
- Display settings form a recognizable group instead of interrupting the main
  reading flow.

**Negative:**

- Contents, zoom, rotation, spread, references, and exports require one extra
  action.
- Two menu triggers introduce a small distinction users must learn: View
  configuration versus PDF/document actions.

## Alternatives Considered

### Keep every icon visible and add more dividers

Dividers would clarify categories but would not reduce rail length or the
number of equally weighted symbols.

### Put every secondary action in one overflow menu

One menu minimizes persistent controls, but it mixes reading configuration with
references and file operations. Two task-oriented menus give the secondary
level useful structure without adding a permanent panel.

### Make the toolbar user-customizable

Acrobat supports this for broad professional workflows, but persistence and
configuration UI would add disproportionate complexity to Kirjolab's bounded
private-PDF reader.

---
name: minimal-visual-style
description: Preserve and extend the current minimal visual style in this repo. Use when editing the starter Worker UI, README screenshot, or related frontend surfaces and the goal is to keep the interface minimal, editorial, and token-driven instead of turning the template into a product-marketing shell.
---

# Minimal Visual Style

Use this skill when frontend work should feel like a continuation of the current starter, not a disconnected redesign.

## Source Of Truth

Inspect these files before making visual changes:

- `src/tailwind-input.css`
- `src/views/home.ts`
- `specs/stub-worker/spec.md`
- `specs/readme-docs/spec.md`

If a screenshot disagrees with the code, the code wins. Treat `docs/screenshots/home.png` as documentation, not the style authority.

## Visual Direction

- Keep the page minimal and single-purpose.
- Favor an editorial feel over a product-marketing feel.
- Use one clear accent color and let typography carry most of the visual weight.
- Keep surfaces quiet: soft rings, restrained tinting, and very limited shadow or ornament.
- Preserve the sense of open space around one primary starter interaction.

## Style Contract

### Typography

- Keep the serif-first direction from `src/tailwind-input.css` unless the user explicitly asks for a different voice.
- Use tight tracking on large headings and slightly expanded tracking on small uppercase labels.
- Let headings be bold and compact; supporting text should stay calm and readable.

### Color

- Continue using the `app-*` theme tokens from `src/tailwind-input.css`.
- Keep the palette restrained: canvas, surface, text, soft text, accent, and line are the main working colors.
- Treat backgrounds and panels as subtle support, not the main event.

### Layout

- Keep content in a narrow centered column instead of filling the full viewport width.
- Preserve generous outer spacing and a compact vertical rhythm inside interactive elements.
- Keep one clear visual anchor near the top of the page.

### Components

- Inputs or links should feel soft and precise: rounded corners, subtle tinting, thin rings, and a stronger focus state.
- Route and capability lists should read like clean editorial rows, not dense cards or dashboards.
- Supporting status text should stay quiet and inline rather than becoming a banner.

## Anti-Patterns

- Do not add gradient-heavy hero treatments, glossy cards, or marketing-style sections.
- Do not introduce multiple accent colors or decorative illustration unless the user explicitly wants a new identity.
- Do not replace the single-column composition with a busy app shell.
- Do not use stale screenshots to justify visual regressions.

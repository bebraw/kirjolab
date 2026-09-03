---
name: minimal-visual-style
description: Extend Kirjolab's interface without departing from its minimal, editorial, token-driven visual language.
---

# Minimal Visual Style

Inspect `src/ui/`, `src/tailwind-input.css`, the affected feature styles, and
`specs/interface-design-system/spec.md`. Code and the local-only `/__ui`
inventory are authoritative over screenshots.

## Contract

- Keep the scholarly workspace calm, information-dense only where the task requires it, and clear about the active authoring context.
- Continue the serif-first typography and semantic `app-*` tokens unless the user requests a new identity.
- Use tight large headings, calm supporting text, and restrained uppercase labels.
- Limit the palette to quiet canvas, surface, text, soft text, line, and one accent.
- Keep inputs and links soft and precise: rounded corners, subtle tint, thin rings, and a clear focus state.
- Reuse `src/ui/primitives.css` and the typed icon registry before adding feature-local visual recipes.
- Keep status text quiet and inline.

Avoid gradient-heavy heroes, glossy marketing surfaces, interchangeable SaaS
cards, multiple accents, and decorative illustration without an explicit new
direction. Preserve touch targets, reduced-motion behavior, focus visibility,
and both color themes. Verify source behavior before refreshing screenshots.

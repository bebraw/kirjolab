# Kirjolab UI

This directory is Kirjolab's thin internal design system. It codifies the
existing editorial interface without becoming a package, runtime framework, or
domain-component library.

## Layers

- `tokens.css` owns semantic colors, type families, spacing, radii, control
  sizes, elevation, and motion values. Components consume semantic tokens, not
  theme-specific colors.
- `primitives.css` owns reusable visual vocabulary: buttons, icon buttons,
  fields, labels, badges, panels, dialogs, status text, and small layout
  patterns. State is expressed with native attributes, ARIA, and documented
  `data-*` attributes.
- `icons.ts` is the typed registry for trusted reusable SVG geometry.
- `markup.ts` provides small server-rendered markup helpers where they remove
  repeated accessibility and state wiring.
- `app-shell.css` and `workspace.css` own application-wide structure shared by
  several feature surfaces.

The Tailwind entry point imports these shared layers and the bounded feature
styles colocated under `src/client/`. Domain surfaces such as the manuscript
editor, reference cards, and PDF annotation tools keep their styles beside
their owning modules and compose these primitives.

## Contracts

- Prefer an existing primitive before adding another local button, field,
  badge, panel, menu, dialog, toolbar, or status recipe.
- Name classes by role, not page or color. Add a domain class only for layout or
  behavior that is genuinely specific to that feature.
- Keep styles in this directory only when more than one feature surface owns the
  contract. Put bounded feature styles next to their client owner and import
  them through `src/tailwind-input.css`.
- Use `:disabled`, `aria-busy`, `aria-pressed`, `aria-selected`,
  `data-destructive`, `data-compact`, and `data-touch-target` for shared states.
- Keep every icon-only control accessible with an `aria-label`; registry SVGs
  are decorative and always render with `aria-hidden="true"`.
- Inspect the local-only `/__ui` inventory after changing tokens or primitives.
  It is unavailable when `AUTH_MODE` is `access`.

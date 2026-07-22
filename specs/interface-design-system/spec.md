# Feature: Internal Interface Design System

## Purpose

Kirjolab uses one thin, source-local visual system to keep its editorial
workspace coherent across themes, screen sizes, and pointer types without
introducing a frontend component framework.

## Contract

- `src/ui/tokens.css` is authoritative for semantic color, typography,
  spacing, border radius, control size, elevation, and motion values. Warning
  text uses a contrast-safe foreground token distinct from warning marks and
  fills.
- `src/ui/primitives.css` owns reusable buttons, icon buttons, fields, labels,
  badges, panels, dialogs, status messages, and small layout patterns.
- Shared interactive state uses native and ARIA attributes where available.
  The supported additional contracts are `data-destructive`, `data-compact`,
  and `data-touch-target`.
- Disabled controls remain visibly unavailable. Busy controls expose
  `aria-busy="true"`. Selected controls expose `aria-pressed` or
  `aria-selected` according to their interaction pattern. Destructive primary
  actions use the solid error treatment and its paired foreground token;
  destructive secondary and icon actions use the outlined treatment.
- Coarse-pointer touch targets can grow to 44 CSS pixels without forcing that
  density on precise-pointer layouts. Reduced-motion preferences suppress
  decorative control transitions.
- `src/ui/icons.ts` is the registry for repeated trusted SVG geometry. Its
  names are a closed TypeScript union and rendered SVGs are decorative. Every
  registry icon receives the shared `ui-icon` presentation contract so its
  geometry remains visible without feature-local paint rules.
  Icon-only controls retain a visible tooltip where useful and always have an
  accessible name.
- `src/ui/markup.ts` may generate small primitive fragments but cannot own
  domain events, state, or application routing. Its option types prevent
  labelled and icon-only button treatments from being combined incorrectly,
  and production views adopt these fragments incrementally where their markup
  is otherwise repeated.
- PDF annotation tools, reference result cards, the manuscript editor, and
  comparable feature-specific components remain outside `src/ui/` and compose
  primitives.
- `/__ui` renders representative foundations and primitive states only in
  local authentication mode. Production Access mode returns the normal 404.

## Regression Guardrails

- The CSS build resolves the split imports and emits the semantic primitive
  classes.
- Unit tests cover typed SVG rendering, attribute escaping, and shared markup
  state attributes.
- Browser coverage verifies representative default, disabled, busy,
  destructive, selected, field, badge, panel, status, and dialog examples in
  the local visual inventory.
- Application views preserve their existing IDs and behavior while adopting
  the primitive and icon contracts.

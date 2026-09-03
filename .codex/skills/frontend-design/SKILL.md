---
name: frontend-design
description: Design or substantially restyle Kirjolab interfaces while preserving its lightweight architecture and scholarly workspace conventions.
---

# Frontend Design

Inspect the existing stack, `src/ui/`, the affected feature styles, and relevant
specs before choosing a clear visual direction. Build on repository patterns;
do not add dependencies, build steps, or a parallel design system without
approval.

Favor deliberate typography, spacing, hierarchy, and responsive composition
over generic SaaS cards, default styling, or decorative effects without a
concept. Keep shared primitives small and keep bounded feature styles beside
their client owners. Use motion only when it improves comprehension.

For changes that should continue the current aesthetic, use
`minimal-visual-style`. Push toward a new identity only when the user requests
it.

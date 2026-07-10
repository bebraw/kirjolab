---
name: frontend-design
description: Create distinctive, production-grade frontend work for vibe-template. Use when building or redesigning pages, app shells, shared UI components, styling systems, or lightweight frontend experiments, while keeping the result reusable, easy to clone, and easy to prune unless the user asks for a more opinionated direction.
---

# Frontend Design

This project is a lightweight starter for AI-assisted experiments and small software projects. Frontend work should feel intentional and well-designed without turning the template into a heavy, overfit starter.

## Repo Context

- This repo is a template first. Favor reusable patterns over one-off flourishes.
- Keep setup easy to understand, easy to clone, and easy to delete from later projects.
- Avoid introducing new dependencies, build steps, or generated boilerplate unless the user explicitly asks for them.
- Preserve the repo's lightweight nature when choosing structure, naming, and abstraction.

## Workflow

1. Inspect the surrounding files before designing.
2. Choose a clear visual direction that fits the requested surface.
3. Prefer patterns that are portable to future experiments rather than tightly coupled to one demo.
4. Keep the implementation small enough that a user can prune or reshape it quickly.
5. If a style or component pattern becomes reusable, document or centralize it in the repo's existing structure instead of scattering one-off decisions.

## Design Direction

- Default tone: purposeful, clear, and a bit bold.
- Favor strong typography, deliberate spacing, and a coherent visual direction over generic app-shell layouts.
- Avoid generic AI aesthetics: purple-on-white gradients, interchangeable SaaS cards, default system-font styling, or decorative effects without a concept behind them.
- Let the design have character, but keep it adaptable enough to serve as a starter.
- Use motion sparingly and only when it sharpens the interface or gives the template a memorable edge.

## Implementation Notes

- Match the implementation to what the repo already uses instead of inventing a parallel design system.
- Prefer small reusable pieces over sprawling one-off page code.
- Keep desktop and mobile layouts both intentional.
- Comments should stay rare and only explain non-obvious logic.

## When To Stretch Further

Push the design harder when the user explicitly asks for a more branded landing page, a stronger visual identity, or a showcase-style experiment. In those cases, make the bold choice feel deliberate while still keeping the code understandable and removable.

---
name: wayfinder
description: Map a large, uncertain, multi-session initiative in one repository-local decision map before specification or implementation.
---

# Wayfinder

Clarify the route without implementing the destination. Use only when material uncertainty spans multiple sessions; stop early when direct specification or planning is responsible.

## Authority and boundaries

- Keep one map at `docs/wayfinding/<effort>.md`.
- Create no issues, tracker configuration, coordination branches, or companion setup files.
- Keep throwaway research outside the repository unless the user approves a lasting path.
- Treat the map as working context. Promote global rules to `ARCHITECTURE.md`, lasting decisions to ADRs, and feature contracts to specs; leave concise links in the map.

## Map

Include: `Status`, `Destination`, `Context anchors`, `Decisions`, `Frontier`, `Blocked`, `Fog`, `Out of scope`, and `Handoff`. Each frontier item must be precise and currently answerable, with a mode (`Human decision`, `Research`, `Prototype`, or `Prerequisite`) and why it matters now. Keep every question in exactly one of `Frontier` or `Blocked`.

## Chart

1. Inspect repository facts before asking questions.
2. Establish the destination with the user; use brainstorming when comparing directions would help.
3. Explore breadth-first, separating researchable facts from user judgments.
4. Draft scope, frontier, blockers, and fog. If meaningful fog is absent, recommend direct specification or planning.
5. Confirm destination and initial frontier, write the map, and pause unless the user asks to continue.

## Resolve

Load only the destination, anchors, decisions, question titles, and context relevant to one frontier item. Research facts; return product or architectural judgments to the user. After confirmation, update required durable records, move the resolved item to `Decisions`, unblock dependent questions, and update `Handoff`. Do not batch unrelated judgments or begin implementation.

Mark `Ready for specification` only when no frontier, blockers, or actionable fog remain and the handoff names the next artifact.

Adapted from Matt Pocock's MIT-licensed `wayfinder` skill, revision `2ab958093e83e0ec752e6c1c5932da465bf23e0c`.

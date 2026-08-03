---
name: wayfinder
description: Map a large, uncertain initiative across multiple agent sessions as a lightweight repository-local decision map. Use when the destination is meaningful but the route is too unclear for a responsible spec or implementation plan, and the user explicitly asks to wayfind or map the effort before building.
---

# Wayfinder

Clarify the route to a destination without implementing the destination. Keep one reviewable map in the repository and graduate durable outcomes into the repo's existing specs, ADRs, or architecture documents.

## Boundaries

- Use this workflow only when the effort is both uncertain and likely to span multiple sessions.
- Stop early when the work is already clear enough to specify or plan directly.
- Produce decisions and context pointers, not implementation deliverables.
- Keep the canonical map at `docs/wayfinding/<effort>.md`.
- Do not create issues, labels, tracker configuration, coordination branches, or companion setup files.
- Keep throwaway research notes and prototypes outside the repository. Ask before giving a new supporting artifact a lasting repository path.
- Treat the map as working context, not the durable authority for architecture or feature behavior.

## Durable context

Before charting or resolving, read `AGENTS.md`, `ARCHITECTURE.md`, relevant specs, and relevant ADRs. Consult `.asdlc/SKILL.md` when the work raises ASDLC questions.

Promote a resolution immediately when it changes lasting context:

- Global architecture rule: update `ARCHITECTURE.md`.
- Lasting architectural decision: add or update the appropriate ADR.
- Feature behavior, contract, workflow, or guardrail: add or update `specs/<feature-domain>/spec.md`.
- Temporary exploration or local scoping choice: keep a concise resolution in the map.

The map should gist and link to durable records instead of duplicating them.

## Map format

Use a single file unless the user approves another lasting artifact:

```markdown
# Wayfinding: <effort>

**Status:** Active | Ready for specification | Closed

## Destination

<One or two sentences describing the artifact or decision that marks the end.>

## Context anchors

- [Relevant spec, ADR, architecture section, or source file](path)

## Decisions

- **<Question>** — <one-line resolution> ([durable record](path), when applicable)

## Frontier

### <Precise question answerable now>

- **Mode:** Human decision | Research | Prototype | Prerequisite
- **Why now:** <what this unlocks>

## Blocked

### <Precise question>

- **Blocked by:** <frontier question title>

## Fog

- <In-scope area whose exact question cannot yet be stated>

## Out of scope

- <Boundary and brief reason>

## Handoff

<Next durable artifact to create, or why the destination is ready.>
```

Keep questions in exactly one of `Frontier` or `Blocked`. The frontier contains only precise, currently answerable questions. Fog is in scope but not precise enough to become a question.

## Chart a map

1. Inspect the repository and its durable context before asking factual questions.
2. Establish the destination with the user. Use `brainstorming` when comparing approaches would clarify it.
3. Explore breadth-first. Separate facts that can be investigated from judgments only the user can make.
4. Draft the initial frontier, blocked questions, fog, and scope boundaries.
5. If no meaningful fog remains, explain that Wayfinder is unnecessary and recommend direct specification or planning.
6. Confirm the destination and initial frontier with the user.
7. Create the map and pause. Resolve a question in the same session only when the user asks to continue; never begin implementation from the charting workflow.

## Resolve a question

1. Load the map at low resolution: destination, context anchors, decisions, and question titles.
2. Use the user's selected frontier question, or choose the first one when none is named.
3. Load only the context relevant to that question.
4. Resolve facts through repository inspection or primary-source research. Put every product or architectural judgment to the user; never answer the human side of a decision.
5. Use a temporary prototype only when concrete feedback is cheaper than further discussion.
6. State the proposed resolution concisely and confirm subjective decisions with the user.
7. Update durable context where required, then replace the frontier question with a one-line entry under `Decisions`.
8. Move newly unblocked questions to `Frontier`, sharpen fog only when the resolution makes that possible, and update `Handoff`.
9. Do not batch unrelated judgments. After updating the map, offer the next frontier question; continue in the same session only when the user asks and the context remains focused.

## Completion

Mark the map `Ready for specification` only when:

- no frontier, blocked questions, or actionable fog remain;
- out-of-scope boundaries are explicit;
- lasting decisions point to their ADRs, specs, or architecture sections; and
- the handoff names the next artifact clearly.

Do not implement or write the final spec unless the user asks for that next step.

## Provenance

Adapted from Matt Pocock's MIT-licensed [`wayfinder`](https://github.com/mattpocock/skills) skill at revision `2ab958093e83e0ec752e6c1c5932da465bf23e0c`. This version replaces issue-tracker orchestration with repository-local context and the template's ASDLC documentation rules.

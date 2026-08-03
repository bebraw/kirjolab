# Add A README Skill Catalog

Use this update when a downstream project contains repository-local skills but its README does not help users discover or request them.

## Apply

1. Inventory the target project's `.codex/skills/*/SKILL.md` files.
2. Add an `Agent Skills` section near the README's documentation overview.
3. Explain that users may describe a job naturally or request a skill by name with `$skill-name`.
4. Group skills by the job they perform and give each a short, outcome-focused description.
5. Mark skills that require explicit invocation so users know they must name them.
6. Link each catalog entry to its `SKILL.md` rather than duplicating the full workflow.
7. Run the target project's documentation checks.

## Fallback

If the patch does not apply because the target README or skill set has diverged, port the section manually. List only skills present in the target project, keep its existing README organization, and preserve any project-specific invocation policy.

If the target uses a different skill root, update the links and inventory command instead of adding a second skill directory.

## Verify

- Confirm each project-local skill appears once in the README catalog.
- Confirm every catalog link resolves to an existing `SKILL.md`.
- Confirm explicit-only skills are identified accurately.
- Confirm descriptions explain user outcomes rather than internal implementation details.
- Run the target project's Markdown formatting check.

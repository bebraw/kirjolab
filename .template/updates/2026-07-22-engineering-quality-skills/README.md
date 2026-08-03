# Add Engineering Quality Skills

Use this update when a downstream project already follows `vibe-template` conventions and should gain the focused correctness review, test review, and systematic debugging workflows added to the template.

## Apply

1. Inspect existing project-local review, testing, and debugging skills before adding new files.
2. Add the pinned `correctness-review`, `test-review`, and `debug` skill directories under `.codex/skills/`, including their MIT license files and source metadata.
3. If an equivalent skill already exists, merge the concrete evidence thresholds and missing workflow steps instead of overwriting stronger project-specific guidance.
4. Register the three skills in `AGENTS.md` or the target repo's equivalent capability registry.
5. Keep target-project authorization boundaries, severity labels, test commands, and readiness gates authoritative.
6. Run the target repo's normal formatting, documentation, and quality checks.

## Fallback

If the patch does not apply because the target repo has different agent guidance or skill paths, use `.capabilities/engineering-quality-skills/` as the manual migration source. Copy only the skills the target repo lacks and adapt the registration text to its existing conventions.

If the target agent uses a different repository-local skill directory, preserve each `SKILL.md` with its adjacent `LICENSE` while translating only the destination path.

## Verify

- Confirm the three skill names match their directories.
- Confirm every skill retains source revision `7d79c7754f2b9d656f7db7b9ecefcb7532b6d256` and its MIT license.
- Confirm the target repo's agent guidance explains when each skill applies.
- Run the target repo's normal formatting or documentation checks.
- Run the target repo's quality gate when its readiness policy treats agent-skill changes as executable workflow changes.

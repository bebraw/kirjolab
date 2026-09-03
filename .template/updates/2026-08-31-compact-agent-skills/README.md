# Compact The Agent Skill Baseline

Use this update when a project can target `gpt-5.6-sol`-class agents and its local skills repeat generic engineering guidance or version-sensitive manuals.

The focused patch updates durable policy, catalog, spec, and ADR surfaces. Skill directories vary too much across downstream projects for safe bulk replacement; copy or adapt retained entrypoints from the current template and perform removals manually.

## Apply

1. Inventory active skill entrypoints separately from distribution copies and conditional references. Measure frontmatter descriptions because routing sees them even when bodies remain unloaded.
2. Remove the Caveman suite when concise communication, review, and commit behavior are already available without a persistent persona. If `skills-lock.json` tracks other skills, remove only Caveman entries instead of deleting the lockfile.
3. Remove `sandbox-sdk` unless the target actually uses `@cloudflare/sandbox`. Preserve any adopted product-specific skill.
4. Compact each retained canonical entrypoint around project-specific decisions, exact local commands, non-obvious invariants, retrieval routes, and safety boundaries. Delete static command catalogs, metric tables, framework inventories, repeated trigger lists, generic examples, and generic workflow advice.
5. Keep destructive-action approval, secret handling, telemetry controls, reviewed version pins, evidence thresholds, public-seam testing, and repository verification requirements explicit.
6. Retrieve version-sensitive CLI syntax, platform APIs, and performance thresholds through installed help or current primary documentation.
7. Synchronize intentional `.github/skills/` and capability-kit copies byte-for-byte with their canonical sources. Remove references that only duplicate current external manuals.
8. Update the target's skill catalog, architecture rules, living spec, and ADR record to match its retained baseline.

## Fallback

The patch targets a repository that still resembles `vibe-template`; use this guide when skill names, copies, or docs have diverged. Do not remove a product skill merely because this template does not use it—inspect the target's dependencies and feature contracts first.

For weaker or offline-only agents, retain the minimum additional guidance demonstrated necessary by real failures. Prefer focused conditional references over restoring broad manuals to every invocation.

## Verify

- Confirm every retained `SKILL.md` has valid `name` and `description` frontmatter.
- Review descriptions for precise routing and normally no more than 30 words.
- Confirm Wrangler and Modern Web Guidance contain no moving `@latest` fallback.
- Confirm Modern Web Guidance still pins `modern-web-guidance@0.0.180` and disables telemetry.
- Confirm Worker, Wrangler, web-performance, engineering-quality, and Local CI copies match their canonical sources.
- Confirm no Caveman or unadopted Sandbox skill remains.
- Run `npm run format:check` and the target repository's normal local CI gate.

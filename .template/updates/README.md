# Template Updates

This directory stores reviewable update packs for projects that started from
`vibe-template` or copied one of its capability kits.

Update packs are intentionally plain files. Apply them like small migrations,
not like an upstream merge that overwrites a project.

If you are an agent working in another repository and the user says "look at
vibe-template for latest updates", start with
[`AGENT_SYNC.md`](./AGENT_SYNC.md). It is the canonical cross-repo sync
workflow.

## Layout

Each update lives under `.template/updates/{update-id}/` and contains:

- `update.json` with machine-readable metadata
- `README.md` with the migration intent and manual fallback
- `patch.diff` with the focused patch to try first

`update.json` uses this shape:

```json
{
  "id": "2026-06-14-agent-ci-warm-cache",
  "title": "Use Agent CI warm-cache serialization",
  "status": "implemented",
  "risk": "low",
  "supersedes": ["2026-05-31-local-agent-ci-install-lock"],
  "adrs": ["docs/adrs/implemented/ADR-031-use-agent-ci-warm-cache-serialization.md"],
  "touches": ["package.json", ".github/workflows/ci.yml", "docs/", "specs/"],
  "checks": ["npm run quality:gate", "npm run ci:local"]
}
```

## Applying A Pack

1. Read `update.json` and `README.md`.
2. Inspect `patch.diff`.
3. Try `git apply --check .template/updates/{update-id}/patch.diff`.
4. If it applies cleanly, apply it and adapt package versions as needed.
5. If it does not apply cleanly, use `README.md` as the manual migration guide.
6. Run the listed checks.
7. Record the applied update ID in the target project's durable docs or package
   metadata.

## Recording Applied Updates

Prefer a lightweight record in the target repo:

```json
{
  "vibeTemplate": {
    "updates": ["2026-06-14-agent-ci-warm-cache"]
  }
}
```

Use a docs record instead when package metadata is not the right place for the
target project.

## Authoring A New Pack

Create an update pack when a template change is reusable across downstream
projects and is more specific than a capability kit. Good candidates include
workflow changes, quality-gate behavior, package-manager baseline shifts,
architecture-rule changes, and new reusable scripts.

Do not create packs for one-off content edits or changes that only make sense
inside this template.

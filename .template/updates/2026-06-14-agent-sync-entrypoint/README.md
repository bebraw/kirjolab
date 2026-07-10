# Add The Agent-Facing Template Sync Entrypoint

Use this when a downstream project or agent needs a single file to read after
the user says, "look at vibe-template for latest updates."

## Apply

1. Copy `.template/updates/AGENT_SYNC.md` into the template checkout.
2. Reference it from `.template/updates/README.md`.
3. Reference it from top-level docs so users know the short instruction to give
   another agent.
4. Keep update packs as the source of actual migrations.

## Fallback

If the target project does not want to keep `.template/updates/`, store the
sync instructions in its normal agent guidance and point to the external
`vibe-template/.template/updates/AGENT_SYNC.md` file.

## Verify

- Parse this pack's `update.json`.
- `npm run quality:gate`

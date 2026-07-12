# Remove a Stale README Screenshot

Use this update when a project inherited the template's manually maintained
README screenshot and the image no longer represents the current application.

## Apply

1. Remove the application screenshot section from `README.md`.
2. Delete `docs/screenshots/home.png` when nothing else references it.
3. Keep screenshot scripts and automation out of the baseline.
4. Update project-specific documentation contracts that require the asset.

## Fallback

Keep the screenshot only when it is current and the target project explicitly
owns its refresh workflow. The optional `readme-screenshot` capability kit
remains available for projects that want local capture tooling.

## Verify

- Search the target project for stale screenshot references.
- Run the target project's documentation checks or normal quality gate.

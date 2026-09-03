---
name: local-ci
description: Run Kirjolab's native quality gate and optional Local CI container parity when changes cross the repository's readiness boundary.
license: MIT
compatibility: Requires the repository Node.js toolchain; Docker is optional for workflow parity
metadata:
  author: redwoodjs
  version: "1.0.0"
---

# Local CI

Use the native repository interface for normal readiness:

```bash
npm run ci:local
```

This runs the full quality gate on the supported macOS host. Use focused checks
while iterating, but do not treat a non-documentation change as ready until this
command passes.

Use the optional container path only for GitHub Actions or Linux parity:

```bash
npm run ci:local:container
```

It prewarms dependencies, emits structured progress, and pauses failed runners.
After fixing a paused job, retry it with:

```bash
npm run ci:local:container:retry -- --name <runner-name>
```

Use `--from-step <N>` only when an earlier step must rerun. Preserve the event
stream through raw passthrough when a wrapper would buffer output. Do not push
merely to obtain feedback available through these local workflows.

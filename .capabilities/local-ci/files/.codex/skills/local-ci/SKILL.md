---
name: local-ci
description: Run the repository's GitHub Actions workflow locally for workflow-sensitive or explicit full-readiness validation and paused-runner retries.
---

# Local CI

Use the repository-pinned interface:

```bash
npm run ci:local
```

It prewarms dependencies, emits quiet NDJSON lifecycle events, and pauses failed runners. Preserve the event stream by using raw passthrough when a command wrapper is required.

After fixing a paused job, retry it with:

```bash
npm run ci:local:retry -- --name <runner-name>
```

Use `--from-step <N>` only when an earlier step must rerun. Non-TTY paused runs exit `77`; use the `run.paused` event's `retry_cmd` or the command above.

Do not push merely to obtain CI feedback that this local workflow provides. Skip Local CI for changes outside the repository's workflow-sensitive boundary unless the user asks for full PR or release readiness.

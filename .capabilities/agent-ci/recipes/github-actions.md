# Optional GitHub Actions Recipe

Use this recipe only when the target repo has no GitHub Actions workflow for Agent CI to run.

Before adding a workflow, ask:

```text
This repo has no GitHub Actions workflow for Agent CI to run. Do you want me to add a minimal npm CI workflow as part of this upgrade?
```

Stop if the user says no. Agent CI should not introduce remote CI behavior without explicit approval.

## Minimal npm Workflow

Create `.github/workflows/ci.yml` only after approval:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: package.json
          cache: npm

      - run: npm ci
      - run: npm test
```

## Adapt Before Committing

- If the target repo has a known default branch other than `main`, use that branch.
- If the target repo has an existing quality script, run that instead of `npm test`.
- If the target repo has browser or service dependencies, add them deliberately instead of guessing.
- If the target repo lacks tests, ask whether the workflow should run a lighter command such as `npm run build`.
- Document the new remote CI expectation in the target repo's durable docs.

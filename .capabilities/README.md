# Capability Kits

Capability kits are reviewable partial-upgrade guides for applying one template practice to another repo without copying the whole template.

## Available Kits

| Kit                                                            | Purpose                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`typescript-setup`](./typescript-setup/README.md)             | Add strict no-emit TypeScript checking for npm projects.           |
| [`agent-ci`](./agent-ci/README.md)                             | Add local GitHub Actions execution through Agent CI.               |
| [`quality-gate`](./quality-gate/README.md)                     | Add the fast verification baseline and optional browser gate.      |
| [`mutation-testing`](./mutation-testing/README.md)             | Add Stryker mutation testing for TypeScript projects using Vitest. |
| [`pre-push-quality-gate`](./pre-push-quality-gate/README.md)   | Add a repo-managed pre-push hook that runs the fast quality gate.  |
| [`readme-screenshot`](./readme-screenshot/README.md)           | Add local-only README screenshot capture through Playwright.       |
| [`lighthouse-performance`](./lighthouse-performance/README.md) | Add local Lighthouse performance reports and a performance budget. |

## Reviewed But Not Extracted

- **Cloudflare Worker starter:** reusable, but larger and more app-specific than the current kit shape. Extract it only when a target repo needs the full Worker/Tailwind/source-layout surface.
- **ASDLC documentation baseline:** useful, but it is a repo-governance model rather than a narrow tool upgrade.

## How To Use

1. Pick the smallest kit that matches the target repo's need.
2. Read the kit README and manifest.
3. Follow the target package-manager recipe.
4. Copy files from `files/` only after checking for existing target-project conventions.
5. Ask before applying any optional adjacent setup.
6. Run the kit checks and the target repo's normal quality gate.

## Negotiation Prompt

Use this prompt in a target repo when you want an agent to inspect the repo and negotiate which kits to pull before making changes:

```text
Review this repo and the capability kits from vibe-template.

Do not edit files yet.

First, inspect the target repo for:
- package manager and lockfile
- existing TypeScript config and typecheck scripts
- existing GitHub Actions workflows
- existing local quality/test scripts
- existing mutation testing setup or assertion-strength checks
- existing Git hooks or hook managers
- app/runtime surface that might need browser, screenshot, or Lighthouse checks
- durable docs where new workflow contracts should be recorded

Then present a capability selection UI:

Capability Pull Plan

[ ] typescript-setup
    Adds strict no-emit TypeScript checking for npm projects.
    Include if the repo uses TypeScript, wants TypeScript, or needs a reusable typecheck script and tsconfig baseline.

[ ] agent-ci
    Adds local GitHub Actions execution through Agent CI.
    Include if the repo has or wants GitHub Actions and Docker-backed local CI.

[ ] quality-gate
    Adds formatting, type checking, audit, unit tests, and coverage checks.
    Include if the repo lacks a clear fast local verification baseline. Apply typescript-setup first unless the repo already has an equivalent typecheck contract.

[ ] mutation-testing
    Adds Stryker mutation testing for TypeScript projects using Vitest.
    Include if the repo already has meaningful unit tests and wants assertion-strength checks in the full readiness gate. Keep out of fast pre-push hooks unless explicitly approved.

[ ] pre-push-quality-gate
    Adds a repo-managed pre-push hook for the fast gate.
    Include only if the repo has a fast gate and no conflicting hook manager, or after asking how to integrate.

[ ] readme-screenshot
    Adds local-only README screenshot capture through Playwright.
    Include if the repo has a stable local UI worth showing in docs.

[ ] lighthouse-performance
    Adds local Lighthouse reports and a performance budget.
    Include if the repo has a browser-visible surface and wants local performance checks.

For each recommended capability, explain:
- why it fits this repo
- files/scripts/dependencies it would add or change
- optional adjacent setup that needs approval
- checks you would run

Ask me to approve the final capability list before editing files.
```

After approval, apply only the selected kits. If a selected kit discovers optional adjacent setup, such as creating a GitHub Actions workflow for Agent CI, ask again before adding that adjacent capability.

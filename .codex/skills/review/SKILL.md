---
name: review
description: Review proposed changes for vibe-template projects. Use when the user asks for a review, wants risks or regressions identified, or needs a code-focused quality pass before landing work, while keeping the review concrete, prioritized, and grounded in the repo's lightweight standards.
---

# Review

This project is a lightweight starter for AI-assisted experiments and small software projects. Reviews should focus on bugs, regressions, maintainability risks, and quality-gate gaps rather than broad stylistic commentary.

## When To Use

Use this skill when the user is:

- asking for a code review
- asking whether a change is safe to merge
- requesting bug, regression, or risk analysis
- looking for a quality pass before commit or release

## Review Priorities

1. Behavioral regressions
2. Broken quality-gate expectations
3. Maintainability or architecture drift
4. Missing or misleading documentation for user-visible changes
5. Lower-priority polish issues

## Workflow

1. Inspect the actual diff or changed files first.
2. Look for concrete failure modes before stylistic preferences.
3. Check whether the change still fits the repo's lightweight and reusable nature.
4. Verify whether tests, type checks, formatting, and other relevant gates were updated or bypassed.
5. Report only findings that materially help the user decide what to fix next.

## Output Shape

- Present findings first, ordered by severity.
- Include file references whenever possible.
- Keep each finding concrete: what is wrong, why it matters, and what behavior or maintenance risk it creates.
- If there are no findings, say so explicitly and mention any residual risk or verification gaps.

## Repo Guidance

- Prefer review comments that preserve the template's small, reusable shape.
- Call out undocumented architectural changes that should update ADRs or specs.
- Treat missing quality-gate coverage as a real issue when the change meaningfully alters behavior.
- Do not invent problems just to make the review look thorough.

## Anti-Patterns

- Do not lead with summaries when there are real findings.
- Do not focus on formatting nitpicks when there are behavioral issues.
- Do not speculate about bugs without tying them to code or concrete execution paths.
- Do not treat personal preference as a defect.

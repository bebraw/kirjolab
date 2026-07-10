---
name: security
description: Review and shape security-sensitive work for vibe-template projects. Use when the user is handling authentication, secrets, access control, data exposure, input validation, or security hardening, while keeping recommendations concrete, lightweight, and appropriate for small projects.
---

# Security

This project is a lightweight starter for AI-assisted experiments and small software projects. Security guidance should focus on realistic risks, concrete mitigations, and proportionate controls instead of enterprise-heavy process for its own sake.

## When To Use

Use this skill when the user is:

- designing or reviewing authentication and authorization
- handling secrets, tokens, cookies, or environment configuration
- exposing APIs, forms, uploads, or admin surfaces
- asking for security hardening, threat review, or misuse resistance
- evaluating whether a change introduces security-sensitive behavior

## Review Priorities

1. Secrets exposure and unsafe defaults
2. Missing access control or broken trust boundaries
3. Input validation and injection risks
4. Sensitive data handling, logging, and storage risks
5. Security gaps in docs, setup, or quality gates

## Workflow

1. Identify the trust boundary first: user input, external service, local operator, CI, or deployment environment.
2. Look for concrete attack paths rather than generic checklists.
3. Prefer mitigations that fit the repo's lightweight nature and are easy to keep correct.
4. Distinguish between real vulnerabilities, hardening opportunities, and low-priority hygiene.
5. When a security-sensitive rule becomes durable, capture it in specs, ADRs, or repo guidance.

## Output Shape

- Prioritize findings by severity and exploitability.
- Explain what could go wrong, under what conditions, and how to reduce the risk.
- Prefer practical mitigations over abstract warnings.
- Call out when the right fix is documentation, configuration, code, or a quality gate update.

## Repo Guidance

- Favor secure defaults that future cloned projects are unlikely to misuse.
- Avoid recommending heavyweight security stacks unless the user explicitly needs them.
- Treat leaked credentials, permissive auth, and unsafe local tooling defaults as high-signal issues.
- Keep security advice concrete enough to implement in the repo, not just discuss in theory.

## Anti-Patterns

- Do not inflate minor hygiene issues into critical vulnerabilities.
- Do not recommend complex platforms or dependencies by default.
- Do not give vague advice like "improve security" without naming the boundary and failure mode.
- Do not ignore local-development attack surfaces just because the project is small.

---
name: brainstorming
description: Generate, compare, and refine ideas for vibe-template projects. Use when the user is exploring options, shaping a feature, evaluating trade-offs, or asking for structured ideation before implementation, while keeping proposals lightweight, concrete, and easy to turn into specs, ADRs, or code.
---

# Brainstorming

This project is a lightweight starter for AI-assisted experiments and small software projects. Brainstorming should produce concrete, reviewable options that help a project move forward without bloating the template or drifting into generic idea dumps.

## When To Use

Use this skill when the user is:

- exploring multiple solution directions
- comparing trade-offs before implementation
- shaping a feature, workflow, or architecture change
- looking for naming, structure, or product-surface options
- trying to turn a vague idea into a spec, ADR, or executable plan

## Workflow

1. Start by naming the design space clearly: what is being decided, what constraints already exist, and what success looks like.
2. Generate a small set of distinct options rather than a long list of minor variants.
3. Explain the trade-offs between options in concrete repo terms: complexity, portability, maintenance cost, and fit for a lightweight template.
4. Converge toward a recommendation when the evidence is clear instead of leaving the user with an unstructured menu.
5. When helpful, end with the next artifact to create: code, an ADR, a spec, or a short implementation plan.

## Output Shape

- Prefer 3-5 meaningful options over 20 shallow ones.
- Make options materially different from each other.
- Use concise labels and short rationales.
- Call out the recommended option when one clearly fits best.
- Keep ideas actionable enough that they can be implemented or documented without another translation step.

## Repo Guidance

- Favor ideas that preserve the template's lightweight and reusable nature.
- Avoid brainstorming that implicitly assumes dependencies, CI expansion, or structural churn unless the user explicitly wants that.
- Prefer conventions that can be documented and reused over one-off cleverness.
- If an idea represents a meaningful architectural decision, capture it in an ADR or spec once the direction is chosen.

## Anti-Patterns

- Do not produce filler lists with cosmetic variations.
- Do not recommend heavyweight scaffolding by default.
- Do not hide trade-offs behind vague wording like "more scalable" or "more robust" without explaining what that means here.
- Do not stop at ideation when the user has already moved from brainstorming to execution.

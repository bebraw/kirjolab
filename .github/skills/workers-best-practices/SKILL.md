---
name: workers-best-practices
description: Author or review Cloudflare Worker code and Wrangler configuration using current platform guidance and this repository's runtime safeguards.
---

# Workers Best Practices

Retrieve current Cloudflare documentation before relying on version-sensitive APIs, configuration fields, compatibility flags, limits, or binding shapes. Keep repository architecture, specs, installed types, and tests authoritative over generic examples.

## Review context

Read the complete affected Worker modules, `wrangler.jsonc`, generated binding types, relevant specs, and callers. Use the connected Cloudflare documentation for current platform behavior and `node_modules/wrangler/config-schema.json` for the installed config contract.

## Invariants

- Stream large or unbounded bodies; do not buffer them without a demonstrated size bound.
- Keep request-scoped mutable state inside the request, Durable Object, or other declared owner—not module globals.
- Settle every promise with `await`, `return`, `void`, or `ctx.waitUntil()` according to whether the response depends on it.
- Prefer bindings and service bindings over authenticated REST calls from a Worker when the platform exposes the needed in-process capability.
- Keep secrets out of source and config. Use cryptographically secure platform APIs for security-sensitive randomness and comparisons.
- Keep binding access aligned with generated types. Do not introduce `any`, unsafe double casts, or hand-written binding shapes that can drift from config.
- Preserve streaming and serialization boundaries when forwarding requests or responses.
- Use explicit error handling and structured, non-sensitive observability. Do not hide failures with pass-through behavior.

## Workflow

1. Retrieve only the documentation needed for the affected API or pattern.
2. Check code and configuration together, including binding names and environment overrides.
3. Implement the smallest repository-compatible change.
4. Run type generation when config bindings changed, then targeted tests, typecheck, and the required quality gate.

For reviews, report only concrete Worker-specific failures or risks with source evidence and a fix direction. Do not repeat general style guidance.

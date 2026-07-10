# Feature: Stub Worker (Superseded)

## Blueprint

### Context

The original template shipped a stateless route-index Worker so the repository
had a runnable surface. Kirjolab's scholarly-workspace vertical slice replaced
that surface on 2026-07-10.

The implemented behavior now lives in
[`specs/scholarly-workspace/spec.md`](../scholarly-workspace/spec.md). This file
preserves the earlier feature boundary without describing stale runtime
contracts.

### Architecture

- **Retained:** `src/worker.ts` remains the Worker entry point and router.
- **Retained:** `src/api/` and `src/views/` remain separate boundaries.
- **Retained:** generated Tailwind CSS is served through `/styles.css`.
- **Replaced:** the static starter home page became the Kirjolab workspace.
- **Extended:** typed browser code is generated externally and served through
  `/app.js` without inline executable code.
- **Extended:** the Worker now uses Durable Object and R2 bindings.

### Anti-Patterns

- Do not restore the route-index starter over the active scholarly workspace.
- Do not use this superseded spec as the current application contract.
- Keep the original external-client-code and separated routing boundaries.

## Contract

### Definition of Done

- [x] The superseded feature points to its replacement contract.
- [x] Retained architecture boundaries remain explicit.

### Regression Guardrails

- `GET /api/health` must remain a stable smoke-test endpoint.
- Worker-rendered HTML must remain free of inline executable browser code.
- Unknown routes must continue returning HTTP 404.

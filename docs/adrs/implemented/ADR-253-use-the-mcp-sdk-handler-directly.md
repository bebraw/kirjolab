# ADR-253: Use the MCP SDK Handler Directly

**Status:** Implemented

**Date:** 2026-11-18

**Amends:** [ADR-247](./ADR-247-retire-mcp-peer-overrides.md) and
[ADR-248](./ADR-248-use-valibot-for-corpus-mcp-schemas.md)

## Context

The production audit reports
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) in
`picomatch@4.0.7`. No patched release is published. Agents 0.33.0 introduces
the production path through `@rolldown/plugin-babel`, Vite, and their glob
dependencies. npm suggests downgrading Agents to 0.8.3, which predates the
current MCP API and is not a compatible remediation.

Kirjolab imports Agents only for `createMcpHandler` from `agents/mcp/server`.
It uses no Agent class, Agents OAuth context, reverse server requests, or
sessionful MCP transport. The already installed MCP server SDK 2.4.0 exposes
the underlying `createMcpHandler` and `hostHeaderValidationResponse` APIs.
Its published handler documentation explicitly supports Workers' standard
`Request`/`Response` interface and requires callers to own Host and Origin
validation. Corpus already owns routing, Access identity, owner selection,
exact-origin validation, and CORS outside the wrapper.

## Decision

Import `createMcpHandler` directly from `@modelcontextprotocol/server` and
remove the Agents dependency. Keep MCP server/core 2.4.0 and patched Zod
4.6.7 without adding packages, overrides, or audit exceptions.

Retain a fresh server per request with `legacy: "stateless"`. Keep Host
validation explicit through the SDK helper before dispatch. Preserve Corpus
origin validation and CORS and the Worker's authenticated `/mcp` routing and
owner selection. Tool/resource schemas, callbacks, and sanitized errors do
not change. GET and DELETE remain unsupported session operations.

Keep the audit's shipped-dependency scope and high-severity failure threshold.
Verify the production dependency graph, audit, MCP contracts, TypeScript,
Workers tests, native CI, and both deployment dry runs. A tooling regression
checks that Agents and its build-tool dependency path cannot enter the
production graph again through this integration.

## Consequences

- Production dependencies no longer contain Agents, its MCP client peer, or
  the vulnerable build-tool dependency path. Remaining package versions do
  not change.
- Corpus uses the protocol SDK directly and retains one application-owned
  authentication and origin boundary.
- The wrapper's optional Agents OAuth and reverse-request compatibility
  behavior is unavailable. A future feature needing those capabilities must
  make that adoption explicit and repeat security and protocol verification.
- Picomatch remains in development-only tooling and has no published patch
  as of this decision. Whole-graph audits still report that finding; the
  production audit is not suppressed or weakened.

## Alternatives Considered

- Upgrading picomatch or Agents cannot fix the current graph: 4.0.7 and 0.33.0
  are their latest published releases at this decision date.
- Downgrading Agents to npm's suggested 0.8.3 would replace the current MCP
  integration with an incompatible API.
- Moving Agents to development dependencies would exclude a runtime import
  from the production audit without removing that import.
- A private picomatch patch or unpublished fork would add maintenance for a
  dependency Corpus does not need.
- Suppressing the advisory or lowering the audit threshold would preserve the
  vulnerable production dependency path and weaken the existing gate.

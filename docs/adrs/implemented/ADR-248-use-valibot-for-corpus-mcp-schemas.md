# ADR-248: Use Valibot for Corpus MCP Schemas

**Status:** Implemented

**Date:** 2026-11-12

## Context

[ADR-170](./ADR-170-use-valibot-at-trust-boundaries.md) selects Valibot for
external validation. Research Corpus MCP remained the only application module
importing Zod, with strict tool inputs and resource-variable schemas. The MCP
SDK accepts Standard Schema with a JSON Schema projection, so this boundary
can share the established validator without replacing the transport chosen in
[ADR-228](./ADR-228-expose-corpus-through-http-and-mcp.md).

## Decision

Define Corpus MCP tool and resource-variable schemas in Valibot. Register
tool schemas through `@valibot/to-json-schema`'s `toStandardJsonSchema` so
runtime validation and advertised JSON Schema derive from the same contract.
Parse resource variables before calling the corpus application service.

Preserve strict rejection of extra tool keys, existing UUID acceptance,
integer bounds, optional fields, and non-coercing tool inputs. Resource page
variables remain ASCII decimal digits resolving to an integer from 1 through 200. Retain the existing tool error envelopes, resource `InvalidParams`
classification, stable validation message, and sanitized unexpected failures.

Keep `McpServer`, the Agents stateless handler, Access authentication, and owner
scope unchanged. Application modules no longer import Zod. Retain the patched
direct Zod 4.6.7 pin solely to satisfy Agents' non-optional peer and MCP upstream
compatibility, consistent with
[ADR-247](./ADR-247-retire-mcp-peer-overrides.md). This migration does not claim
to remove Zod from the installed or bundled upstream dependency graph.

## Consequences

**Positive:**

- Application-owned MCP contracts use the established validation library.
- Tool discovery and runtime checks share one schema definition.

**Negative:**

- The JSON Schema adapter is an additional pinned dependency.
- Schema projection and exact boundary compatibility need focused protocol
  tests; upstream peers still require Zod.

## Alternatives Considered

### Keep application Zod schemas

This keeps a second application validation API for one bounded integration
even though the existing SDK supports the established validator.

### Handwrite JSON Schema or replace the MCP server

Handwritten projections duplicate the validation contract. Replacing the
server expands this change into transport and lifecycle behavior without a
product requirement.

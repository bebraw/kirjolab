# ADR-228: Expose the Corpus Through HTTP and MCP

**Status:** Implemented

**Date:** 2026-08-24

## Context

Browser applications need predictable JSON operations, conditional or ranged
byte streams, and ordinary asynchronous status polling. Agents need semantic
discovery and bounded context through Model Context Protocol (MCP). Making MCP
the only interface would force application data transfer through a tool
protocol and make large private documents easy to place in model context by
accident. Making HTTP the only interface would leave each agent integration to
invent its own corpus semantics.

Both interfaces expose owner-private research material. They must share one
authorization boundary, resist cross-origin browser requests, avoid leaking
storage locators, and bound every result that can enter model context.

## Decision

Expose one protocol-neutral Research Corpus application service through two
adapters:

- a versioned HTTP/JSON data plane for artifact metadata, extraction lifecycle,
  bounded result pages, and protected conditional or ranged original bytes;
  and
- a stateless MCP endpoint for semantic artifact discovery, extraction status,
  explicit extraction requests, and bounded extracted-page reading.

Use Cloudflare's supported stateless MCP handler. Do not persist MCP session
state or use MCP transport state as application authority. Keep original binary
bytes out of MCP results; MCP returns a protected HTTP representation URL when
a client needs the original artifact. Tool responses must remain bounded and
must not expose R2 object keys, owner keys, Queue payloads, or credentials.

Authenticate both adapters before selecting an owner-scoped corpus. The first
hosted increment uses the existing Cloudflare Access identity contract and the
loopback-only local identity for development. Browser mutations accept only the
service origin or an exact configured origin allowlist. The MCP handler accepts
authenticated non-browser clients without an `Origin` header and validates any
present origin against that same allowlist. A public or multi-tenant OAuth
authorization server is outside this decision and requires a later ADR before
the service can be offered beyond the current private deployment.

Treat extraction as an asynchronous operation. Starting extraction returns the
current fingerprint-qualified job representation; clients poll status or read
the ready result. Neither HTTP nor MCP waits for PDF processing to finish.

## Trigger

The Research Corpus needs to support both product frontends such as Kirjolab
and agent clients without turning either transport into the domain model.

## Consequences

**Positive:**

- Frontends use conventional caching, ranges, status codes, and JSON contracts.
- Agents discover and read only bounded, semantic corpus projections.
- One application service enforces owner scope and extraction behavior for both
  transports.
- Stateless MCP instances can scale without coordinating transport sessions.

**Negative:**

- Two adapters and their conformance tests must be maintained.
- Generic hosted MCP clients cannot use the private service until an approved
  OAuth or equivalent delegated authorization design exists.
- Clients still need polling for asynchronous analysis.

**Neutral:**

- MCP resources and tools are projections, not new persistence entities.
- Original bytes remain available to authorized clients over HTTP, outside
  model context.

## Alternatives Considered

### MCP as the only API

MCP is useful for agents but is a poor primary data plane for browser caching,
ranged PDF reads, and ordinary frontend contracts.

### HTTP as the only API

HTTP remains the data plane, but omitting MCP would make each agent integration
recreate discovery, extraction, and bounded context semantics.

### Stateful MCP sessions

The corpus operations do not need server-side conversational state. Persisting
transport sessions would add coordination and lifecycle costs without becoming
valid domain authority.

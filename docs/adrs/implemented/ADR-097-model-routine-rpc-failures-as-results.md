# ADR-097: Model Routine RPC Failures as Results

**Status:** Implemented

**Date:** 2026-07-14

## Context

Browser tests intentionally exercise stale edits, guarded reference removal,
invalid claim evidence, and stale model candidates. `DocumentRoom` implemented
those routine negative outcomes by throwing. The Worker caught each remote
exception and returned the intended `4xx` response, so assertions passed, but
`workerd` still reported every Durable Object exception as uncaught.

Thrown Durable Object exceptions are operational failures, not neutral return
values. They add false error telemetry and can leave the calling stub in a
failed state. Separately, collaboration pages can close a WebSocket between an
`OPEN` state check and `send()`, producing routine network-loss exceptions
during broadcasts. The cross-origin-isolated authoring page also blocked the
initial PDF.js module-worker response because it lacked an explicit resource
policy. PDF.js recovered with its fake-worker fallback, but the canceled first
response appeared as another network-loss exception.

## Decision

Return typed, structured-clone-safe discriminated results from the modified
`DocumentRoom` RPC methods for anticipated client outcomes. Cover edit-link
revision and file conflicts, guarded reference unlinking, claim-update
validation, model-candidate validation, and project-review link identity
conflicts. Apply the same contract to `ReviewStudy` profile initialization
conflicts and `BackupRecovery` payload-availability failures. Map result codes
explicitly at the calling Worker or coordinator boundary. Continue throwing
unexpected programming, storage, and infrastructure failures.

Route every `DocumentRoom` WebSocket send through one helper. Skip sockets that
are already closed and suppress only a confirmed connection-loss race or the
platform's invalid-state close signal. Rethrow any other send exception.
Serve generated browser scripts with `Cross-Origin-Resource-Policy:
same-origin` and `Cross-Origin-Embedder-Policy: require-corp` so
`/pdf.worker.js` can load as a real module worker under the authoring page's
embedder policy.

Verify the result values through the real Workers RPC boundary and test that
the send helper distinguishes disconnects from unexpected failures.

## Trigger

The full quality gate passed while printing numerous `Uncaught Error` entries,
making expected browser conflicts indistinguishable from genuine server
failures.

## Consequences

**Positive:**

- Expected `4xx` paths no longer appear as uncaught Durable Object failures.
- Callers branch on stable codes instead of remote exception text.
- Routine browser teardown does not pollute WebSocket error telemetry.
- PDF.js no longer falls back after a blocked module-worker response.
- Unexpected RPC and WebSocket failures remain visible.

**Negative:**

- RPC callers must unwrap success values and handle every documented failure
  code.
- Existing public RPC methods that are not modified by this change may still
  require the same treatment when their routine failure paths are exercised.

**Neutral:**

- Browser-visible status codes and messages remain unchanged.
- No storage schema or deployment migration changes.

## Alternatives Considered

### Filter `workerd` stderr in the quality gate

This would make local output quieter while production telemetry and failed-stub
semantics remained incorrect.

### Catch every RPC exception in the Worker

The Worker already did this. A remote exception is logged at the Durable Object
boundary before the caller converts it to an HTTP response.

### Ignore every WebSocket send exception

This would hide serialization and runtime defects along with harmless close
races. The helper instead recognizes only disconnect conditions.

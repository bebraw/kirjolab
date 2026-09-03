---
name: web-perf
description: Measure and diagnose page-load or interaction performance with browser traces, Core Web Vitals, Lighthouse, and network evidence.
---

# Web Performance

Measure before recommending changes. Retrieve current metric definitions, thresholds, and tooling behavior from primary Chrome or web.dev documentation when exact values matter.

## Workflow

1. Confirm the target URL, representative route, and relevant device or network conditions.
2. Capture a reload trace for load performance. Exercise the affected interaction when responsiveness or INP is in scope.
3. Record observed metrics and inspect the trace insights, request chain, layout shifts, and main-thread work that explain them.
4. Inspect source only after evidence identifies a likely owner. For third-party sites, state the code-access limitation.
5. Verify each recommendation against requests, DOM, headers, or source. Do not recommend removing an asset, preload, or dependency without confirming its role.

If the configured browser tooling cannot capture the needed evidence, use an existing repository measurement path such as Lighthouse or report the limitation. Do not add an MCP server, browser dependency, or new persisted report target without approval.

## Priorities

- Rank issues by observed user impact and estimated savings, not generic best-practice severity.
- Ignore zero-impact diagnostics unless they explain a separate measured problem.
- Distinguish lab evidence from field data and Chromium evidence from cross-browser proof.
- Treat accessibility findings as separate unless they directly affect the requested performance investigation.

## Output

Report the measurement conditions, metric values with current ratings, top evidence-backed bottlenecks, and specific fixes in priority order. Include uncertainty and verification gaps. Say when performance is already healthy.

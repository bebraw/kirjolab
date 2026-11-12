# ADR-224: Override the Unused Puppeteer Browser Installer

**Status:** Implemented

**Date:** 2026-08-17

**Bridge retired:** 2026-11-12

**Amends:** [ADR-178](./ADR-178-queue-private-artifact-analysis.md)

## Context

ADR-178 selected Cloudflare Browser Run with `@cloudflare/puppeteer` for the
owner-private PDF analysis queue. The pinned `@cloudflare/puppeteer@1.2.0`
declares an exact dependency on `@puppeteer/browsers@2.2.4`, which depends on
`extract-zip@2.0.1`. `extract-zip` is affected by
[GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv), has
no patched release, and makes the production dependency audit fail.

That browser-installer path is not part of Kirjolab's runtime. The Worker uses
the Cloudflare Puppeteer entry only to connect to a managed Browser Run
binding. It does not import `@puppeteer/browsers`, install a local browser, or
pass uploaded archives to a browser installer. The production Worker bundle
does not contain `@puppeteer/browsers` or `extract-zip` code.

Replacing Puppeteer with `@cloudflare/playwright@1.3.5` would make `npm audit`
pass, but would not remove the vulnerable implementation: that release vendors
the same `extract-zip` symlink behavior inside its published JavaScript bundle.
Kirjolab would not call the vendored extractor, but the apparent remediation
would depend on npm being unable to inventory bundled source.

Puppeteer's browser-installer package removed `extract-zip` in its version 3
line. Kirjolab's Node.js 24 baseline satisfies that package's
Node.js 22.12 or newer requirement, and the repository's Lighthouse tooling
already resolves the same `@puppeteer/browsers@3.0.6` version.

## Decision

Retain the tested `@cloudflare/puppeteer@1.2.0` Browser Run adapter. Add a
version-qualified npm override that replaces only that package's unused
`@puppeteer/browsers@2.2.4` dependency with `@puppeteer/browsers@3.0.6`.

Treat the override as a narrow compatibility bridge, not as permission to use
the overridden browser-installer API. Kirjolab source must continue to import
only the Cloudflare Puppeteer runtime entry and must not install browsers at
runtime. Before changing either pinned package, verify the production
dependency graph, production audit, Worker bundle, and a real Browser Run
session. Remove the override when Cloudflare publishes a compatible Puppeteer
release without the vulnerable dependency.

Preserve ADR-178's trust boundary. Request interception must be active before
navigation, may fulfill only the exact synthetic analyzer document, generated
PDF.js worker, and fingerprint-qualified R2 PDF for the active job, and must
abort every other request. Keep bounded inputs and results, queue retry
semantics, and unconditional browser close in `finally`.

Review this bridge by 2026-11-17 even if no Cloudflare release has appeared.

**2026-10-02 amendment:** Refresh the Browser Run adapter to
`@cloudflare/puppeteer@1.4.0` and scope the existing installer override to that
version, using `@puppeteer/browsers@3.2.3`. Cloudflare 1.4.0 still pins the
vulnerable installer at 2.2.4, so the bridge and its runtime restrictions
remain necessary.

The refreshed production audit passes, the deployment dry-run metadata excludes
both `@puppeteer/browsers` and `extract-zip`, and a managed Browser Run smoke
session verifies launch, request interception, page evaluation, and close.

**2026-11-12 amendment:** Upgrade to `@cloudflare/puppeteer@2.0.0` and remove
the version-qualified installer override. This completes the bridge review
before its 2026-11-17 deadline. The
[Cloudflare release](https://github.com/cloudflare/browser-run/releases/tag/cloudflare-puppeteer-v2.0.0)
rebases the adapter on Puppeteer 25.10.0 and removes its `@puppeteer/browsers`
dependency. The published package has no browser-installer or `extract-zip`
runtime references, so an unsupported transitive replacement is no longer
necessary.

The existing adapter uses the supported `launch`, request-interception, page
evaluation, and `close` APIs without source changes. Cloudflare's
[Puppeteer guidance](https://developers.cloudflare.com/browser-run/puppeteer/)
requires current generated `BrowserRun` binding types and Node.js compatibility;
Wrangler 4.161.0 and the existing `nodejs_compat` flag satisfy those requirements.

A temporary local Worker using the real Browser Run binding verified the
production queue adapter against a synthetic two-page PDF. Both pages returned
the expected native text, the message was acknowledged without retry or OCR,
and the production interception helper fulfilled the exact PDF and worker URLs
while aborting an unrecognized URL. Explicit browser close disconnected the
client, and a bounded check confirmed removal from the active-session listing.
The check did not deploy a Worker or access existing documents or storage.

The production dependency audit reports zero vulnerabilities. Both Worker
deployment dry runs pass; the main Worker bundle is 5,487.38 KiB uncompressed
and 1,616.57 KiB gzipped. Full native CI also passes, including 188 Workers tests,
99 browser tests, and 92.91% line coverage.

## Consequences

**Positive:**

- The installed production dependency graph and deployed Worker bundle contain
  no `extract-zip` implementation.
- The blocking production audit passes without suppressing an advisory.
- The already-tested Browser Run adapter, binding, queue, storage, and result
  contracts remain unchanged.
- The route adapter retains an explicit default-deny network boundary.

**Negative:**

- Future adapter upgrades still require dependency-graph and bundle inspection
  to confirm that unused browser installers have not returned to the production
  dependency graph or Worker runtime.
- Local and E2E tests deliberately do not launch the managed browser, so a real
  Browser Run environment remains necessary to verify end-to-end compatibility.

## Alternatives Considered

### Migrate to Cloudflare Playwright 1.3.5

Rejected for this remediation because its published runtime bundle vendors the
vulnerable extractor implementation even though npm reports no dependency on
`extract-zip`. The extractor is unreachable in Kirjolab today, but moving the
same dormant code behind an opaque bundle would only improve the audit report.

### Force the audit's suggested Puppeteer downgrade

Rejected because `@cloudflare/puppeteer@0.0.11` predates the current Browser
Run protocol behavior and would trade a dependency report for runtime
regression risk.

### Suppress or reclassify the audit finding

Rejected because the repository intentionally blocks high-severity production
advisories and a safe browser-installer release can replace the unused
vulnerable package.

### Pin an unreleased `extract-zip` fork

Rejected because it would make the production dependency graph depend on an
unreviewed, unpublished patch while retaining an otherwise unused installer.

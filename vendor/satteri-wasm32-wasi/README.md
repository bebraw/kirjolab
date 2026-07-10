# Vendored Satteri browser binding

This directory contains the browser files from
`@bruits/satteri-wasm32-wasi@0.9.5`, published under the MIT license.

The upstream package declares `cpu: ["wasm32"]`. npm consequently omits it on
normal macOS and Linux installs even though browser bundlers need the package.
Kirjolab keeps the published files here, removes that installation gate through
the local `package.json`, and changes the helper-worker URL to
`/satteri-wasi-worker.mjs`. Cloudflare static assets do not serve the upstream
package-scoped `@bruits/...` URL reliably. The N-API async work pool is set to
zero because Kirjolab's parsing plugins are synchronous; this prevents idle
helper workers from outliving browser pages during preview navigation.

## Integrity

Source tarball:
`https://registry.npmjs.org/@bruits/satteri-wasm32-wasi/-/satteri-wasm32-wasi-0.9.5.tgz`

SHA-256:

- `satteri_napi.wasm32-wasi.wasm`: `4a5a18cf32329099ce8a44a0c634823ad2d1d505de4f3882ada6705d36b4c55a`
- `satteri_napi.wasi-browser.js`: `4f40f194858fcf502e64a6d4730494e331ff8b266a51fbb386fe84a6c9a56163` (patched)
- `wasi-worker-browser.mjs`: `557658fdba5f999cf4dfe980ec55db9bc87f8d69cfbaca1b368f04a3854a1ee1`

When updating Satteri, replace these files from the matching published tarball,
update the local version and hashes, and rerun the complete quality gate.

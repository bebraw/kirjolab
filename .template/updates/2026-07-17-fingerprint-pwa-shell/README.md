# Fingerprint Immutable PWA Shell Assets

Use this when a downstream project serves mutable browser code from a stable
URL with `Cache-Control: immutable`, or when its service worker keeps one manual
Cache Storage version across releases.

## Apply

1. Build immutable lazy runtimes before the application and name each emitted
   file with a bounded SHA-256 content fingerprint.
2. Compile the emitted runtime URLs into the application rather than retaining
   source-controlled version constants.
3. Derive the offline cache generation from the built application, stylesheet,
   and precached runtimes; compile the generation into both application and
   service-worker bundles.
4. Make service-worker activation delete older caches owned by the application.
5. Explicitly check an existing registration for updates on startup. Reload an
   already-controlled page only after persisting recoverable local work.
6. Accept only fingerprint-shaped immutable asset routes at the server edge.
7. Expose the shell fingerprint as a copyable application version in a user
   diagnostics or preferences surface.

The included patch covers the common source contract. Build graphs differ
enough that projects should port `scripts/build-browser-shell.mjs` deliberately
instead of assuming exact entrypoint and output names.

## Verify

- Run two identical builds and confirm their runtime URLs and cache generation
  are identical.
- Change application and runtime content independently and confirm each change
  produces a new service-worker script and cache generation.
- Upgrade an installed PWA and confirm the new controller reloads once while
  old application-owned caches are removed.
- Run `npm run quality:gate` and `npm run ci:local`.

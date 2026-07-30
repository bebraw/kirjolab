# Domain source

Domain modules are grouped by product capability when several contracts and
operations evolve together. Tests stay beside their implementation.

The root is reserved for dependency-light cross-capability modules and explicit
compatibility facades. `reference-library.ts` is one such temporary facade;
new consumers should continue to use its narrow capability modules as required
by the architecture rules.

Domain capability modules may depend on narrower domain contracts, but they
must not import client components, API handlers, Durable Objects, or runtime
platform authorities. Prefer descriptive module names and direct imports over
generic `types`, `models`, `services`, `utils`, or barrel modules.

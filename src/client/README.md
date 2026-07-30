# Client source

The client root contains browser entrypoints and source assets only. Product
implementation lives in shallow capability directories, with tests beside the
modules they cover.

- `app/` contains application composition support and the typed element
  registry.
- Product directories such as `assistant/`, `library/`, `pdf/`, `project/`,
  `review/`, and `workspace/` own their browser behavior and presentation.
- `integrations/` contains provider-specific browser surfaces.
- `platform/` contains browser-wide technical primitives such as HTTP, offline
  storage, theming, and the shared light-DOM host. It must not become a home for
  product behavior.

Prefer direct imports from the owning module. Do not add barrel files or split
features into generic component, controller, service, or utility trees.

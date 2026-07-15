import { renderButton } from "../ui/markup";

export function renderUiInventoryPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>Kirjolab · UI inventory</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body class="min-h-screen bg-app-canvas p-5 text-app-text antialiased sm:p-8">
    <main class="mx-auto grid max-w-5xl gap-8" data-ui-inventory>
      <header class="max-w-2xl">
        <p class="eyebrow">Development inventory</p>
        <h1 class="mt-2 text-4xl font-semibold tracking-[-0.045em] text-app-ink">Kirjolab interface language</h1>
        <p class="ui-supporting-text mt-3">Foundations and primitive states. Domain components stay in their product surfaces.</p>
      </header>

      <section class="ui-stack" aria-labelledby="ui-colors-heading">
        <h2 class="ui-heading" id="ui-colors-heading">Semantic color</h2>
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          ${swatch("Canvas", "bg-app-canvas")}${swatch("Paper", "bg-app-paper")}${swatch("Surface", "bg-app-surface")}${swatch("Accent", "bg-app-accent")}
        </div>
      </section>

      <section class="ui-panel ui-stack p-4 sm:p-5" aria-labelledby="ui-controls-heading">
        <div><p class="eyebrow">Primitives</p><h2 class="ui-heading mt-1" id="ui-controls-heading">Controls and state</h2></div>
        <div class="ui-cluster" aria-label="Button states">
          ${renderButton({ label: "Primary action", tone: "primary" })}
          ${renderButton({ label: "Secondary action" })}
          ${renderButton({ label: "Compact", compact: true })}
          ${renderButton({ label: "Selected", className: "bg-app-accent-ghost", ariaLabel: "Selected example", pressed: true })}
          ${renderButton({ label: "Remove", destructive: true })}
          ${renderButton({ label: "Unavailable", disabled: true })}
          ${renderButton({ label: "Working", busy: true })}
          ${renderButton({ icon: "close", ariaLabel: "Close example", title: "Close", tone: "icon", touchTarget: true })}
        </div>
        <label class="field-label" for="ui-field">Field label<input class="field" id="ui-field" value="Inspectable value"></label>
        <div class="ui-cluster"><span class="count-badge">12</span><span class="ui-status">Ready</span><span class="ui-status" data-tone="success">Saved</span><span class="ui-status" data-tone="warning">Needs review</span><span class="ui-status" data-tone="error">Could not save</span></div>
        <div class="empty-state">Empty states explain what belongs here and name the next useful action.</div>
      </section>

      <section class="ui-stack" aria-labelledby="ui-dialog-heading">
        <h2 class="ui-heading" id="ui-dialog-heading">Dialog composition</h2>
        <div class="ui-dialog relative block" role="group" aria-label="Static dialog example">
          <header class="ui-dialog-header"><p class="eyebrow">Review</p><h3 class="ui-heading mt-1">Confirm a deliberate change</h3></header>
          <div class="ui-dialog-body"><p class="ui-supporting-text">Dialogs separate context, content, and decisions while preserving the same control states.</p></div>
          <footer class="ui-dialog-actions">${renderButton({ label: "Cancel" })}${renderButton({ label: "Confirm", tone: "primary" })}</footer>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function swatch(label: string, colorClass: string): string {
  return `<div class="ui-panel overflow-hidden"><div class="h-20 ${colorClass}"></div><p class="border-t border-app-line p-3 font-sans text-xs font-bold">${label}</p></div>`;
}

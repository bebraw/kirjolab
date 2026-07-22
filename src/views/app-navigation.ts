import { escapeHtml } from "../html";

export type AppArea = "dashboard" | "library" | "editor" | "review";

export function renderPrimaryNavigation(active: AppArea, editorHref = "/editor"): string {
  const destinations = [
    { area: "dashboard", href: "/", label: "Dashboard" },
    { area: "library", href: "/library", label: "Library" },
    { area: "editor", href: editorHref, label: "Editor" },
    { area: "review", href: "/review", label: "Reviews" },
  ] as const;

  return `<nav class="primary-navigation" aria-label="Primary navigation">
    ${destinations
      .map(
        (destination) =>
          `<a class="primary-navigation-link" href="${escapeHtml(destination.href)}"${destination.area === active ? ' aria-current="page"' : ""}>${destination.label}</a>`,
      )
      .join("")}
  </nav>`;
}

export function renderProductHeader(
  active: AppArea,
  identityEmail: string,
  identityMode: "local" | "access",
  editorHref = "/editor",
): string {
  const email = escapeHtml(identityEmail);
  return `<header class="product-header">
    <div class="product-header-inner">
      <a class="app-brand font-sans text-sm font-black tracking-[-0.04em] text-app-ink" href="/">KIRJOLAB</a>
      ${renderPrimaryNavigation(active, editorHref)}
      <details class="product-account ui-menu">
        <summary class="product-account-trigger" aria-label="Account for ${email}">${initials(identityEmail)}</summary>
        <div class="product-account-panel ui-menu-panel">
          <strong title="${email}">${email}</strong>
          <span>${identityMode === "access" ? "Cloudflare Access" : "Local development"}</span>
          ${identityMode === "access" ? '<a href="/cdn-cgi/access/logout">Log out</a>' : ""}
        </div>
      </details>
    </div>
  </header>`;
}

function initials(email: string): string {
  // Stryker disable next-line StringLiteral: split always returns at least one string; the fallback only satisfies indexed-access typing.
  const localPart = email.split("@", 1)[0] ?? "K";
  const parts = localPart.split(/[._-]/u).filter(Boolean);
  const value = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return escapeHtml(value || "K");
}

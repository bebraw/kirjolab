import { describe, expect, it } from "vitest";
import { renderPrimaryNavigation, renderProductHeader } from "./app-navigation";

describe("application navigation", () => {
  it("renders one active destination and escapes a contextual editor link", () => {
    const html = renderPrimaryNavigation("review", '/editor/project?next=<script>&mode="focus"');

    expect(html).toContain('<a class="primary-navigation-link" href="/">Dashboard</a>');
    expect(html).toContain('<a class="primary-navigation-link" href="/library">Library</a>');
    expect(html).toContain(
      '<a class="primary-navigation-link" href="/editor/project?next=&lt;script&gt;&amp;mode=&quot;focus&quot;">Editor</a>',
    );
    expect(html).toContain('<a class="primary-navigation-link" href="/review" aria-current="page">Reviews</a>');
    expect(html.match(/aria-current="page"/gu)).toHaveLength(1);
  });

  it("uses the default editor destination", () => {
    expect(renderPrimaryNavigation("editor")).toContain('<a class="primary-navigation-link" href="/editor" aria-current="page">Editor</a>');
  });

  it("renders escaped Access identity details and bounded uppercase initials", () => {
    const html = renderProductHeader("library", "__ada--lovelace.extra@example.test<script>", "access");

    expect(html).toContain('aria-label="Account for __ada--lovelace.extra@example.test&lt;script&gt;"');
    expect(html).toContain('title="__ada--lovelace.extra@example.test&lt;script&gt;"');
    expect(html).toContain(">AL</summary>");
    expect(html).toContain("<span>Cloudflare Access</span>");
    expect(html).toContain('<a href="/cdn-cgi/access/logout">Log out</a>');
    expect(html).toContain('<a class="primary-navigation-link" href="/editor">Editor</a>');
  });

  it("renders local identity mode without a logout action and falls back to a product initial", () => {
    const html = renderProductHeader("dashboard", "", "local");

    expect(html).toContain(">K</summary>");
    expect(html).toContain("<span>Local development</span>");
    expect(html).not.toContain("Cloudflare Access");
    expect(html).not.toContain("/cdn-cgi/access/logout");
    expect(
      html
        .replace(/<[^>]+>/gu, " ")
        .replace(/\s+/gu, " ")
        .trim(),
    ).toBe("KIRJOLAB Dashboard Library Editor Reviews K Local development");
  });
});

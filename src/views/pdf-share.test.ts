import { describe, expect, it } from "vitest";
import { renderPdfSharePage } from "./pdf-share";

describe("public annotated PDF page", () => {
  it("offers reading and downloading the same snapshot without an account", () => {
    const page = renderPdfSharePage({ name: "paper-annotated.pdf", createdAt: "2026-11-13T10:00:00.000Z" }, "/share/pdf/token");
    expect(page).toContain("<title>paper-annotated.pdf · Kirjolab</title>");
    expect(page).toMatch(/<h1[^>]*>paper-annotated\.pdf<\/h1>/u);
    expect(page).toContain('<time datetime="2026-11-13T10:00:00.000Z">2026-11-13</time>');
    expect(page).toMatch(/<iframe[^>]*src="\/share\/pdf\/token\/document\.pdf"[^>]*title="Shared annotated PDF"/u);
    expect(page).toContain('href="/share/pdf/token/document.pdf" target="_blank" rel="noopener noreferrer">Open PDF</a>');
    expect(page).toContain('href="/share/pdf/token/document.pdf?download=1">Download PDF</a>');
    expect(page).toContain('name="robots" content="noindex, nofollow"');
    expect(page).not.toContain("/api/library");
  });

  it("escapes user-controlled filenames and URLs", () => {
    const page = renderPdfSharePage(
      { name: '<img src=x onerror="alert(1)">.pdf', createdAt: "2026-11-13T10:00:00.000Z" },
      '/share/pdf/a"b',
    );
    expect(page).not.toContain("<img src=x");
    expect(page).toContain("&lt;img");
    expect(page).toContain("/share/pdf/a&quot;b/document.pdf");
  });

  it("renders the filename as text in both the browser title and heading", () => {
    const page = renderPdfSharePage({ name: 'Paper & "notes" <revised>.pdf', createdAt: "2026-11-13T10:00:00.000Z" }, "/share/pdf/token");
    expect(page).toContain("<title>Paper &amp; &quot;notes&quot; &lt;revised&gt;.pdf · Kirjolab</title>");
    expect(page).toMatch(/<h1[^>]*>Paper &amp; &quot;notes&quot; &lt;revised&gt;\.pdf<\/h1>/u);
    expect(page).not.toContain("<revised>");
  });

  it("escapes the timestamp in its attribute and visible date", () => {
    const page = renderPdfSharePage({ name: "paper.pdf", createdAt: '<"&>1234567" onmouseover="bad"' }, "/share/pdf/token");
    expect(page).toContain(
      '<time datetime="&lt;&quot;&amp;&gt;1234567&quot; onmouseover=&quot;bad&quot;">&lt;&quot;&amp;&gt;123456</time>',
    );
    expect(page).not.toContain('" onmouseover="bad"');
  });
});

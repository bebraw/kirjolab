import { expect, test, type Locator, type Page } from "@playwright/test";
import { isKnowledgeSearchResults, isWorkspaceKnowledgeGraph } from "./domain/knowledge";
import { isWorkspaceSnapshot, isWorkspaceSummaries } from "./domain/workspace";
import { createEvidencePdf, createTwoPageEvidencePdf } from "./test-support/pdf-fixture";

test("renames, archives, duplicates, and permanently deletes projects", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Lifecycle source");
  const api = `/api/workspaces/${workspaceId}`;
  const headers = { origin: "http://127.0.0.1:8788" };
  let response = await page.request.patch(`${api}/settings`, { headers, data: { title: "Renamed lifecycle", archived: true } });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ id: workspaceId, title: "Renamed lifecycle", archivedAt: expect.any(String) });
  response = await page.request.patch(`${api}/settings`, {
    headers,
    data: { publicationProfile: { citationStyle: "ieee", locale: "fi-FI", submissionTemplate: "anonymous-review", paperSize: "letter" } },
  });
  expect(response.ok()).toBe(true);
  expect(await (await page.request.get(api)).json()).toMatchObject({
    publicationProfile: { citationStyle: "ieee", locale: "fi-FI", submissionTemplate: "anonymous-review", paperSize: "letter" },
  });
  response = await page.request.post(`${api}/duplicate`, { headers, data: { title: "Lifecycle copy" } });
  expect(response.status()).toBe(201);
  const duplicate = (await response.json()) as { id: string; title: string };
  expect(duplicate).toMatchObject({ title: "Lifecycle copy" });
  expect(await (await page.request.get(`/api/workspaces/${duplicate.id}`)).json()).toMatchObject({
    publicationProfile: { citationStyle: "ieee", locale: "fi-FI", submissionTemplate: "anonymous-review", paperSize: "letter" },
  });
  expect((await page.request.delete(`${api}/settings`, { headers })).status()).toBe(204);
  expect((await page.request.get(api)).status()).toBe(404);
  expect((await page.request.get(`/api/workspaces/${duplicate.id}`)).ok()).toBe(true);
});

test("switches and remembers focused workspace views", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Focus modes");
  await page.goto(`/workspaces/${workspaceId}`);
  const layout = page.locator("#workspace-layout");
  await layout.selectOption("editor");
  await expect(page.locator("#authoring-surface")).toBeVisible();
  await expect(page.locator("#context-surface")).toBeHidden();
  await layout.selectOption("context");
  await expect(page.locator("#authoring-surface")).toBeHidden();
  await expect(page.locator("#context-surface")).toBeVisible();
  await page.reload();
  await expect(layout).toHaveValue("context");
  await layout.selectOption("pdf");
  await expect(page.locator("#context-surface")).toBeVisible();
  await expect(page.locator("#toast")).toContainText("Add or open a PDF");
  await layout.selectOption("split");
  await expect(page.locator("#authoring-surface")).toBeVisible();
  await expect(page.locator("#context-surface")).toBeVisible();
});

test("keeps the workspace within a compact desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  const workspaceId = await createWorkspace(page, "Compact desktop");
  await page.goto(`/workspaces/${workspaceId}`);

  await expect(page.locator("#show-authoring-surface")).toBeVisible();
  await expect(page.locator("#show-context-surface")).toBeVisible();
  expect(
    await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toMatchObject({ clientWidth: 1100, scrollWidth: 1100 });
});

test("highlights Markdown without replacing the native editor", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Highlighted source");
  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  const source = [
    "## Findings {#findings}",
    "",
    "Use :cite[smith2024], **careful emphasis**, and [context](https://example.test).",
    '<img src=x onerror="document.body.dataset.injected=true">',
    ...Array.from({ length: 80 }, (_, index) => `- Supporting line ${index + 1}`),
  ].join("\n");
  const editor = page.locator("#source-editor");
  const highlight = page.locator("#source-editor-highlight");
  await editor.fill(source);

  await expect(highlight).toHaveText(source);
  await expect(highlight.locator(".markdown-token-heading")).toContainText("Findings");
  await expect(highlight.locator(".markdown-token-directive")).toContainText(":cite[smith2024]");
  await expect(highlight.locator(".markdown-token-link")).toContainText("[context](https://example.test)");
  await expect(highlight.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.dataset.injected)).toBeUndefined();
  expect(
    await page.locator(".source-editor-shell").evaluate((shell) => {
      const textarea = shell.querySelector<HTMLTextAreaElement>("#source-editor")!;
      const mirror = shell.querySelector<HTMLElement>("#source-editor-highlight")!;
      const inputStyle = getComputedStyle(textarea);
      const mirrorStyle = getComputedStyle(mirror);
      return {
        sameWidth: textarea.clientWidth === mirror.clientWidth,
        font: inputStyle.font === mirrorStyle.font,
        padding: inputStyle.padding === mirrorStyle.padding,
        whiteSpace: mirrorStyle.whiteSpace,
      };
    }),
  ).toEqual({ sameWidth: true, font: true, padding: true, whiteSpace: "pre-wrap" });
  const scroll = await editor.evaluate((element: HTMLTextAreaElement) => {
    element.scrollTop = 240;
    element.dispatchEvent(new Event("scroll"));
    return element.scrollTop;
  });
  await expect.poll(async () => await highlight.evaluate((element) => element.scrollTop)).toBe(scroll);
});

test("offers opt-in Vim editing over the collaborative textarea", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Vim source editing");
  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  const editor = page.locator("#source-editor");
  const toggle = page.locator("#vim-toggle");
  const mode = page.locator("#vim-mode-status");
  await editor.fill("one two\nthree");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(mode).toHaveText("NORMAL");
  await expect(editor).toBeFocused();

  await editor.press("g");
  await editor.press("g");
  await editor.press("w");
  expect(await editor.evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBe(4);
  await editor.press("i");
  await expect(mode).toHaveText("INSERT");
  await editor.pressSequentially("new ");
  await editor.press("Escape");
  await expect(mode).toHaveText("NORMAL");
  await expect(editor).toHaveValue("one new two\nthree");

  await editor.press("0");
  await editor.press("d");
  await editor.press("d");
  await expect(editor).toHaveValue("three");
  await editor.press("q");
  await expect(editor).toHaveValue("three");
  await expect(page.locator("#source-editor-highlight")).toHaveText("three");
  await expect(page.locator("#save-status")).toHaveText("Saved");

  await page.reload();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(mode).toHaveText("NORMAL");
  await toggle.click();
  await expect(mode).toBeHidden();
  await editor.press("End");
  await editor.press("q");
  await expect(editor).toHaveValue("threeq");
});

test("opens a live WYSIWYM scholarly workspace", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Live WYSIWYM workspace");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/workspaces/${workspaceId}`);

  await expect(page.getByRole("link", { name: "KIRJOLAB" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Sources & evidence" })).toBeVisible();
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();
  const railModes = page.locator(".rail-mode-switcher");
  await expect(railModes.locator(".rail-mode-icon")).toHaveCount(3);
  await expect(page.getByRole("tab", { name: "Files" })).toHaveAttribute("title", "Files");
  await expect(page.getByRole("tab", { name: "Research" })).toHaveAttribute("title", "Research");
  await expect(page.getByRole("tab", { name: "Comments" })).toHaveAttribute("title", "Comments");
  expect(await railModes.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.locator("#save-status")).toHaveText("Saved");
  const assistantTab = page.getByRole("tab", { name: "Writing assistant" });
  await expect(assistantTab).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= document.documentElement.clientHeight)).toBe(true);
  const previewTab = page.getByRole("tab", { name: "Preview" });
  const libraryTab = page.getByRole("tab", { name: "Library" });
  await previewTab.focus();
  await previewTab.press("ArrowRight");
  await expect(libraryTab).toBeFocused();
  await libraryTab.press("Enter");
  await expect(page.locator("#context-library-panel")).toBeVisible();
  await libraryTab.press("ArrowRight");
  await expect(assistantTab).toBeFocused();
  await assistantTab.press("Enter");
  await expect(page.locator("#context-assistant-panel")).toBeVisible();
  await previewTab.click();
  await expect(page.locator("#open-source-citation")).toBeHidden();
  await expect(page.locator("#pin-active-context")).toBeHidden();
  await expect(page.locator("#close-active-context")).toBeHidden();
  await expect(page.getByRole("button", { name: "Project settings" })).toBeHidden();
  await page.locator(".header-action-menu summary").click();
  await expect(page.getByRole("button", { name: "Project settings" })).toBeVisible();
  await page.getByRole("button", { name: "Project settings" }).click();
  await expect(page.locator("#workspace-settings-dialog")).toBeVisible();
  await page.locator("#close-workspace-settings").click();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.locator("#source-editor")).toHaveValue(/## Evidence becomes prose/);

  await page.getByRole("tab", { name: "Files" }).click();
  await expect(page.locator("#project-file-list")).toContainText("main.md");
  await expect(page.getByRole("button", { name: "Add file" }).first()).toBeVisible();
  const insertMenu = page.locator("#editor-insert-menu");
  const insertSummary = insertMenu.locator("summary");
  await insertSummary.focus();
  await insertSummary.press("Enter");
  await expect(insertMenu).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(insertMenu).not.toHaveAttribute("open", "");
  await expect(insertSummary).toBeFocused();
  await insertSummary.click();
  await insertMenu.getByRole("button", { name: /Citation/ }).click();
  await expect(page.locator("#source-editor")).toHaveValue(/:cite\[key\]/);
  await page.getByRole("tab", { name: "Research" }).click();
  const paneResizer = page.getByRole("separator", { name: "Resize authoring and context panes" });
  await paneResizer.focus();
  await paneResizer.press("ArrowRight");
  await expect
    .poll(
      async () => await page.locator("#workspace-surfaces").evaluate((element) => element.style.getPropertyValue("--authoring-pane-width")),
    )
    .toMatch(/px$/u);
  const resizedPaneWidth = await page
    .locator("#workspace-surfaces")
    .evaluate((element) => element.style.getPropertyValue("--authoring-pane-width"));
  await libraryTab.click();
  await expect
    .poll(
      async () => await page.locator("#workspace-surfaces").evaluate((element) => element.style.getPropertyValue("--authoring-pane-width")),
    )
    .toBe(resizedPaneWidth);
  await assistantTab.click();
  await expect
    .poll(
      async () => await page.locator("#workspace-surfaces").evaluate((element) => element.style.getPropertyValue("--authoring-pane-width")),
    )
    .toBe(resizedPaneWidth);
  await previewTab.click();
  await paneResizer.press("Home");
  await expect
    .poll(
      async () => await page.locator("#workspace-surfaces").evaluate((element) => element.style.getPropertyValue("--authoring-pane-width")),
    )
    .toBe("");

  await page
    .locator("#source-editor")
    .fill(
      "## Evidence becomes prose {#sec-evidence}\n\nA live collaborative note cites prior work :cite[merton1942].[^live]\n\n| State | Result |\n| --- | --- |\n| Shared | **Visible** |\n\n[^live]: Rendered by Satteri.\n",
    );
  await expect(page.locator("#preview")).toContainText("Merton, 1942");
  await expect(page.locator("#diagnostic-summary")).toHaveText("No syntax errors");
  await expect(page.locator("#preview")).toContainText("A live collaborative note cites prior work");
  await expect(page.locator("#preview table")).toContainText("Visible");
  await expect(page.locator("#preview .footnotes")).toContainText("Rendered by Satteri");
  await expect(page.locator("#preview .section-number").first()).toBeVisible();
  await expect(page.locator("#revision-badge")).not.toHaveText("r0");

  await page.locator("#source-editor").evaluate((element: HTMLTextAreaElement) => {
    const citation = element.value.indexOf(":cite[merton1942]");
    element.focus();
    element.setSelectionRange(citation + 7, citation + 7);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await expect(page.locator("#open-source-citation")).toBeVisible();

  const exported = await page.request.get(`${api}/export/document.md`);
  expect(exported.ok()).toBe(true);
  expect(exported.headers()["content-disposition"]).toContain("kirjolab-document.md");
  expect(await exported.text()).toContain("A live collaborative note cites prior work");

  await expect(page.locator("#word-count-badge")).toContainText("words");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.locator("#export-dialog")).toBeVisible();
  await expect(page.locator("#export-statistics")).toContainText("Composed prose from main.md");
  await expect(page.getByRole("link", { name: /PDF Formatted document/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /LaTeX project/ })).toBeVisible();

  const statistics = await page.request.get(`${api}/export/statistics.json`);
  expect(statistics.ok()).toBe(true);
  expect(await statistics.json()).toMatchObject({ countingRule: "kirjolab-prose-v1", totalWords: expect.any(Number) });
  const latex = await page.request.get(`${api}/export/latex.zip`);
  expect(latex.ok()).toBe(true);
  expect(latex.headers()["content-type"]).toContain("application/zip");
  expect((await latex.body()).subarray(0, 2).toString()).toBe("PK");
  const pdf = await page.request.get(`${api}/export/document.pdf`);
  expect(pdf.ok()).toBe(true);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const sourceBundle = await page.request.get(`${api}/export/source.zip`);
  expect(sourceBundle.ok()).toBe(true);
  expect((await sourceBundle.body()).subarray(0, 2).toString()).toBe("PK");
});

test("maps broken export composition back to authored source without losing recovery output", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Broken export diagnostics");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  await page.locator("#source-editor").fill("# Broken\n::include[missing.md]\n");
  await expect(page.locator("#diagnostic-summary")).toContainText("issues");
  await expect.poll(async () => (await page.request.get(`${api}/export/document.md`)).status()).toBe(422);

  const failed = await page.request.get(`${api}/export/document.md`);
  expect(await failed.json()).toMatchObject({
    error: "Project composition must be fixed before export",
    diagnostics: [{ code: "missing-file", path: "main.md", line: 2, includeChain: [expect.any(String)] }],
  });
  const diagnostics = await page.request.get(`${api}/export/diagnostics.json`);
  expect(diagnostics.ok()).toBe(true);
  expect(await diagnostics.json()).toMatchObject([{ code: "missing-file", line: 2 }]);
  const sourceBundle = await page.request.get(`${api}/export/source.zip`);
  expect(sourceBundle.ok()).toBe(true);
  expect((await sourceBundle.body()).subarray(0, 2).toString()).toBe("PK");
  await expect(page.locator("#preview")).toContainText("Broken");
});

test("keeps private library research separate from project citations", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Private library boundary");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();

  await page.getByRole("tab", { name: "Library" }).click();
  await expect(page.locator("#context-library-panel")).toBeVisible();
  await expect(page.locator("#reference-library-dialog")).toHaveCount(0);
  await page.locator("#library-bibliography-upload").setInputFiles({
    name: "private-library.bib",
    mimeType: "application/x-bibtex",
    buffer: Buffer.from(`@manual{privateGuide,
      title = {Private Research Guide},
      author = {Writer, Ada},
      year = {2026}
    }`),
  });
  const card = page.locator("#reference-library-list .resource-card").filter({ hasText: "Private Research Guide" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("writer2026");
  await expect(page.locator("#publication-list")).not.toContainText("Private Research Guide");

  await card.getByRole("button", { name: "Add to project" }).click();
  await expect(page.locator("#publication-list")).toContainText("Private Research Guide");
  await page.locator("#library-pdf-upload").setInputFiles({
    name: "climate_adaptation.pdf",
    mimeType: "application/pdf",
    buffer: createEvidencePdf(),
  });
  const pdfCard = page.locator("#reference-library-list .resource-card").filter({ hasText: "climate adaptation" });
  await expect(pdfCard).toContainText("sourceundatedclimate");
  await expect(page.locator("#unidentified-pdf-section")).toBeHidden();

  await card.getByText("Metadata and research").click();
  const tags = card.getByLabel("Private tags for Private Research Guide");
  await tags.fill("methods, revisit");
  await card.getByRole("button", { name: "Save tags" }).click();
  await expect(page.locator("#toast")).toHaveText("Private tags saved.");
  await expect(card.getByLabel("Private tags for Private Research Guide")).toHaveValue("methods, revisit");
  await page.getByText("Filters and library tools").click();
  await page.locator("#reference-filter-organization").fill("methods");
  await expect(page.locator("#reference-filter-count")).toHaveText(/1 of \d+ references/u);
  await page.locator("#reference-filter-linkage").selectOption("linked");
  await expect(card).toBeVisible();
  await page.locator("#reference-filter-query").fill("no matching reference");
  await expect(page.locator("#reference-library-list")).toContainText("No references match these filters.");
  await page.locator("#reference-filter-query").fill("");
  await page.locator("#reference-filter-organization").fill("");
  await card.getByText("Metadata and research").click();
  await card.getByPlaceholder("Add a private note").fill("Only share this interpretation deliberately.");
  await card.getByRole("button", { name: "Save private note" }).click();
  await expect(page.locator("#toast")).toHaveText("Private note saved. It is not visible to project collaborators.");
  await expect(card).toContainText("Only share this interpretation deliberately.");
  await card.getByText("Metadata and research").click();
  await card
    .locator(".rounded-sm")
    .filter({ hasText: "Only share this interpretation deliberately." })
    .first()
    .getByRole("button", { name: "Share snapshot with project" })
    .click();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).researchShares.length).toBe(1);

  const uncitedExport = await page.request.get(`${api}/export/bibliography.bib`);
  expect(await uncitedExport.text()).not.toContain("writer2026");
  await page.locator("#context-library-scroll").evaluate((element) => {
    element.scrollTop = 160;
  });
  await page.getByRole("tab", { name: "Preview" }).click();
  await page.getByRole("tab", { name: "Library" }).click();
  await expect.poll(async () => await page.locator("#context-library-scroll").evaluate((element) => element.scrollTop)).toBe(160);
  await page.locator("#source-editor").fill("# Study\n\nThis uses the guide :cite[writer2026].\n");
  await expect.poll(async () => await (await page.request.get(`${api}/export/bibliography.bib`)).text()).toContain("writer2026");
});

test("round-trips CSL JSON and portable library metadata", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Library interchange");
  await page.goto(`/workspaces/${workspaceId}`);
  await page.getByRole("tab", { name: "Library" }).click();
  await page.locator("#library-csl-upload").setInputFiles({
    name: "zotero-export.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([
        {
          id: "zoteroGuide",
          type: "article-journal",
          title: "Zotero Guide",
          author: [{ family: "Writer", given: "Ada" }],
          issued: { "date-parts": [[2026]] },
        },
      ]),
    ),
  });
  await expect(page.locator("#reference-library-list")).toContainText("Zotero Guide");
  const csl = await page.request.get("/api/library/export/csl.json");
  expect(csl.ok()).toBe(true);
  expect(await csl.json()).toContainEqual(expect.objectContaining({ title: "Zotero Guide" }));
  const archive = await page.request.get("/api/library/export/library.zip");
  expect(archive.ok()).toBe(true);
  expect((await archive.body()).subarray(0, 2).toString()).toBe("PK");
});

test("records and reviews source citation assertions in an accessible shared network", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Citation assertion network");
  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();

  await page.getByRole("tab", { name: "Library" }).click();
  await page.locator("#library-bibliography-upload").setInputFiles({
    name: "citation-network.bib",
    mimeType: "application/x-bibtex",
    buffer: Buffer.from(`@article{networkAlpha,
      title = {Network Alpha Study},
      author = {Alpha, Ada},
      year = {2024},
      doi = {10.1000/network-alpha}
    }
    @article{networkBeta,
      title = {Network Beta Study},
      author = {Beta, Bea},
      year = {2025},
      doi = {10.1000/network-beta}
    }`),
  });
  const alpha = page.locator("#reference-library-list .resource-card").filter({ hasText: "Network Alpha Study" });
  await expect(alpha).toBeVisible();
  await alpha.getByRole("button", { name: "Add to project" }).click();

  await page.getByText("Filters and library tools").click();
  await page.locator("#open-citation-network").click();
  await expect(page.locator("#citation-network")).toBeVisible();
  await page.locator("#citation-assertion-citing").selectOption({ label: "Network Alpha Study" });
  await page.locator("#citation-assertion-cited").selectOption({ label: "Network Beta Study" });
  await page.locator("#citation-assertion-form").getByRole("button", { name: "Record assertion" }).click();

  const list = page.locator("#citation-network-list");
  await expect(list).toContainText("Network Alpha Study → Network Beta Study");
  await expect(list).toContainText("cites · confirmed · manual");
  await expect(list).toContainText("Kirjolab researcher assertion");
  await expect(page.locator("#citation-network-graph line")).toHaveCount(1);
  await expect(page.locator("#citation-network-graph circle")).toHaveCount(2);

  page.once("dialog", (dialog) => dialog.accept("Checked the source reference list"));
  await list.getByRole("button", { name: "Confirm" }).click();
  await expect(list).toContainText("confirmed by");
  await page.locator("#filter-project-citations").click();
  await expect(page.locator("#filter-project-citations")).toHaveAttribute("aria-pressed", "true");
  await expect(list).toContainText("Network Alpha Study → Network Beta Study");
  await expect(list).toContainText("Current project");
});

test("keeps resource-keyed research context beside authoring", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Research context boundary");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();

  await page.locator("#preview .semantic-citation[data-citation='merton1942']").evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.locator("#insert-context-citation")).toBeDisabled();
  await expect(page.locator("#insert-context-citation")).toHaveAttribute("title", "Place the manuscript caret before inserting a citation");
  await page.getByRole("tab", { name: "Preview" }).click();

  const editor = page.locator("#source-editor");
  const body = Array.from(
    { length: 36 },
    (_, index) => `Paragraph ${index + 1} keeps enough manuscript context visible while a source is inspected.`,
  ).join("\n\n");
  const source = `## Context pane {#context-pane}\n\nThe manuscript cites prior work :cite[merton1942].\n\n${body}`;
  await editor.fill(source);
  await expect(page.locator("#preview .semantic-citation[data-citation='merton1942']")).toBeVisible();

  await page.locator("#pdf-upload").setInputFiles({
    name: "context-paper.pdf",
    mimeType: "application/pdf",
    buffer: createTwoPageEvidencePdf(),
  });
  await expect(page.locator("#pdf-list")).toContainText("context-paper.pdf");
  await page.locator("#pdf-upload").setInputFiles({
    name: "current-paper.pdf",
    mimeType: "application/pdf",
    buffer: createEvidencePdf(),
  });
  await expect(page.locator("#pdf-list")).toContainText("current-paper.pdf");

  const imported = await readWorkspaceSnapshot(page, api);
  const delayedPdf = imported.pdfs.find((pdf) => pdf.name === "context-paper.pdf");
  if (!delayedPdf) throw new Error("Expected the delayed PDF resource");
  await page.route(`**${api}/pdfs/${delayedPdf.id}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue().catch(() => undefined);
  });
  await page.locator("#pdf-list button[data-pdf-id]").filter({ hasText: "context-paper.pdf" }).click();
  await page.locator("#pdf-list button[data-pdf-id]").filter({ hasText: "current-paper.pdf" }).click();
  await expect(page.getByRole("tab", { name: "current-paper.pdf", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#paper-text-layer")).toContainText("Knowledge grows through inspectable evidence.");
  await page.waitForTimeout(300);
  await expect(page.getByRole("tab", { name: "current-paper.pdf", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#paper-text-layer")).toContainText("Knowledge grows through inspectable evidence.");
  await page.unroute(`**${api}/pdfs/${delayedPdf.id}`);
  await page.getByRole("tab", { name: "Preview" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .locator("#pdf-list article")
    .filter({ hasText: "current-paper.pdf" })
    .getByRole("button", { name: "Remove from project" })
    .click();
  await expect(page.locator("#pdf-list")).not.toContainText("current-paper.pdf");
  expect((await readWorkspaceSnapshot(page, api)).pdfs.some((pdf) => pdf.name === "current-paper.pdf")).toBe(false);

  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  const previewScroll = page.locator("#preview-scroll");
  await previewScroll.evaluate((element) => {
    element.scrollTop = 240;
  });
  const previewPosition = await previewScroll.evaluate((element) => element.scrollTop);
  expect(previewPosition).toBeGreaterThan(0);

  await page.locator("#preview .semantic-citation[data-citation='merton1942']").evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.locator("#context-publication-panel")).toBeVisible();
  await expect(page.locator("#context-publication-title")).toHaveText("The Normative Structure of Science");
  const publicationTabId = await page.getByRole("tab", { name: "The Normative Structure of Science" }).getAttribute("id");
  await expect(page.locator("#context-publication-panel")).toHaveAttribute("aria-labelledby", publicationTabId ?? "missing");
  await expect(page.locator("#context-publication-pdfs")).toContainText("No paper connected");

  await page.locator("#publication-pdf-link").selectOption({ label: "context-paper.pdf" });
  await page.locator("#publication-pdf-link-form").getByRole("button", { name: "Connect paper" }).click();
  await expect(page.locator("#context-publication-pdfs")).toContainText("context-paper.pdf");
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).publicationPdfLinks.length).toBe(1);
  const graphResponse = await page.request.get(`${api}/graph`);
  const graph: unknown = await graphResponse.json();
  expect(isWorkspaceKnowledgeGraph(graph) ? graph.edges.some((edge) => edge.relation === "has-artifact") : false).toBe(true);
  await page
    .locator("#pdf-list article")
    .filter({ hasText: "context-paper.pdf" })
    .getByRole("button", { name: "Remove from project" })
    .click();
  await expect(page.locator("#toast")).toContainText("remove 0 highlight(s) and 1 reference link(s) first");

  const contextMutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith(api)) contextMutations.push(request.method());
  });
  await page.getByRole("button", { name: "Pin The Normative Structure of Science" }).click();
  await page.locator("#context-publication-pdfs").getByRole("button", { name: "Open" }).click();
  await expect(page.locator("#context-pdf-panel")).toBeVisible();
  const pdfTabId = await page.getByRole("tab", { name: "context-paper.pdf" }).getAttribute("id");
  await expect(page.locator("#context-pdf-panel")).toHaveAttribute("aria-labelledby", pdfTabId ?? "missing");
  await expect(page.locator("#annotation-pdf")).toBeDisabled();
  await expect(page.locator("#annotation-pdf")).toHaveValue(delayedPdf.id);
  await expect(page.locator("#paper-status")).toHaveText("Select text to capture evidence");
  await page.locator("#next-paper-page").click();
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");
  await page.locator("#paper-reader").evaluate((element) => {
    element.scrollTop = 120;
  });

  await page.getByRole("tab", { name: "Preview" }).click();
  expect(await previewScroll.evaluate((element) => element.scrollTop)).toBe(previewPosition);
  const refreshAnnotation = await page.request.post(`${api}/annotations`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {
      pdfId: delayedPdf.id,
      page: 2,
      quote: "Second page verifies restored PDF context.",
      prefix: "",
      suffix: "",
      comment: "Refresh must preserve reading positions",
      rects: [],
    },
  });
  expect(refreshAnnotation.status()).toBe(201);
  await expect(page.locator("#annotation-list")).toContainText("Refresh must preserve reading positions");
  expect(await previewScroll.evaluate((element) => element.scrollTop)).toBe(previewPosition);
  contextMutations.length = 0;
  await page.getByRole("tab", { name: "context-paper.pdf" }).click();
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");
  const pdfPosition = await page.locator("#paper-reader").evaluate((element) => element.scrollTop);
  expect(pdfPosition).toBeGreaterThan(0);
  const activePdfRefresh = await page.request.post(`${api}/annotations`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {
      pdfId: delayedPdf.id,
      page: 2,
      quote: "Second page verifies restored PDF context.",
      prefix: "",
      suffix: "",
      comment: "Active PDF refresh keeps its position",
      rects: [],
    },
  });
  expect(activePdfRefresh.status()).toBe(201);
  await expect(page.locator("#annotation-list")).toContainText("Active PDF refresh keeps its position");
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");
  expect(await page.locator("#paper-reader").evaluate((element) => element.scrollTop)).toBe(pdfPosition);
  contextMutations.length = 0;

  await page.getByRole("tab", { name: "The Normative Structure of Science" }).click();
  await page.getByRole("tab", { name: "Preview" }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "context-paper.pdf" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "The Normative Structure of Science" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page.locator("#context-pdf-panel")).toBeVisible();
  expect(contextMutations).toEqual([]);
  await page.getByRole("tab", { name: "The Normative Structure of Science" }).click();
  await page.locator("#insert-context-citation").click();
  await expect.poll(async () => ((await editor.inputValue()).match(/:cite\[merton1942\]/gu) ?? []).length).toBe(2);

  await page.setViewportSize({ width: 800, height: 900 });
  await page.locator("#show-context-surface").click();
  await expect(page.locator("#context-surface")).toBeVisible();
  await expect(page.locator("#authoring-surface")).toBeHidden();
  await page.locator("#show-authoring-surface").click();
  await expect(page.locator("#authoring-surface")).toBeVisible();
  await expect(editor).toHaveValue(`${source} :cite[merton1942]`);
});

test("reviews DOI metadata before adding and connecting an imported paper", async ({ page }) => {
  const origin = "http://127.0.0.1:8788";
  const workspaceId = await createWorkspace(page, "Reviewed DOI intake");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();

  await page.locator("#pdf-upload").setInputFiles({
    name: "identified-paper.pdf",
    mimeType: "application/pdf",
    buffer: createEvidencePdf(),
  });
  await page.locator("#pdf-list button[data-pdf-id]").filter({ hasText: "identified-paper.pdf" }).click();
  await expect(page.locator("#publication-intake")).toBeVisible();
  await page.locator("#publication-intake summary").click();
  const baseline = await readWorkspaceSnapshot(page, api);
  const pdf = baseline.pdfs.find((item) => item.name === "identified-paper.pdf");
  if (!pdf) throw new Error("Expected imported DOI-intake PDF");

  const preview = {
    pdfId: pdf.id,
    doi: "10.5555/reviewed-intake",
    metadata: {
      type: "article",
      title: "Reviewed metadata becomes working memory",
      authors: ["Lovelace, Ada"],
      year: "2026",
      venue: "Journal of Inspectable Intake",
      doi: "10.5555/reviewed-intake",
      url: "https://doi.org/10.5555/reviewed-intake",
      abstract: "A deterministic Crossref fixture.",
    },
    metadataFingerprint: "a".repeat(64),
    citationKey: "lovelace2026",
    existingPublicationId: null,
  };
  await page.route(`**${api}/publication-intake/preview`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(preview) });
  });

  await page.locator("#publication-intake-doi").fill("https://doi.org/10.5555/reviewed-intake");
  await page.locator("#publication-intake-form").getByRole("button", { name: "Look up DOI" }).click();
  await expect(page.locator("#publication-intake-review")).toBeVisible();
  await expect(page.locator("#publication-intake-title")).toHaveText("Reviewed metadata becomes working memory");
  await expect(page.locator("#publication-intake-key")).toHaveValue("lovelace2026");
  await page.locator("#publication-intake-cancel").click();
  await expect(page.locator("#publication-intake-review")).toBeHidden();
  expect(await readWorkspaceSnapshot(page, api)).toEqual(baseline);

  await page.locator("#publication-intake-form").getByRole("button", { name: "Look up DOI" }).click();
  await expect(page.locator("#publication-intake-review")).toBeVisible();
  await page.route(`**${api}/publication-intake/accept`, async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (!isRecord(body) || body.pdfId !== pdf.id) throw new Error("Expected the active PDF intake request");
    const importedResponse = await page.request.post(`${api}/bibliography/import`, {
      headers: { origin },
      data: {
        bibtex: `@article{lovelace2026,
          title = {Reviewed metadata becomes working memory},
          author = {Lovelace, Ada},
          year = {2026},
          journal = {Journal of Inspectable Intake},
          doi = {10.5555/reviewed-intake}
        }`,
      },
    });
    const imported: unknown = await importedResponse.json();
    if (!isWorkspaceSnapshot(imported)) throw new Error("Expected imported publication snapshot");
    const publication = imported.publications.find((item) => item.doi === preview.doi);
    if (!publication) throw new Error("Expected DOI-matched publication");
    const linkResponse = await page.request.post(`${api}/publication-pdf-links`, {
      headers: { origin },
      data: { publicationId: publication.id, pdfId: pdf.id },
    });
    const link: unknown = await linkResponse.json();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ publication, link, publicationCreated: true, linkCreated: true }),
    });
  });

  await page.locator("#publication-intake-accept").click();
  await expect(page.locator("#context-publication-title")).toHaveText("Reviewed metadata becomes working memory");
  await expect(page.getByRole("tab", { name: "Reviewed metadata becomes working memory" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#toast")).toContainText("manuscript is unchanged");
  const accepted = await readWorkspaceSnapshot(page, api);
  expect(accepted.source).toBe(baseline.source);
  expect(accepted.source).not.toContain(":cite[lovelace2026]");
  expect(accepted.bibliography).toContain("@article{lovelace2026,");
  const publication = accepted.publications.find((item) => item.doi === preview.doi);
  expect(publication).toBeDefined();
  expect(accepted.publicationPdfLinks).toContainEqual(expect.objectContaining({ publicationId: publication?.id, pdfId: pdf.id }));
});

test("auto-saves, extends, undoes, erases, and deletes PDF highlights", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Editable highlight lifecycle");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  await page.locator("#pdf-upload").setInputFiles({
    name: "editable-highlights.pdf",
    mimeType: "application/pdf",
    buffer: createEvidencePdf(),
  });
  await page.locator("#pdf-list button[data-pdf-id]").filter({ hasText: "editable-highlights.pdf" }).click();
  await expect(page.locator("#paper-status")).toHaveText("Select text to capture evidence");
  let delayFirstSave = true;
  await page.route(`**${api}/annotations`, async (route) => {
    if (delayFirstSave && route.request().method() === "POST") {
      delayFirstSave = false;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await route.continue();
  });

  const paintSelection = async (): Promise<void> => {
    await page.locator("#paper-text-layer").evaluate((layer) => {
      const span = layer.querySelector("span");
      if (!span?.firstChild) throw new Error("Expected rendered PDF text");
      const range = document.createRange();
      range.selectNodeContents(span);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      layer.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
  };

  await paintSelection();
  await expect(page.locator("#paper-highlights .pdf-highlight[data-draft='true']")).toBeVisible();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments.length).toBe(1);
  await paintSelection();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments.length).toBe(2);
  expect((await readWorkspaceSnapshot(page, api)).annotations).toHaveLength(1);

  await page.getByRole("button", { name: "Undo last stroke" }).click();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments.length).toBe(1);
  await paintSelection();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments.length).toBe(2);

  await page.getByRole("button", { name: "Eraser" }).click();
  await page.locator("#paper-highlights .pdf-highlight[data-fragment-id]").last().click();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments.length).toBe(1);

  await openResearchCollection(page, "Highlights");
  let annotationCard = page.locator("#annotation-list .resource-card").first();
  await annotationCard.getByText("Adjust 1 stroke").click();
  await annotationCard.getByLabel("Text for highlight stroke 1").fill("Corrected touch selection idea");
  await annotationCard.getByRole("button", { name: "Save text" }).click();
  await expect
    .poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments[0]?.quote)
    .toBe("Corrected touch selection idea");
  const beforeX = (await readWorkspaceSnapshot(page, api)).annotations[0]!.fragments[0]!.rects[0]!.x;
  annotationCard = page.locator("#annotation-list .resource-card").first();
  await annotationCard.getByText("Adjust 1 stroke").click();
  await annotationCard.getByRole("button", { name: "→ highlight stroke 1" }).click();
  await expect
    .poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments[0]?.rects[0]?.x)
    .toBeGreaterThan(beforeX);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator("#annotation-list").getByRole("button", { name: "Delete highlight" }).click();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).annotations.length).toBe(0);
});

test("converges source edits across two writers", async ({ page, context }) => {
  const collaborator = await context.newPage();
  await Promise.all([page.goto("/"), collaborator.goto("/")]);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();

  const sharedSource = "## Shared evidence {#shared-evidence}\n\nThe first writer contributes a claim.\n";
  await page.locator("#source-editor").fill(sharedSource);
  await expect(collaborator.locator("#source-editor")).toHaveValue(sharedSource);
  await expect(collaborator.locator("#source-editor-highlight")).toHaveText(sharedSource);

  const expandedSource = `${sharedSource}\nThe second writer connects the evidence.\n`;
  await collaborator.locator("#source-editor").fill(expandedSource);
  await expect(page.locator("#source-editor")).toHaveValue(expandedSource);
  await expect(page.locator("#source-editor-highlight")).toHaveText(expandedSource);

  const selectedText = "second writer";
  await page.locator("#source-editor").evaluate((element: HTMLTextAreaElement, text: string) => {
    const start = element.value.indexOf(text);
    element.focus();
    element.setSelectionRange(start, start + text.length);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  }, selectedText);
  await expect(collaborator.locator("#collaborator-selections")).toContainText(`“${selectedText}”`);

  const sourceBeforeComment = await page.locator("#source-editor").inputValue();
  await page.getByRole("tab", { name: /Comments/ }).click();
  await expect(page.locator("#comments-rail-panel")).toBeVisible();
  await page.locator("#manuscript-comment-body").fill("Keep this collaboration claim concrete.");
  await page.locator("#manuscript-comment-form").getByRole("button", { name: "Add comment" }).click();
  await expect(collaborator.locator("#manuscript-comment-list")).toContainText("Keep this collaboration claim concrete.");
  await collaborator.getByRole("tab", { name: /Comments/ }).click();
  await collaborator.locator("#manuscript-comment-list").getByRole("button", { name: "Resolve" }).click();
  await expect(page.locator("#manuscript-comment-list")).toContainText("resolved");
  await expect(page.locator("#source-editor")).toHaveValue(sourceBeforeComment);
  await collaborator.close();
});

test("does not revise a manuscript when collaborators only reconnect", async ({ page, context }) => {
  const workspaceId = await createWorkspace(page, "Connection boundary");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  const baseline = await readWorkspaceSnapshot(page, api);

  const collaborator = await context.newPage();
  await collaborator.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();

  await collaborator.reload();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();
  await collaborator.close();

  // A short quiet period makes the negative assertion cover all queued socket frames.
  await page.waitForTimeout(200);
  const afterReconnect = await readWorkspaceSnapshot(page, api);
  expect(afterReconnect.revision).toBe(baseline.revision);
  expect(afterReconnect.source).toBe(baseline.source);
  expect(afterReconnect.bibliography).toBe(baseline.bibliography);
});

test("keeps a focused caret attached to manuscript text during a remote insertion", async ({ page, context }) => {
  const workspaceId = await createWorkspace(page, "Caret boundary");
  const path = `/workspaces/${workspaceId}`;
  await page.goto(path);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();

  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();

  const source = "Alpha keeps its logical caret.\n";
  const editor = page.locator("#source-editor");
  await editor.fill(source);
  await expect(collaborator.locator("#source-editor")).toHaveValue(source);
  await editor.evaluate((element: HTMLTextAreaElement) => {
    const caret = element.value.indexOf(" keeps");
    element.focus();
    element.setSelectionRange(caret, caret);
  });
  await expect(editor).toBeFocused();

  const prefix = "A collaborator notes: ";
  await collaborator.locator("#source-editor").fill(`${prefix}${source}`);
  await expect(editor).toHaveValue(`${prefix}${source}`);
  await expect
    .poll(async () => await editor.evaluate((element: HTMLTextAreaElement) => element.selectionStart))
    .toBe(prefix.length + "Alpha".length);

  await page.keyboard.type("!");
  await expect(editor).toHaveValue(`${prefix}Alpha! keeps its logical caret.\n`);
  await expect(collaborator.locator("#source-editor")).toHaveValue(`${prefix}Alpha! keeps its logical caret.\n`);
  await collaborator.close();
});

test("invalidates shared resources without replacing the collaborative manuscript", async ({ page, context }) => {
  const workspaceId = await createWorkspace(page, "Resource invalidation boundary");
  const api = `/api/workspaces/${workspaceId}`;
  const path = `/workspaces/${workspaceId}`;
  await page.goto(path);
  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();

  const sharedSource = "## Shared resource boundary {#shared-resource}\n\nThe manuscript remains under Yjs ownership.\n";
  await page.locator("#source-editor").fill(sharedSource);
  await expect(collaborator.locator("#source-editor")).toHaveValue(sharedSource);
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(sharedSource);

  const pdfResponse = await page.request.post(`${api}/pdfs`, {
    headers: {
      origin: "http://127.0.0.1:8788",
      "content-type": "application/pdf",
      "x-file-name": "socket-invalidated-evidence.pdf",
    },
    data: createEvidencePdf(),
  });
  expect(pdfResponse.status()).toBe(201);

  await expect(page.locator("#pdf-list")).toContainText("socket-invalidated-evidence.pdf");
  await expect(collaborator.locator("#pdf-list")).toContainText("socket-invalidated-evidence.pdf");
  await expect(page.locator("#source-editor")).toHaveValue(sharedSource);
  await expect(collaborator.locator("#source-editor")).toHaveValue(sharedSource);
  expect((await readWorkspaceSnapshot(page, api)).source).toBe(sharedSource);
  await collaborator.close();
});

test("keeps annotation and claim passage anchors attached across remote insertions", async ({ page, context }) => {
  const origin = "http://127.0.0.1:8788";
  const workspaceId = await createWorkspace(page, "Durable passage anchors");
  const api = `/api/workspaces/${workspaceId}`;
  const pdfResponse = await page.request.post(`${api}/pdfs`, {
    headers: { origin, "content-type": "application/pdf", "x-file-name": "anchor-evidence.pdf" },
    data: createEvidencePdf(),
  });
  const pdf: unknown = await pdfResponse.json();
  if (!isRecord(pdf) || typeof pdf.id !== "string") throw new Error("Expected an imported PDF");
  const annotationResponse = await page.request.post(`${api}/annotations`, {
    headers: { origin },
    data: {
      pdfId: pdf.id,
      page: 1,
      quote: "Knowledge grows through inspectable evidence.",
      prefix: "",
      suffix: "",
      comment: "Durable annotation anchor",
      rects: [],
    },
  });
  const annotation: unknown = await annotationResponse.json();
  if (!isRecord(annotation) || typeof annotation.id !== "string") throw new Error("Expected an annotation");
  const claimResponse = await page.request.post(`${api}/claims`, {
    headers: { origin },
    data: {
      text: "Durable anchors keep claims connected to prose.",
      note: "Durable claim anchor",
      evidence: [{ annotationId: annotation.id, relation: "supports" }],
    },
  });
  const claim: unknown = await claimResponse.json();
  if (!isRecord(claim) || typeof claim.id !== "string") throw new Error("Expected a claim");

  const path = `/workspaces/${workspaceId}`;
  await page.goto(path);
  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();

  const annotationExcerpt = "The annotation passage stays addressable.";
  const claimExcerpt = "The claim passage stays addressable.";
  const source = [
    "## Durable anchors {#durable-anchors}",
    "",
    "Context before annotation.",
    annotationExcerpt,
    "Context between passages.",
    claimExcerpt,
    "",
  ].join("\n");
  const editor = page.locator("#source-editor");
  await editor.fill(source);
  await expect(collaborator.locator("#source-editor")).toHaveValue(source);
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(source);
  const anchoredSnapshot = await readWorkspaceSnapshot(page, api);
  const annotationStart = source.indexOf(annotationExcerpt);
  const claimStart = source.indexOf(claimExcerpt);

  const annotationLinkResponse = await page.request.post(`${api}/links`, {
    headers: { origin },
    data: {
      annotationId: annotation.id,
      fileId: anchoredSnapshot.entryFileId,
      sourceRevision: anchoredSnapshot.revision,
      start: annotationStart,
      end: annotationStart + annotationExcerpt.length,
      excerpt: annotationExcerpt,
    },
  });
  expect(annotationLinkResponse.status()).toBe(201);
  const claimLinkResponse = await page.request.post(`${api}/claim-links`, {
    headers: { origin },
    data: {
      claimId: claim.id,
      fileId: anchoredSnapshot.entryFileId,
      sourceRevision: anchoredSnapshot.revision,
      start: claimStart,
      end: claimStart + claimExcerpt.length,
      excerpt: claimExcerpt,
    },
  });
  expect(claimLinkResponse.status()).toBe(201);

  const linkedSnapshot = await readWorkspaceSnapshot(page, api);
  const annotationLink: unknown = linkedSnapshot.links.find((link) => link.annotationId === annotation.id);
  const claimLink: unknown = linkedSnapshot.claimLinks.find((link) => link.claimId === claim.id);
  expectPassageAnchor(annotationLink, {
    exact: annotationExcerpt,
    originalRange: { start: annotationStart, end: annotationStart + annotationExcerpt.length },
    anchoredRevision: anchoredSnapshot.revision,
  });
  expectPassageAnchor(claimLink, {
    exact: claimExcerpt,
    originalRange: { start: claimStart, end: claimStart + claimExcerpt.length },
    anchoredRevision: anchoredSnapshot.revision,
  });
  expectResolvedPassage(annotationLink, annotationStart, annotationExcerpt);
  expectResolvedPassage(claimLink, claimStart, claimExcerpt);

  await openResearchCollection(page, "Highlights");
  await openResearchCollection(page, "Claims");
  const annotationCard = page.locator("#annotation-list article").filter({ hasText: "Durable annotation anchor" });
  const claimCard = page.locator("#claim-list article").filter({ hasText: "Durable anchors keep claims connected" });
  await expect(annotationCard.getByRole("button", { name: "Open linked passage" })).toBeVisible();
  await expect(claimCard.getByRole("button", { name: "Open linked passage" })).toBeVisible();

  const annotationInsertion = "New context before the annotation.\n";
  const collaboratorEditor = collaborator.locator("#source-editor");
  await collaboratorEditor.evaluate(
    (element: HTMLTextAreaElement, input: { at: number; insertion: string }) => {
      element.focus();
      element.setRangeText(input.insertion, input.at, input.at, "end");
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: input.insertion }));
    },
    { at: annotationStart, insertion: annotationInsertion },
  );
  const afterAnnotationInsertion = `${source.slice(0, annotationStart)}${annotationInsertion}${source.slice(annotationStart)}`;
  await expect(editor).toHaveValue(afterAnnotationInsertion);

  const claimInsertion = "New context before the claim.\n";
  const shiftedClaimStart = afterAnnotationInsertion.indexOf(claimExcerpt);
  await collaboratorEditor.evaluate(
    (element: HTMLTextAreaElement, input: { at: number; insertion: string }) => {
      element.focus();
      element.setRangeText(input.insertion, input.at, input.at, "end");
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: input.insertion }));
    },
    { at: shiftedClaimStart, insertion: claimInsertion },
  );
  const shiftedSource = `${afterAnnotationInsertion.slice(0, shiftedClaimStart)}${claimInsertion}${afterAnnotationInsertion.slice(shiftedClaimStart)}`;
  await expect(editor).toHaveValue(shiftedSource);
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(shiftedSource);

  const shiftedSnapshot = await readWorkspaceSnapshot(page, api);
  const shiftedAnnotationLink: unknown = shiftedSnapshot.links.find((link) => link.annotationId === annotation.id);
  const shiftedClaimLink: unknown = shiftedSnapshot.claimLinks.find((link) => link.claimId === claim.id);
  const resolvedAnnotationStart = annotationStart + annotationInsertion.length;
  const resolvedClaimStart = claimStart + annotationInsertion.length + claimInsertion.length;
  expectResolvedPassage(shiftedAnnotationLink, resolvedAnnotationStart, annotationExcerpt);
  expectResolvedPassage(shiftedClaimLink, resolvedClaimStart, claimExcerpt);

  await annotationCard.getByRole("button", { name: "Open linked passage" }).click();
  await expect(editor).toBeFocused();
  await expectEditorSelection(editor, resolvedAnnotationStart, annotationExcerpt);
  await claimCard.getByRole("button", { name: "Open linked passage" }).click();
  await expect(editor).toBeFocused();
  await expectEditorSelection(editor, resolvedClaimStart, claimExcerpt);

  const candidatePrefix = "A reviewed candidate adds context.\n";
  const candidateTarget = "## Durable anchors {#durable-anchors}";
  if (typeof annotation.updatedAt !== "string") throw new Error("Expected an annotation version");
  const candidateResponse = await page.request.post(`${api}/candidates`, {
    headers: { origin },
    data: {
      providerAdapter: "openai-compatible",
      providerLabel: "Browser-local test provider",
      model: "anchor-preserving-model",
      promptVersion: "revise-selection-v1",
      instruction: "Add one context line before this heading.",
      target: {
        fileId: shiftedSnapshot.entryFileId,
        start: 0,
        end: candidateTarget.length,
        excerpt: candidateTarget,
        sourceRevision: shiftedSnapshot.revision,
      },
      evidence: [{ kind: "annotation", id: annotation.id, version: annotation.updatedAt }],
      proposedReplacement: `${candidatePrefix}${candidateTarget}`,
    },
  });
  expect(candidateResponse.status()).toBe(201);
  const candidate: unknown = await candidateResponse.json();
  if (!isRecord(candidate) || typeof candidate.id !== "string") throw new Error("Expected an anchor-preserving candidate");
  const applyResponse = await page.request.post(`${api}/candidates/${candidate.id}/apply`, { headers: { origin } });
  expect(applyResponse.ok()).toBe(true);
  await expect(editor).toHaveValue(`${candidatePrefix}${shiftedSource}`);
  const candidateSnapshot = await readWorkspaceSnapshot(page, api);
  expectResolvedPassage(
    candidateSnapshot.links.find((link) => link.annotationId === annotation.id),
    resolvedAnnotationStart + candidatePrefix.length,
    annotationExcerpt,
  );
  expectResolvedPassage(
    candidateSnapshot.claimLinks.find((link) => link.claimId === claim.id),
    resolvedClaimStart + candidatePrefix.length,
    claimExcerpt,
  );

  const candidateAnnotationStart = resolvedAnnotationStart + candidatePrefix.length;
  const changedAnnotationExcerpt = annotationExcerpt.replace("stays", "moves");
  const changedWordStart = candidateAnnotationStart + annotationExcerpt.indexOf("stays");
  await expect(collaboratorEditor).toHaveValue(`${candidatePrefix}${shiftedSource}`);
  await collaboratorEditor.evaluate(
    (element: HTMLTextAreaElement, range: { start: number; end: number }) => {
      element.focus();
      element.setRangeText("moves", range.start, range.end, "end");
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "moves" }));
    },
    { start: changedWordStart, end: changedWordStart + "stays".length },
  );
  await expect(editor).toHaveValue(
    `${candidatePrefix}${shiftedSource.slice(0, resolvedAnnotationStart)}${changedAnnotationExcerpt}${shiftedSource.slice(
      resolvedAnnotationStart + annotationExcerpt.length,
    )}`,
  );
  const changedAction = annotationCard.getByRole("button", { name: "Open changed passage" });
  await expect(changedAction).toBeEnabled();
  await expect(changedAction).toHaveAttribute("data-anchor-match", "changed");
  const changedSnapshot = await readWorkspaceSnapshot(page, api);
  expect(readPassageResolution(changedSnapshot.links.find((link) => link.annotationId === annotation.id))).toMatchObject({
    status: "resolved",
    start: candidateAnnotationStart,
    end: candidateAnnotationStart + changedAnnotationExcerpt.length,
    text: changedAnnotationExcerpt,
    exactMatch: false,
  });
  await changedAction.click();
  await expectEditorSelection(editor, candidateAnnotationStart, changedAnnotationExcerpt);
  await collaborator.close();
});

test("reports a deleted passage anchor as stale instead of guessing", async ({ page, context }) => {
  const origin = "http://127.0.0.1:8788";
  const workspaceId = await createWorkspace(page, "Passage anchor failure modes");
  const api = `/api/workspaces/${workspaceId}`;
  const pdfResponse = await page.request.post(`${api}/pdfs`, {
    headers: { origin, "content-type": "application/pdf", "x-file-name": "stale-anchor.pdf" },
    data: createEvidencePdf(),
  });
  const pdf: unknown = await pdfResponse.json();
  if (!isRecord(pdf) || typeof pdf.id !== "string") throw new Error("Expected an imported PDF");
  const annotationResponse = await page.request.post(`${api}/annotations`, {
    headers: { origin },
    data: {
      pdfId: pdf.id,
      page: 1,
      quote: "Knowledge grows through inspectable evidence.",
      prefix: "",
      suffix: "",
      comment: "Failure-mode anchor",
      rects: [],
    },
  });
  const annotation: unknown = await annotationResponse.json();
  if (!isRecord(annotation) || typeof annotation.id !== "string") throw new Error("Expected an annotation");

  const path = `/workspaces/${workspaceId}`;
  await page.goto(path);
  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  const excerpt = "This passage has a durable identity.";
  const source = `## Resolution boundary\n\nBefore.\n${excerpt}\nAfter.\n`;
  await page.locator("#source-editor").fill(source);
  await expect(collaborator.locator("#source-editor")).toHaveValue(source);
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(source);
  const sourceSnapshot = await readWorkspaceSnapshot(page, api);
  const start = source.indexOf(excerpt);
  const linkResponse = await page.request.post(`${api}/links`, {
    headers: { origin },
    data: {
      annotationId: annotation.id,
      fileId: sourceSnapshot.entryFileId,
      sourceRevision: sourceSnapshot.revision,
      start,
      end: start + excerpt.length,
      excerpt,
    },
  });
  expect(linkResponse.status()).toBe(201);

  const staleSource = `${source.slice(0, start)}${source.slice(start + excerpt.length)}`;
  await collaborator.locator("#source-editor").evaluate(
    (element: HTMLTextAreaElement, range: { start: number; end: number }) => {
      element.focus();
      element.setRangeText("", range.start, range.end, "start");
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentForward" }));
    },
    { start, end: start + excerpt.length },
  );
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(staleSource);
  const staleSnapshot = await readWorkspaceSnapshot(page, api);
  const staleLink: unknown = staleSnapshot.links.find((link) => link.annotationId === annotation.id);
  expect(readPassageResolution(staleLink)).toMatchObject({ status: "stale" });
  const staleAction = page.locator('#annotation-list [data-anchor-status="stale"]');
  await expect(staleAction).toHaveText("Linked passage is stale");
  await expect(staleAction).toBeDisabled();
  await collaborator.close();
});

test("creates and inserts transcluded project files", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Transclusion authoring");
  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.locator("#save-status")).toHaveText("Saved");
  const source = page.locator("#source-editor");
  await source.fill("Before\nAfter\n");
  await source.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(7, 7);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });

  const fileMenu = page.locator(".action-menu", { has: page.locator("#create-and-include-project-file") });
  await fileMenu.locator("summary").click();
  await page.locator("#create-and-include-project-file").click();
  await page.locator("#project-file-path").fill("chapters/method.md");
  await page.locator("#project-file-form").getByRole("button", { name: "Save file" }).click();
  await expect(source).toHaveValue("Before\n\n::include[chapters/method.md]\nAfter\n");
  await expect(page.locator("#project-file-list")).toContainText("chapters/method.md");

  await source.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page.locator("#editor-insert-menu summary").click();
  await page.locator("#include-project-file-list [data-include-file-id]").click();
  await expect(source).toHaveValue(/::include\[chapters\/method\.md\]\n$/u);
  await page.locator("#project-file-switcher").selectOption({ label: "chapters/method.md" });
  await source.fill("## Method\n\nDescribe the procedure.\n");
  await expect(page.locator("#source-editor-highlight")).toHaveText("## Method\n\nDescribe the procedure.\n");
  await expect(page.locator("#source-editor-highlight .markdown-token-heading")).toContainText("Method");
});

test("isolates clients that send unsupported collaboration frames", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();

  const beforeValue: unknown = await (await page.request.get("/api/workspaces/demo")).json();
  if (!isWorkspaceSnapshot(beforeValue)) throw new Error("Expected a workspace snapshot before hostile frames");

  const outcomes = await page.evaluate(async () => {
    const endpoint = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/workspaces/demo/socket`;
    const sendAndWaitForClose = async (payload: string | Uint8Array): Promise<{ code: number; reason: string }> =>
      await new Promise((resolve, reject) => {
        const socket = new WebSocket(endpoint);
        const timeout = window.setTimeout(() => {
          socket.close();
          reject(new Error("Hostile collaboration socket was not closed"));
        }, 5_000);
        socket.addEventListener("open", () => socket.send(typeof payload === "string" ? payload : new Uint8Array(payload).buffer));
        socket.addEventListener("close", (event) => {
          window.clearTimeout(timeout);
          resolve({ code: event.code, reason: event.reason });
        });
      });

    return await Promise.all([
      sendAndWaitForClose(JSON.stringify({ type: "revision", revision: 999_999 })),
      sendAndWaitForClose(new Uint8Array([255])),
    ]);
  });

  expect(outcomes).toEqual([
    { code: 1003, reason: "Unsupported client collaboration metadata" },
    { code: 1007, reason: "Invalid document update" },
  ]);
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();

  const afterValue: unknown = await (await page.request.get("/api/workspaces/demo")).json();
  if (!isWorkspaceSnapshot(afterValue)) throw new Error("Expected a workspace snapshot after hostile frames");
  expect(afterValue.revision).toBe(beforeValue.revision);
  expect(afterValue.source).toBe(beforeValue.source);
});

test("creates, shares, and navigates isolated workspaces", async ({ page, browser }) => {
  await page.goto("/");
  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "New project" }).click();
  await page.locator("#new-workspace-title").fill("Independent inquiry");
  await page.locator("#new-workspace-dialog").getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}$/u);

  const workspaceId = new URL(page.url()).pathname.split("/").at(-1);
  if (!workspaceId) throw new Error("Expected a workspace id");
  await expect(page.locator("#workspace-switcher")).toHaveValue(workspaceId);
  await expect(page.locator("#workspace-switcher option:checked")).toHaveText("Independent inquiry");
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();
  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "Open projects" }).click();
  await page.locator("#workspace-catalog-filter").fill("Independent inquiry");
  await expect(page.locator("#workspace-catalog-list")).toContainText("Independent inquiry");
  await expect(page.locator("#workspace-catalog-list")).toContainText("Current project");
  await page.locator("#workspace-catalog-filter").fill("No matching project title");
  await expect(page.locator("#workspace-catalog-list")).toContainText("No projects match this title.");
  await page.locator("#workspace-catalog-dialog").getByRole("button", { name: "Close" }).click();

  const isolatedSource = "## Independent evidence {#independent}\n\nThis belongs to one workspace.\n";
  await page.locator("#source-editor").fill(isolatedSource);
  await expect(page.locator("#preview")).toContainText("This belongs to one workspace.");

  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.locator("#workspace-member-list")).toContainText("local@kirjolab.invalid");
  await page.locator("#invite-member-email").fill("collaborator@example.org");
  await page.getByRole("button", { name: "Invite collaborator" }).click();
  await expect(page.locator("#workspace-member-list")).toContainText("collaborator@example.org");
  await page.locator("#close-share-workspace").click();

  const collaboratorContext = await browser.newContext({
    baseURL: "http://127.0.0.1:8788",
    extraHTTPHeaders: { "x-kirjolab-local-user": "collaborator@example.org" },
  });
  const collaborator = await collaboratorContext.newPage();
  await collaborator.goto(`/workspaces/${workspaceId}`);
  await expect(collaborator.locator("#source-editor")).toHaveValue(isolatedSource);
  await expect(collaborator.locator("#workspace-switcher")).toHaveValue(workspaceId);
  await collaboratorContext.close();

  const intruderContext = await browser.newContext({
    baseURL: "http://127.0.0.1:8788",
    extraHTTPHeaders: { "x-kirjolab-local-user": "intruder@example.org" },
  });
  const intruderResponse = await intruderContext.request.get(`/api/workspaces/${workspaceId}`);
  expect(intruderResponse.status()).toBe(404);
  await intruderContext.close();

  const catalogResponse = await page.request.get("/api/workspaces");
  const catalog: unknown = await catalogResponse.json();
  expect(isWorkspaceSummaries(catalog)).toBe(true);
  expect(isWorkspaceSummaries(catalog) ? catalog.some((workspace) => workspace.id === workspaceId) : false).toBe(true);

  await page.goto("/");
  await expect(page.locator("#workspace-switcher")).toHaveValue("demo");
  await expect(page.locator("#source-editor")).not.toHaveValue(isolatedSource);
});

test("names, compares, restores, and branches immutable project revisions", async ({ page, browser }) => {
  const workspaceId = await createWorkspace(page, "Revision workflow");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();
  await page.locator("#source-editor").fill("# Revised manuscript\n\nA versioned claim.\n");
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toContain("A versioned claim.");

  const historyResponse = await page.request.get(`${api}/history`);
  expect(historyResponse.ok()).toBe(true);
  const history: unknown = await historyResponse.json();
  if (!Array.isArray(history) || !isRecord(history[0]) || typeof history[0].revision !== "number") {
    throw new Error("Expected project revision history");
  }
  const head = history[0].revision;
  const milestone = await page.request.post(`${api}/history/${head}/milestones`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { name: "review draft", description: "Sent for review" },
  });
  expect(milestone.status()).toBe(201);
  const invited = await page.request.post(`${api}/members`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { email: "history-reader@example.org" },
  });
  expect(invited.status()).toBe(201);
  const memberContext = await browser.newContext({
    baseURL: "http://127.0.0.1:8788",
    extraHTTPHeaders: { "x-kirjolab-local-user": "history-reader@example.org" },
  });
  expect((await memberContext.request.get(`${api}/history`)).status()).toBe(200);
  const forbiddenMilestone = await memberContext.request.post(`${api}/history/${head}/milestones`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { name: "member cannot tag" },
  });
  expect(forbiddenMilestone.status()).toBe(403);
  await memberContext.close();

  const fileCreated = await page.request.post(`${api}/files`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { path: "appendix/reviewer-notes.md", content: "Reviewer response\n" },
  });
  expect(fileCreated.status()).toBe(201);
  const nextHistory: unknown = await (await page.request.get(`${api}/history`)).json();
  if (!Array.isArray(nextHistory) || !isRecord(nextHistory[0]) || typeof nextHistory[0].revision !== "number") {
    throw new Error("Expected updated project revision history");
  }
  const next = nextHistory[0].revision;
  const compared = await page.request.get(`${api}/history/compare?from=${head}&to=${next}`);
  expect(compared.ok()).toBe(true);
  await expect(compared.json()).resolves.toMatchObject({
    fromRevision: head,
    toRevision: next,
    files: expect.arrayContaining([expect.objectContaining({ status: "added", afterPath: "appendix/reviewer-notes.md" })]),
  });

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.locator("#project-history-dialog")).toBeVisible();
  await expect(page.locator("#project-history-list")).toContainText("review draft");
  await expect(page.locator("#project-history-list")).toContainText("project-file-create");
  await page.locator("#close-project-history").click();

  const branch = await page.request.post(`${api}/history/${head}/seed`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { title: "Reviewer response branch" },
  });
  expect(branch.status()).toBe(201);
  const branchSummary: unknown = await branch.json();
  if (!isRecord(branchSummary) || typeof branchSummary.id !== "string") throw new Error("Expected revision branch workspace");
  const branchSnapshot = await readWorkspaceSnapshot(page, `/api/workspaces/${branchSummary.id}`);
  expect(branchSnapshot.source).toContain("A versioned claim.");
  expect(branchSnapshot.files.some((file) => file.path === "appendix/reviewer-notes.md")).toBe(false);

  const restored = await page.request.post(`${api}/history/${head}/restore`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {},
  });
  expect(restored.ok()).toBe(true);
  await expect
    .poll(async () => (await readWorkspaceSnapshot(page, api)).files.some((file) => file.path === "appendix/reviewer-notes.md"))
    .toBe(false);
  const restoredHistory: unknown = await (await page.request.get(`${api}/history`)).json();
  expect(restoredHistory).toEqual(expect.arrayContaining([expect.objectContaining({ reason: `restore:r${head}` })]));
});

test("projects the default canonical bibliography into a fresh workspace", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Default bibliography projection");
  const snapshot = await readWorkspaceSnapshot(page, `/api/workspaces/${workspaceId}`);
  const publication = snapshot.publications.find((candidate) => candidate.citationKey === "merton1942");

  expect(publication).toMatchObject({
    type: "article",
    title: "The Normative Structure of Science",
    authors: ["Merton, Robert K."],
    year: "1942",
    venue: "The Sociology of Science",
    metadataSource: "bibtex",
  });
});

test("derives collaborative project bibliography from shared-library aliases", async ({ page, context }) => {
  const workspaceId = await createWorkspace(page, "Derived project bibliography");
  const api = `/api/workspaces/${workspaceId}`;
  const path = `/workspaces/${workspaceId}`;
  await page.goto(path);
  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();

  const imported = await page.request.post(`${api}/bibliography/import`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {
      bibtex: `@article{collaborative2026,
        author = {Doe, Jane and Researcher, Alex},
        title = {Collaborative Reference Projection},
        year = {2026},
        journal = {Journal of Shared Evidence},
        doi = {10.5555/collaborative.2026}
      }`,
    },
  });
  expect(imported.status()).toBe(200);
  await expect(page.locator("#publication-list")).toContainText("Collaborative Reference Projection");
  await expect(collaborator.locator("#publication-list")).toContainText("Collaborative Reference Projection");
  const snapshot = await readWorkspaceSnapshot(page, api);
  const link = snapshot.projectReferences.find((item) => item.citationAlias === "collaborative2026");
  if (!link) throw new Error("Expected a shared-library project link");

  await Promise.all([page.getByRole("tab", { name: "Files" }).click(), collaborator.getByRole("tab", { name: "Files" }).click()]);
  await Promise.all([
    page.locator("summary").filter({ hasText: "Derived project bibliography" }).click(),
    collaborator.locator("summary").filter({ hasText: "Derived project bibliography" }).click(),
  ]);
  await expect(page.locator("#bibliography-editor")).toHaveAttribute("readonly", "");
  await expect(collaborator.locator("#bibliography-editor")).toHaveValue(/@article\{collaborative2026/u);
  const source = "# Shared source\n\nThe project cites :cite[collaborative2026].\n";
  await page.locator("#source-editor").fill(source);
  await expect(collaborator.locator("#source-editor")).toHaveValue(source);

  const renamed = await page.request.patch(`${api}/references/${link.referenceId}`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { citationAlias: "renamed2027" },
  });
  expect(renamed.ok()).toBe(true);
  await expect(page.locator("#source-editor")).toHaveValue(/:cite\[renamed2027\]/u);
  await expect(collaborator.locator("#source-editor")).toHaveValue(/:cite\[renamed2027\]/u);
  await expect(page.locator("#bibliography-editor")).toHaveValue(/@article\{renamed2027/u);

  const guardedUnlink = await page.request.delete(`${api}/references/${link.referenceId}`, {
    headers: { origin: "http://127.0.0.1:8788" },
  });
  expect(guardedUnlink.status()).toBe(409);
  await collaborator.close();
});

test("imports BibTeX into stable publication resources", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Stable shared import");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();
  await page.locator("#bibliography-upload").setInputFiles({
    name: "references.bib",
    mimeType: "application/x-bibtex",
    buffer: Buffer.from(`@article{inspectable2026,
  author = {Doe, Jane and Researcher, Alex},
  title = {Inspectable Reference Workflows},
  year = {2026},
  journal = {Journal of Open Evidence},
  doi = {https://doi.org/10.5555/inspectable.2026}
}`),
  });

  await expect(page.locator("#publication-list")).toContainText("Inspectable Reference Workflows");
  await expect(page.locator("#publication-list")).toContainText("10.5555/inspectable.2026");
  await expect(page.locator("#publication-count")).not.toHaveText("0");
  await expect(page.locator("#bibliography-editor")).toHaveValue(/@article\{inspectable2026,/u);

  const response = await page.request.get(api);
  const value: unknown = await response.json();
  expect(response.ok()).toBe(true);
  const imported = isWorkspaceSnapshot(value)
    ? value.publications.find((publication) => publication.citationKey === "inspectable2026")
    : undefined;
  expect(imported).toMatchObject({
    title: "Inspectable Reference Workflows",
    doi: "10.5555/inspectable.2026",
    metadataSource: "bibtex",
  });

  await page.locator("#bibliography-upload").setInputFiles({
    name: "updated-references.bib",
    mimeType: "application/x-bibtex",
    buffer: Buffer.from(`@article{Inspectable2026,
  author = {Doe, Jane},
  title = {Updated Reference Workflows},
  year = {2027},
  doi = {10.5555/inspectable.2026}
}`),
  });
  await expect(page.locator("#publication-list")).toContainText("Updated Reference Workflows");
  const updatedResponse = await page.request.get(api);
  const updatedValue: unknown = await updatedResponse.json();
  const updated = isWorkspaceSnapshot(updatedValue)
    ? updatedValue.publications.find((publication) => publication.citationKey === "inspectable2026")
    : undefined;
  expect(updated?.id).toBe(imported?.id);
  expect(updated).toMatchObject({ title: "Updated Reference Workflows", year: "2027" });
});

test("persists and atomically replaces evidence-backed claims", async ({ page }) => {
  await page.goto("/");
  const origin = "http://127.0.0.1:8788";
  const workspaceResponse = await page.request.post("/api/workspaces", {
    headers: { origin },
    data: { title: "Claim boundary" },
  });
  const workspace: unknown = await workspaceResponse.json();
  if (!isRecord(workspace) || typeof workspace.id !== "string") throw new Error("Expected a created workspace");
  const api = `/api/workspaces/${workspace.id}`;

  const pdfResponse = await page.request.post(`${api}/pdfs`, {
    headers: { origin, "content-type": "application/pdf", "x-file-name": "claim-evidence.pdf" },
    data: createEvidencePdf(),
  });
  const pdf: unknown = await pdfResponse.json();
  if (!isRecord(pdf) || typeof pdf.id !== "string") throw new Error("Expected an imported PDF");

  const annotationResponse = await page.request.post(`${api}/annotations`, {
    headers: { origin },
    data: {
      pdfId: pdf.id,
      page: 1,
      quote: "Knowledge grows through inspectable evidence.",
      prefix: "",
      suffix: "",
      comment: "Claim source",
      rects: [],
    },
  });
  const annotation: unknown = await annotationResponse.json();
  if (!isRecord(annotation) || typeof annotation.id !== "string") throw new Error("Expected an annotation");

  const claimResponse = await page.request.post(`${api}/claims`, {
    headers: { origin },
    data: {
      text: "Inspectable evidence strengthens scholarly claims.",
      note: "Initial synthesis",
      evidence: [{ annotationId: annotation.id, relation: "supports" }],
    },
  });
  expect(claimResponse.status()).toBe(201);
  const claim: unknown = await claimResponse.json();
  if (!isRecord(claim) || typeof claim.id !== "string") throw new Error("Expected a claim");

  const updateResponse = await page.request.put(`${api}/claims/${claim.id}`, {
    headers: { origin },
    data: {
      text: "Inspectable evidence keeps scholarly claims accountable.",
      note: "Revised synthesis",
      evidence: [{ annotationId: annotation.id, relation: "extends" }],
    },
  });
  expect(updateResponse.ok()).toBe(true);

  const snapshotResponse = await page.request.get(api);
  const snapshot: unknown = await snapshotResponse.json();
  if (!isWorkspaceSnapshot(snapshot)) throw new Error("Expected a claim snapshot");
  const excerpt = "The preview resolves a link back to";
  const start = snapshot.source.indexOf(excerpt);
  const linkResponse = await page.request.post(`${api}/claim-links`, {
    headers: { origin },
    data: {
      claimId: claim.id,
      fileId: snapshot.entryFileId,
      start,
      end: start + excerpt.length,
      excerpt,
      sourceRevision: snapshot.revision,
    },
  });
  expect(linkResponse.status()).toBe(201);

  const rejectedUpdate = await page.request.put(`${api}/claims/${claim.id}`, {
    headers: { origin },
    data: {
      text: "This update must roll back.",
      note: "",
      evidence: [{ annotationId: crypto.randomUUID(), relation: "supports" }],
    },
  });
  expect(rejectedUpdate.status()).toBe(400);
  const afterRejected: unknown = await (await page.request.get(api)).json();
  if (!isWorkspaceSnapshot(afterRejected)) throw new Error("Expected an unchanged claim snapshot");
  expect(afterRejected.claims).toMatchObject([
    { id: claim.id, text: "Inspectable evidence keeps scholarly claims accountable.", note: "Revised synthesis" },
  ]);
  expect(afterRejected.claimEvidenceLinks).toMatchObject([{ claimId: claim.id, annotationId: annotation.id, relation: "extends" }]);
  expect(afterRejected.claimLinks).toMatchObject([{ claimId: claim.id, anchor: { exact: excerpt } }]);

  const deleteResponse = await page.request.delete(`${api}/claims/${claim.id}`, { headers: { origin } });
  expect(deleteResponse.status()).toBe(204);
  const afterDelete: unknown = await (await page.request.get(api)).json();
  if (!isWorkspaceSnapshot(afterDelete)) throw new Error("Expected a post-delete snapshot");
  expect(afterDelete.annotations).toHaveLength(1);
  expect(afterDelete.claims).toEqual([]);
  expect(afterDelete.claimEvidenceLinks).toEqual([]);
  expect(afterDelete.claimLinks).toEqual([]);
});

test("selects the explicit local companion connection", async ({ page }) => {
  await page.goto("/");
  await openWritingAssistant(page, true);
  await page.locator("#llm-connection").selectOption("companion");
  await expect(page.locator("#llm-endpoint")).toHaveValue("http://127.0.0.1:8790/v1/chat/completions");
  await expect(page.locator("#model-status")).toContainText("npm run model:companion");
  await page.locator("#llm-connection").selectOption("direct");
  await expect(page.locator("#llm-endpoint")).toHaveValue("http://127.0.0.1:1234/v1/chat/completions");
});

test("rejects a delayed model candidate after a concurrent manuscript edit", async ({ page, context }) => {
  const origin = "http://127.0.0.1:8788";
  const workspaceId = await createWorkspace(page, "Stale model boundary");
  const api = `/api/workspaces/${workspaceId}`;
  const pdfResponse = await page.request.post(`${api}/pdfs`, {
    headers: { origin, "content-type": "application/pdf", "x-file-name": "model-evidence.pdf" },
    data: createEvidencePdf(),
  });
  const pdf: unknown = await pdfResponse.json();
  if (!isRecord(pdf) || typeof pdf.id !== "string") throw new Error("Expected an imported PDF");
  const annotationResponse = await page.request.post(`${api}/annotations`, {
    headers: { origin },
    data: {
      pdfId: pdf.id,
      page: 1,
      quote: "Knowledge grows through inspectable evidence.",
      prefix: "",
      suffix: "",
      comment: "Model grounding",
      rects: [],
    },
  });
  expect(annotationResponse.status()).toBe(201);

  let markLlmRequested = (): void => undefined;
  const llmRequested = new Promise<void>((resolve) => {
    markLlmRequested = resolve;
  });
  let releaseLlm = (): void => undefined;
  const waitForLlmRelease = new Promise<void>((resolve) => {
    releaseLlm = resolve;
  });
  await page.route("http://127.0.0.1:1234/v1/chat/completions", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
      return;
    }
    markLlmRequested();
    await waitForLlmRelease;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        choices: [{ message: { content: "This stale replacement must not be stored." } }],
      }),
    });
  });

  const path = `/workspaces/${workspaceId}`;
  await page.goto(path);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  await expect(page.locator("#annotation-list")).toContainText("Model grounding");
  const editor = page.locator("#source-editor");
  const baseSource = "## Model boundary {#model-boundary}\n\nThis paragraph is grounded in visible evidence.\n";
  await editor.fill(baseSource);
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(baseSource);
  const baseSnapshot = await readWorkspaceSnapshot(page, api);

  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.locator("#source-editor")).toHaveValue(baseSource);

  await editor.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf("This paragraph");
    element.focus();
    element.setSelectionRange(start, start + "This paragraph is grounded in visible evidence.".length);
  });
  await openResearchCollection(page, "Highlights");
  await page.locator("[data-annotation-id]").first().check();
  await openWritingAssistant(page, true);
  await page.locator("#llm-endpoint").fill("http://127.0.0.1:1234/v1/chat/completions");
  await page.locator("#llm-model").fill("delayed-local-model");
  await expect(page.getByRole("button", { name: "Draft revision" })).toBeEnabled();
  await page.getByRole("button", { name: "Draft revision" }).click();
  await llmRequested;

  const concurrentSource = `${baseSource}\nA collaborator changes the manuscript while the model is thinking.\n`;
  await collaborator.locator("#source-editor").fill(concurrentSource);
  await expect(editor).toHaveValue(concurrentSource);
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(concurrentSource);
  const concurrentSnapshot = await readWorkspaceSnapshot(page, api);
  expect(concurrentSnapshot.revision).toBeGreaterThan(baseSnapshot.revision);
  await expect(page.locator("#revision-badge")).toHaveText(`r${concurrentSnapshot.revision}`);

  const candidateResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `${api}/candidates` && response.request().method() === "POST",
  );
  releaseLlm();
  expect((await candidateResponse).status()).toBe(409);
  await expect(page.locator("#model-status")).toContainText(/stale|changed/iu);
  await expect(page.locator("#candidate-list article")).toHaveCount(0);
  await expect(page.locator("#candidate-list")).toContainText("Drafts open in Context");
  const finalSnapshot = await readWorkspaceSnapshot(page, api);
  expect(finalSnapshot.candidates).toEqual([]);
  expect(finalSnapshot.source).toBe(concurrentSource);
  await collaborator.close();
});

test("moves evidence from PDF annotation through reviewed model prose", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Evidence to prose loop");
  const api = `/api/workspaces/${workspaceId}`;
  const modelRequests: unknown[] = [];
  const decisionRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith(`${api}/candidates/`) && /\/(?:apply|reject)$/u.test(path)) decisionRequests.push(path);
  });
  await page.route("http://127.0.0.1:1234/v1/chat/completions", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
      return;
    }
    modelRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: "Grounded revisions retain a visible path to their evidence :cite[merton1942].",
            },
          },
        ],
      }),
    });
  });

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible({ timeout: 10_000 });
  const initialSource =
    "## Evidence becomes prose {#sec-evidence}\n\nKirjolab keeps the path from an annotation to a claim and into cited prose visible :cite[merton1942].\n\n## Return to the source {#sec-source}\n\nThe preview resolves a link back to :ref[sec-evidence].\n";
  await page.locator("#source-editor").fill(initialSource);
  await expect(page.locator("#revision-badge")).not.toHaveText("r0");

  await page.locator("#pdf-upload").setInputFiles({
    name: "evidence.pdf",
    mimeType: "application/pdf",
    buffer: createEvidencePdf(),
  });
  await expect(page.locator("#pdf-list")).toContainText("evidence.pdf");

  const editor = page.locator("#source-editor");
  await editor.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf("Kirjolab keeps");
    element.focus();
    element.setSelectionRange(start, start + "Kirjolab keeps the path".length);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });

  await page.locator("#pdf-list button[data-pdf-id]").first().click();
  await expect(page.locator("#context-preview-panel")).toBeHidden();
  await expect(page.locator("#context-pdf-panel")).toBeVisible();
  await expect(page.getByRole("tab", { name: "evidence.pdf" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#paper-status")).toHaveText("Select text to capture evidence");
  await page.locator("#paper-text-layer").evaluate((layer) => {
    const span = layer.querySelector("span");
    if (!span?.firstChild) throw new Error("Expected rendered PDF text");
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    layer.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await expect(page.locator("#annotation-quote")).toHaveValue("Knowledge grows through inspectable evidence.");
  await expect(page.locator("#annotation-selection-status")).toContainText("saved automatically");
  await page.locator("#annotation-comment").fill("Grounding for the revision");
  await page.getByRole("button", { name: "Link highlight to selection" }).click();
  await expect(page.locator("#annotation-list")).toContainText("Knowledge grows through inspectable evidence.");
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).links.length).toBeGreaterThan(0);

  const annotationCard = page.locator("#annotation-list article").filter({ hasText: "Knowledge grows" }).first();

  const snapshotAfterLink = await page.request.get(api);
  expect(snapshotAfterLink.ok()).toBe(true);
  const linkedSnapshot: unknown = await snapshotAfterLink.json();
  expect(isWorkspaceSnapshot(linkedSnapshot) ? linkedSnapshot.links.length : 0).toBeGreaterThan(0);

  await openResearchCollection(page, "Claims");
  await page.getByRole("button", { name: "New claim" }).click();
  await page.locator("#claim-text").fill("Inspectable evidence strengthens scholarly claims.");
  await page.locator("#claim-note").fill("Human-authored synthesis");
  await page.locator('#claim-evidence-options input[type="checkbox"]').first().check();
  await page.locator("#claim-dialog").getByRole("button", { name: "Save claim" }).click();
  await expect(page.locator("#claim-list")).toContainText("Inspectable evidence strengthens scholarly claims.");
  await expect(page.locator("#knowledge-connection-list")).toContainText("supports");

  await page
    .locator("#claim-list article")
    .filter({ hasText: "Inspectable evidence strengthens scholarly claims." })
    .first()
    .getByRole("button", { name: "Edit" })
    .click();
  await page.locator("#claim-text").fill("Inspectable evidence keeps scholarly claims accountable.");
  await page.locator("#claim-note").fill("Revised human synthesis");
  await page.locator("#claim-relation").selectOption("extends");
  await page.locator("#claim-dialog").getByRole("button", { name: "Save claim" }).click();
  const claimCard = page.locator("#claim-list article").filter({ hasText: "keeps scholarly claims accountable" }).first();
  await expect(claimCard).toContainText("extends · Grounding for the revision");
  const claimResourceId = await claimCard.getAttribute("data-claim-resource-id");
  if (!claimResourceId) throw new Error("Expected a stable claim resource id");

  await page.getByRole("button", { name: "New claim" }).click();
  await page.locator("#claim-text").fill("UNSELECTED DECOY EVIDENCE MUST STAY LOCAL.");
  await page.locator("#claim-note").fill("This claim must not enter the model request.");
  await page.locator('#claim-evidence-options input[type="checkbox"]').first().check();
  await page.locator("#claim-dialog").getByRole("button", { name: "Save claim" }).click();
  await expect(page.locator("#claim-list")).toContainText("UNSELECTED DECOY EVIDENCE MUST STAY LOCAL.");

  await editor.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf("into cited prose");
    element.focus();
    element.setSelectionRange(start, start + "into cited prose".length);
  });
  await claimCard.getByRole("button", { name: "Link selected prose" }).click();
  await expect(claimCard.getByRole("button", { name: "Open linked passage" })).toBeVisible();

  await page.locator("#knowledge-search-input").fill("human synthesis accountable");
  await page.locator("#knowledge-search-form").getByRole("button", { name: "Search" }).click();
  await expect(page.locator("#knowledge-search-results")).toContainText("Inspectable evidence keeps scholarly claims accountable.");

  await page.locator("#knowledge-search-input").fill("Grounding revision");
  await page.locator("#knowledge-search-form").getByRole("button", { name: "Search" }).click();
  await expect(page.locator("#knowledge-search-results")).toContainText("Grounding for the revision");
  await expect(page.locator("#knowledge-connection-list")).toContainText("annotates");
  await expect(page.locator("#knowledge-connection-list")).toContainText("used-in");

  const searchResponse = await page.request.get(`${api}/search?q=inspectable%20evidence`);
  const searchResults: unknown = await searchResponse.json();
  expect(searchResponse.ok()).toBe(true);
  expect(isKnowledgeSearchResults(searchResults)).toBe(true);
  const graphResponse = await page.request.get(`${api}/graph`);
  const graph: unknown = await graphResponse.json();
  expect(graphResponse.ok()).toBe(true);
  expect(isWorkspaceKnowledgeGraph(graph)).toBe(true);
  if (!isWorkspaceKnowledgeGraph(graph)) throw new Error("Expected a typed workspace graph");
  expect(graph.nodes).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: "project" }), expect.objectContaining({ kind: "person" })]),
  );
  expect(graph.edges).toEqual(
    expect.arrayContaining([expect.objectContaining({ relation: "contains" }), expect.objectContaining({ relation: "participates-in" })]),
  );

  await page.locator("#knowledge-search-input").fill("");
  await page.locator("#knowledge-search-form").getByRole("button", { name: "Search" }).click();
  await claimCard.getByRole("button", { name: "Open linked passage" }).click();
  await expect(editor).toBeFocused();

  await openResearchCollection(page, "Highlights");
  await annotationCard.getByRole("button", { name: "Open evidence" }).click();
  await expect(page.locator("#paper-highlights .pdf-highlight[data-focused='true']")).toBeVisible();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.locator("#context-preview-panel")).toBeVisible();
  await expect(page.locator("#context-pdf-panel")).toBeHidden();
  await page.getByRole("tab", { name: "evidence.pdf" }).click();
  await expect(page.locator("#paper-highlights .pdf-highlight[data-focused='true']")).toBeVisible();
  await annotationCard.getByRole("button", { name: "Open linked passage" }).click();
  await expect(editor).toBeFocused();

  await page.getByRole("checkbox", { name: /Use annotation .*Knowledge grows through inspectable evidence/iu }).check();
  await page.getByRole("checkbox", { name: /Use claim .*keeps scholarly claims accountable/iu }).check();
  await expect(page.getByRole("checkbox", { name: /Use claim .*UNSELECTED DECOY/iu })).not.toBeChecked();
  const selectedPassage = "Kirjolab keeps the path from an annotation to a claim and into cited prose visible :cite[merton1942].";
  await editor.evaluate((element: HTMLTextAreaElement, passage: string) => {
    const start = element.value.indexOf("Kirjolab keeps");
    element.focus();
    element.setSelectionRange(start, start + passage.length);
  }, selectedPassage);
  await openWritingAssistant(page, true);
  await page.locator("#llm-endpoint").fill("http://127.0.0.1:1234/v1/chat/completions");
  await page.locator("#llm-model").fill("test-local-model");
  const sourceBeforeDraft = await editor.inputValue();
  await page.getByRole("button", { name: "Draft revision" }).click();

  await expect(page.locator("#model-status")).toHaveText("Candidate ready. Review its exact replacement and evidence in Context.");
  await expect.poll(() => modelRequests.length).toBe(1);
  const firstPrompt = readProviderPrompt(modelRequests[0]);
  expect(firstPrompt).toEqual({
    selectedPassage,
    instruction: "Improve clarity while preserving the claim and citation syntax.",
    orderedEvidence: [
      {
        order: 1,
        kind: "annotation",
        id: expect.any(String),
        label: "PDF annotation on page 1",
        content: expect.stringContaining("Knowledge grows through inspectable evidence"),
      },
      {
        order: 2,
        kind: "claim",
        id: expect.any(String),
        label: "Researcher-authored claim",
        content: expect.stringContaining("Inspectable evidence keeps scholarly claims accountable"),
      },
    ],
  });
  expect(JSON.stringify(firstPrompt)).not.toContain("UNSELECTED DECOY");
  expect(JSON.stringify(firstPrompt)).not.toContain("Return to the source");
  await expect(page.locator("#candidate-list")).toContainText("test-local-model · pending");
  await expect(page.locator("#knowledge-connection-list")).toContainText("derived-from");
  const candidateGraphValue: unknown = await (await page.request.get(`${api}/graph`)).json();
  if (!isWorkspaceKnowledgeGraph(candidateGraphValue)) throw new Error("Expected model candidate graph provenance");
  expect(candidateGraphValue.nodes).toContainEqual(expect.objectContaining({ kind: "model-candidate" }));
  expect(candidateGraphValue.edges).toContainEqual(
    expect.objectContaining({ relation: "derived-from", from: expect.stringMatching(/^model-candidate:/u) }),
  );
  await expect(page.locator("#context-candidate-panel")).toBeVisible();
  await expect(page.locator("#context-candidate-before")).toContainText("Kirjolab keeps the path");
  await expect(page.locator("#context-candidate-after")).toHaveText(
    "Grounded revisions retain a visible path to their evidence :cite[merton1942].",
  );
  await expect(page.locator("#context-candidate-evidence")).toContainText("Grounding for the revision");
  await expect(editor).toHaveValue(sourceBeforeDraft);
  await page.getByRole("button", { name: "Reject revision" }).dblclick();
  await expect(page.locator("#context-candidate-status")).toContainText("Rejected");
  await expect(page.getByRole("tab", { name: "Writing assistant" })).toBeFocused();
  await expect(editor).toHaveValue(sourceBeforeDraft);
  expect(decisionRequests.filter((path) => path.endsWith("/reject"))).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Draft revision" })).toBeEnabled();
  await page.getByRole("button", { name: "Draft revision" }).click();
  await expect(page.locator("#model-status")).toHaveText("Candidate ready. Review its exact replacement and evidence in Context.");
  await expect.poll(() => modelRequests.length).toBe(2);
  expect(readProviderPrompt(modelRequests[1])).toEqual(firstPrompt);
  await expect(page.locator("#context-candidate-status")).toContainText("Pending review");
  await expect(editor).toHaveValue(sourceBeforeDraft);
  await page.getByRole("button", { name: "Apply replacement" }).click();
  const expectedAppliedSource = sourceBeforeDraft.replace(
    selectedPassage,
    "Grounded revisions retain a visible path to their evidence :cite[merton1942].",
  );
  await expect(editor).toHaveValue(expectedAppliedSource);
  await expect(page.locator("#preview")).toContainText("Grounded revisions retain a visible path");
  await expect(page.locator("#context-candidate-status")).toContainText("Accepted");
  page.once("dialog", (dialog) => void dialog.accept());
  await claimCard.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(`[data-claim-resource-id="${claimResourceId}"]`)).toHaveCount(0);
  await expect(page.locator("#annotation-list")).toContainText("Grounding for the revision");
  await expect(page.locator("#context-candidate-evidence")).toContainText("keeps scholarly claims accountable");

  const currentSnapshot: unknown = await (await page.request.get(api)).json();
  if (!isWorkspaceSnapshot(currentSnapshot)) throw new Error("Expected a workspace snapshot");
  const staleEvidence = currentSnapshot.annotations[0];
  if (!staleEvidence) throw new Error("Expected model evidence for the stale candidate");
  const staleExcerpt = "## Evidence becomes prose {#sec-evidence}";
  const staleStart = currentSnapshot.source.indexOf(staleExcerpt);
  const staleCandidateResponse = await page.request.post(`${api}/candidates`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {
      providerAdapter: "openai-compatible",
      providerLabel: "Browser-local test provider",
      model: "stale-model",
      promptVersion: "revise-selection-v1",
      instruction: "Propose a stale replacement.",
      target: {
        fileId: currentSnapshot.entryFileId,
        start: staleStart,
        end: staleStart + staleExcerpt.length,
        excerpt: staleExcerpt,
        sourceRevision: currentSnapshot.revision,
      },
      evidence: [{ kind: "annotation", id: staleEvidence.id, version: staleEvidence.updatedAt }],
      proposedReplacement: "## This candidate must not apply",
    },
  });
  expect(staleCandidateResponse.ok()).toBe(true);
  const staleCandidate: unknown = await staleCandidateResponse.json();
  if (!isRecord(staleCandidate) || typeof staleCandidate.id !== "string") throw new Error("Expected a model candidate");
  await page.reload();
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();
  await openWritingAssistant(page);
  const staleCard = page.locator("#candidate-list article").filter({ hasText: "stale-model · pending" }).first();
  await staleCard.getByRole("button", { name: "Open review" }).click();
  await expect(page.locator("#context-candidate-status")).toContainText("Pending review");
  const sourceBeforeStaleEdit = await editor.inputValue();
  const sourceAfterStaleEdit = `${sourceBeforeStaleEdit}\nA newer writer edit.\n`;
  await editor.fill(sourceAfterStaleEdit);
  await expect
    .poll(async () => {
      const value: unknown = await (await page.request.get(api)).json();
      return isWorkspaceSnapshot(value) ? value.revision : -1;
    })
    .toBeGreaterThan(currentSnapshot.revision);
  await expect(page.locator("#context-candidate-status")).toContainText("Pending but stale");
  await expect(page.getByRole("button", { name: "Apply replacement" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reject revision" })).toBeEnabled();
  await page.getByRole("button", { name: "Reject revision" }).click();
  await expect(page.locator("#context-candidate-status")).toContainText("Rejected");
  await expect(editor).toHaveValue(sourceAfterStaleEdit);

  const bibliography = await page.request.get(`${api}/export/bibliography.bib`);
  expect(bibliography.ok()).toBe(true);
  expect(await bibliography.text()).toContain("@article{merton1942");
});

test("serves stable health and browser assets", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    name: "kirjolab",
    routes: ["/", "/workspaces/:id", "/api/workspaces", "/api/workspaces/demo", "/api/session", "/api/health"],
  });

  const [styles, client] = await Promise.all([request.get("/styles.css"), request.get("/app.js")]);
  expect(styles.ok(), await styles.text()).toBe(true);
  expect(client.ok(), await client.text()).toBe(true);
  expect(styles.headers()["content-type"]).toContain("text/css");
  expect(client.headers()["content-type"]).toContain("text/javascript");

  const satteriWasm = await request.get("/satteri_napi.wasm32-wasi.wasm");
  expect(satteriWasm.ok()).toBe(true);
  expect(satteriWasm.headers()["content-type"]).toContain("application/wasm");
  expect(satteriWasm.headers()["cross-origin-resource-policy"]).toBe("same-origin");

  const satteriWorker = await request.get("/satteri-wasi-worker.mjs");
  expect(satteriWorker.ok()).toBe(true);
  expect(satteriWorker.headers()["content-type"]).toContain("javascript");
  expect(await satteriWorker.text()).toContain("MessageHandler");
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProviderPrompt(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !Array.isArray(value.messages)) throw new Error("Expected an OpenAI-compatible request");
  const userMessage = value.messages.find((message) => isRecord(message) && message.role === "user");
  if (!isRecord(userMessage) || typeof userMessage.content !== "string") throw new Error("Expected a provider user message");
  const prompt: unknown = JSON.parse(userMessage.content);
  if (!isRecord(prompt)) throw new Error("Expected a structured provider prompt");
  return prompt;
}

async function createWorkspace(page: Page, title: string): Promise<string> {
  const response = await page.request.post("/api/workspaces", {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { title },
  });
  expect(response.status()).toBe(201);
  const workspace: unknown = await response.json();
  if (!isRecord(workspace) || typeof workspace.id !== "string") throw new Error("Expected a created workspace");
  return workspace.id;
}

async function readWorkspaceSnapshot(page: Page, api: string) {
  const response = await page.request.get(api);
  expect(response.ok()).toBe(true);
  const value: unknown = await response.json();
  if (!isWorkspaceSnapshot(value)) throw new Error("Expected a workspace snapshot");
  return value;
}

interface ExpectedPassageAnchor {
  exact: string;
  originalRange: { start: number; end: number };
  anchoredRevision: number;
}

function expectPassageAnchor(link: unknown, expected: ExpectedPassageAnchor): void {
  if (!isRecord(link) || !isRecord(link.anchor)) throw new Error("Expected a passage anchor selector");
  expect(link.anchor).toMatchObject({ version: 1, ...expected });
  expect(link.anchor.relativeStart).toMatch(/^[A-Za-z0-9_-]+$/u);
  expect(link.anchor.relativeEnd).toMatch(/^[A-Za-z0-9_-]+$/u);
}

function readPassageResolution(link: unknown): Record<string, unknown> {
  if (!isRecord(link) || !isRecord(link.resolution)) throw new Error("Expected a passage anchor resolution");
  return link.resolution;
}

function expectResolvedPassage(link: unknown, start: number, text: string): void {
  expect(readPassageResolution(link)).toMatchObject({
    status: "resolved",
    start,
    end: start + text.length,
    text,
    exactMatch: true,
  });
}

async function expectEditorSelection(editor: Locator, start: number, text: string): Promise<void> {
  await expect
    .poll(
      async () =>
        await editor.evaluate((element: HTMLTextAreaElement) => ({
          start: element.selectionStart,
          end: element.selectionEnd,
          text: element.value.slice(element.selectionStart, element.selectionEnd),
        })),
    )
    .toEqual({ start, end: start + text.length, text });
}

async function openResearchCollection(page: Page, name: string): Promise<void> {
  const collection = page.locator(".rail-collection").filter({ has: page.getByText(name, { exact: true }) });
  await collection.evaluate((element: HTMLDetailsElement) => {
    element.open = true;
  });
}

async function openWritingAssistant(page: Page, includeSettings = false): Promise<void> {
  await page.getByRole("tab", { name: "Writing assistant" }).click();
  await expect(page.locator("#context-assistant-panel")).toBeVisible();
  if (includeSettings) {
    await page.locator("#assistant-model-settings").evaluate((element: HTMLDetailsElement) => {
      element.open = true;
    });
  }
}

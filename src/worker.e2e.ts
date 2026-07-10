import { expect, test } from "@playwright/test";
import { isWorkspaceSnapshot, isWorkspaceSummaries } from "./domain/workspace";
import { createEvidencePdf } from "./test-support/pdf-fixture";

test("opens a live WYSIWYM scholarly workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "KIRJOLAB" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Evidence" })).toBeVisible();
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.locator("#source-editor")).toHaveValue(/## Evidence becomes prose/);
  await expect(page.locator("#preview")).toContainText("Merton, 1942");
  await expect(page.locator("#diagnostic-summary")).toHaveText("No syntax errors");

  const source = await page.locator("#source-editor").inputValue();
  await page
    .locator("#source-editor")
    .fill(
      `${source.trimEnd()}\n\nA live collaborative note.[^live]\n\n| State | Result |\n| --- | --- |\n| Shared | **Visible** |\n\n[^live]: Rendered by Satteri.\n`,
    );
  await expect(page.locator("#preview")).toContainText("A live collaborative note.");
  await expect(page.locator("#preview table")).toContainText("Visible");
  await expect(page.locator("#preview .footnotes")).toContainText("Rendered by Satteri");
  await expect(page.locator("#preview .section-number").first()).toBeVisible();
  await expect(page.locator("#revision-badge")).not.toHaveText("r0");

  const exported = await page.request.get("/api/workspaces/demo/export/document.md");
  expect(exported.ok()).toBe(true);
  expect(exported.headers()["content-disposition"]).toContain("kirjolab-document.md");
  expect(await exported.text()).toContain("A live collaborative note.");
});

test("converges source edits across two writers", async ({ page, context }) => {
  const collaborator = await context.newPage();
  await Promise.all([page.goto("/"), collaborator.goto("/")]);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();

  const sharedSource = "## Shared evidence {#shared-evidence}\n\nThe first writer contributes a claim.\n";
  await page.locator("#source-editor").fill(sharedSource);
  await expect(collaborator.locator("#source-editor")).toHaveValue(sharedSource);

  const expandedSource = `${sharedSource}\nThe second writer connects the evidence.\n`;
  await collaborator.locator("#source-editor").fill(expandedSource);
  await expect(page.locator("#source-editor")).toHaveValue(expandedSource);
  await collaborator.close();
});

test("creates, shares, and navigates isolated workspaces", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.locator("#new-workspace-title").fill("Independent inquiry");
  await page.locator("#new-workspace-dialog").getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}$/u);

  const workspaceId = new URL(page.url()).pathname.split("/").at(-1);
  if (!workspaceId) throw new Error("Expected a workspace id");
  await expect(page.locator("#workspace-switcher")).toHaveValue(workspaceId);
  await expect(page.locator("#workspace-title")).toHaveText("Independent inquiry");
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();

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

test("imports BibTeX into stable publication resources", async ({ page }) => {
  await page.goto("/");
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

  const response = await page.request.get("/api/workspaces/demo");
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
  const updatedResponse = await page.request.get("/api/workspaces/demo");
  const updatedValue: unknown = await updatedResponse.json();
  const updated = isWorkspaceSnapshot(updatedValue)
    ? updatedValue.publications.find((publication) => publication.citationKey === "Inspectable2026")
    : undefined;
  expect(updated?.id).toBe(imported?.id);
});

test("moves evidence from PDF annotation through reviewed model prose", async ({ page }) => {
  await page.route("http://model.local/v1/chat/completions", async (route) => {
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        choices: [
          {
            message: {
              content:
                "## Evidence becomes prose {#sec-evidence}\n\nGrounded revisions retain a visible path to their evidence :cite[merton1942].\n\n## Return to the source {#sec-source}\n\nThe accepted candidate remains portable Markdown.\n",
            },
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();
  await page
    .locator("#source-editor")
    .fill(
      "## Evidence becomes prose {#sec-evidence}\n\nKirjolab keeps the path from an annotation to a claim and into cited prose visible :cite[merton1942].\n\n## Return to the source {#sec-source}\n\nThe preview resolves a link back to :ref[sec-evidence].\n",
    );
  await expect(page.locator("#revision-badge")).not.toHaveText("r0");

  await page.locator("#pdf-upload").setInputFiles({
    name: "evidence.pdf",
    mimeType: "application/pdf",
    buffer: createEvidencePdf(),
  });
  await expect(page.locator("#pdf-list")).toContainText("evidence.pdf");

  await page.locator("#pdf-list button[data-pdf-id]").first().click();
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
  await expect(page.locator("#annotation-selection-status")).toContainText("Captured 1 fragment from page 1");
  await page.getByRole("button", { name: "Close" }).click();
  await page.locator("#annotation-comment").fill("Grounding for the revision");
  await page.getByRole("button", { name: "Save evidence annotation" }).click();
  await expect(page.locator("#annotation-list")).toContainText("Knowledge grows through inspectable evidence.");

  const annotationCard = page.locator("#annotation-list article").filter({ hasText: "Knowledge grows" }).first();
  const editor = page.locator("#source-editor");
  await editor.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf("Kirjolab keeps");
    element.focus();
    element.setSelectionRange(start, start + "Kirjolab keeps the path".length);
  });
  await annotationCard.getByRole("button", { name: "Link selected manuscript text" }).click();

  const snapshotAfterLink = await page.request.get("/api/workspaces/demo");
  expect(snapshotAfterLink.ok()).toBe(true);
  const linkedSnapshot: unknown = await snapshotAfterLink.json();
  expect(isWorkspaceSnapshot(linkedSnapshot) ? linkedSnapshot.links.length : 0).toBeGreaterThan(0);

  await annotationCard.getByRole("button", { name: "Open evidence" }).click();
  await expect(page.locator("#paper-highlights .pdf-highlight[data-focused='true']")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await annotationCard.getByRole("button", { name: "Open linked passage" }).click();
  await expect(editor).toBeFocused();

  await annotationCard.locator('input[type="checkbox"]').check();
  await editor.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf("Kirjolab keeps");
    element.focus();
    element.setSelectionRange(start, start + "Kirjolab keeps the path from an annotation to a claim and into cited prose visible".length);
  });
  await page.locator("#llm-endpoint").fill("http://model.local/v1/chat/completions");
  await page.locator("#llm-model").fill("test-local-model");
  await page.getByRole("button", { name: "Draft revision" }).click();

  await expect(page.locator("#model-status")).toHaveText("Candidate ready. Inspect it before applying.");
  await expect(page.locator("#candidate-list")).toContainText("test-local-model · pending");
  await page.getByRole("button", { name: "Apply candidate" }).first().click();
  await expect(editor).toHaveValue(/Grounded revisions retain a visible path/);
  await expect(page.locator("#preview")).toContainText("The accepted candidate remains portable Markdown.");

  const currentSnapshot: unknown = await (await page.request.get("/api/workspaces/demo")).json();
  if (!isWorkspaceSnapshot(currentSnapshot)) throw new Error("Expected a workspace snapshot");
  const staleCandidateResponse = await page.request.post("/api/workspaces/demo/candidates", {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {
      provider: "test",
      model: "stale-model",
      sourceRevision: currentSnapshot.revision,
      sourceIds: [],
      proposedSource: "## This candidate must not apply\n",
    },
  });
  expect(staleCandidateResponse.ok()).toBe(true);
  const staleCandidate: unknown = await staleCandidateResponse.json();
  if (!isRecord(staleCandidate) || typeof staleCandidate.id !== "string") throw new Error("Expected a model candidate");
  await editor.fill(`${await editor.inputValue()}\nA newer writer edit.\n`);
  await expect
    .poll(async () => {
      const value: unknown = await (await page.request.get("/api/workspaces/demo")).json();
      return isWorkspaceSnapshot(value) ? value.revision : -1;
    })
    .toBeGreaterThan(currentSnapshot.revision);
  const staleApply = await page.request.post(`/api/workspaces/demo/candidates/${staleCandidate.id}/apply`, {
    headers: { origin: "http://127.0.0.1:8788" },
  });
  expect(staleApply.status()).toBe(409);

  const bibliography = await page.request.get("/api/workspaces/demo/export/bibliography.bib");
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

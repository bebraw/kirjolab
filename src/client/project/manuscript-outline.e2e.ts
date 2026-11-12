import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { isRecord } from "../../domain/unknown-value";

const origin = "http://127.0.0.1:8788";
const modelEndpoint = "http://127.0.0.1:1234/v1/chat/completions";
const introduction = "This study reports a useful finding. We describe its scope.";
const method = "We sampled registered trials. Duplicate registrations were excluded.";
const findings = "The comparison covers two intervention designs. The differences are descriptive.";
const manuscript = `# Study\n\n${introduction}\n\n## Sampling\n\n${method}\n\n## Findings\n\n${findings}\n`;

async function createWorkspace(page: Page): Promise<string> {
  const response = await page.request.post("/api/workspaces", { headers: { origin }, data: { title: "Outline browser review" } });
  expect(response.status()).toBe(201);
  const value: unknown = await response.json();
  if (!isRecord(value) || typeof value.id !== "string") throw new Error("Expected a created workspace");
  return value.id;
}

async function openOutline(page: Page, workspaceId: string, source = manuscript): Promise<Locator> {
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/u)).toBeVisible();
  const editor = page.locator("#source-editor");
  await editor.fill(source);
  await page.getByRole("tab", { name: "Outline & hints" }).click();
  await expect(page.getByRole("navigation", { name: "Manuscript outline" })).toBeVisible();
  return editor;
}

async function placeCaret(editor: Locator, text: string): Promise<number> {
  return editor.evaluate((element: HTMLTextAreaElement, passage) => {
    const offset = element.value.indexOf(passage);
    if (offset < 0) throw new Error("Expected the passage in the source editor");
    element.focus();
    element.setSelectionRange(offset, offset);
    element.dispatchEvent(new Event("select", { bubbles: true }));
    return offset;
  }, text);
}

async function selectedText(editor: Locator): Promise<string> {
  return editor.evaluate((element: HTMLTextAreaElement) => element.value.slice(element.selectionStart, element.selectionEnd));
}

async function configureModel(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "kirjolab:model-preferences",
      JSON.stringify({
        connection: "direct",
        endpoint: "http://127.0.0.1:1234/v1/chat/completions",
        model: "outline-test-model",
        reasoningEffort: "none",
      }),
    );
  });
}

async function respondToModel(route: Route, purpose: string): Promise<void> {
  await route.fulfill({
    status: 200,
    headers: { "access-control-allow-origin": "*" },
    json: { choices: [{ message: { content: JSON.stringify({ purpose, hints: ["Consider identifying the registration period."] }) } }] },
  });
}

async function preflight(route: Route): Promise<boolean> {
  if (route.request().method() !== "OPTIONS") return false;
  await route.fulfill({
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
  return true;
}

test("keeps a nested outline beside writing and scopes hints to the caret", async ({ page }) => {
  const editor = await openOutline(page, await createWorkspace(page));
  const outline = page.getByRole("navigation", { name: "Manuscript outline" });
  const methodButton = outline.getByRole("button", { name: `Paragraph 2 ${method}` });
  const guidance = page.locator(".outline-analysis");
  await expect(page.getByLabel("AI paragraph guidance", { exact: true })).not.toBeChecked();
  await expect(guidance).toContainText(
    "Connect a writing model to get AI purpose summaries and suggestions. The outline and local hints work without one.",
  );
  await guidance.getByRole("button", { name: "Connection settings", exact: true }).click();
  await expect(page.locator("#preferences-menu")).toHaveAttribute("open", "");
  await expect(page.locator("#llm-connection")).toBeFocused();
  await page.locator("#preferences-menu > summary").click();
  await expect(page.getByLabel("AI paragraph guidance", { exact: true })).not.toBeChecked();
  await expect(outline.locator("ol > li").first()).toContainText("Sampling");
  const [editorBounds, outlineBounds] = await Promise.all([editor.boundingBox(), outline.boundingBox()]);
  expect(editorBounds).not.toBeNull();
  expect(outlineBounds).not.toBeNull();
  expect(outlineBounds!.x).toBeGreaterThan(editorBounds!.x + editorBounds!.width);

  await page.getByLabel("Review purpose", { exact: true }).selectOption("clarity");
  await placeCaret(editor, method);
  await expect(methodButton).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toBeFocused();
  await expect(page.locator("#editing-pass-cues")).toContainText("No clarity hints for this passage.");

  await placeCaret(editor, introduction);
  await expect(editor).toBeFocused();
  await expect(page.locator("#editing-pass-cues")).toContainText("Check whether the opening reference names its subject explicitly");
  await placeCaret(editor, method);
  await page.getByLabel("Whole document").check();
  await expect(page.locator("#editing-pass-cues")).toContainText("Check whether the opening reference names its subject explicitly");

  await outline.getByRole("button", { name: "Collapse Study", exact: true }).click();
  await expect(methodButton).toHaveCount(0);
  await outline.getByRole("button", { name: "Expand Study", exact: true }).click();
  await methodButton.click();
  await expect(editor).toBeFocused();
  expect(await selectedText(editor)).toBe(method);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#show-context-surface").click();
  await expect(outline).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await outline.getByRole("button", { name: `Paragraph 1 ${introduction}` }).click();
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  expect(await selectedText(editor)).toBe(introduction);
});

test("shows full source text only for the active outline paragraph", async ({ page }) => {
  const firstExcerpt = "The study examines how authors revise scientific manuscripts. Each observation keeps its original context. The";
  const secondExcerpt = "The method compares revisions from two writing sessions. Reviewers recorded why each sentence was changed. The";
  const first = `${firstExcerpt} final observation is visible only in the active paragraph.`;
  const second = `${secondExcerpt} comparison remains descriptive and does not rank the authors.`;
  const source = `# Study\n\n${first}\n\n## Method\n\n${second}\n`;
  const editor = await openOutline(page, await createWorkspace(page), source);
  const outline = page.getByRole("navigation", { name: "Manuscript outline" });
  const firstParagraph = outline.getByRole("button", { name: /^Paragraph 1 /u });
  const secondParagraph = outline.getByRole("button", { name: /^Paragraph 2 /u });
  await expect(page.getByText("Paragraph excerpts · The active paragraph is shown in full.", { exact: true })).toBeVisible();

  await placeCaret(editor, first);
  await expect(firstParagraph).toHaveAttribute("aria-pressed", "true");
  await expect(firstParagraph.locator("span")).toHaveText(first);
  await expect(secondParagraph.locator("span")).toHaveText(`${secondExcerpt}…`);
  await expect(editor).toBeFocused();

  const caret = await placeCaret(editor, second);
  await expect(secondParagraph).toHaveAttribute("aria-pressed", "true");
  await expect(secondParagraph.locator("span")).toHaveText(second);
  await expect(firstParagraph.locator("span")).toHaveText(`${firstExcerpt}…`);
  await expect(editor).toBeFocused();
  expect(await editor.evaluate((element: HTMLTextAreaElement) => ({ start: element.selectionStart, end: element.selectionEnd }))).toEqual({
    start: caret,
    end: caret,
  });
  await expect(page.getByLabel("AI paragraph guidance", { exact: true })).not.toBeChecked();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#show-context-surface").click();
  await expect(outline).toBeVisible();
  await expect(secondParagraph.locator("span")).toHaveText(second);
  await expect(firstParagraph.locator("span")).toHaveText(`${firstExcerpt}…`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await secondParagraph.click();
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  expect(await selectedText(editor)).toBe(second);
  await expect(editor).toHaveValue(source);
});

test("navigates an included paragraph to its owning file", async ({ page }) => {
  const workspaceId = await createWorkspace(page);
  const chapter = `## Sampling\n\n${method}\n`;
  const response = await page.request.post(`/api/workspaces/${workspaceId}/files`, {
    headers: { origin },
    data: { path: "chapters/sampling.md", content: chapter },
  });
  expect(response.status()).toBe(201);
  const editor = await openOutline(page, workspaceId, `# Study\n\n${introduction}\n\n::include[chapters/sampling.md]\n`);
  await page
    .getByRole("navigation", { name: "Manuscript outline" })
    .getByRole("button", { name: `Paragraph 2 ${method}` })
    .click();
  await expect(editor).toHaveValue(chapter);
  expect(await selectedText(editor)).toBe(method);
  await expect(editor).toBeFocused();
});

test("keeps collapsed sections closed when prose edits move their source offsets", async ({ page }) => {
  const editor = await openOutline(page, await createWorkspace(page));
  const outline = page.getByRole("navigation", { name: "Manuscript outline" });
  await outline.getByRole("button", { name: "Collapse Sampling", exact: true }).click();
  const revisedMethod = "We sampled prospectively registered trials. Duplicate registrations were excluded.";
  const revisedSource = manuscript
    .replace(introduction, `${introduction} The scope excludes retrospective comparisons.`)
    .replace(method, revisedMethod);
  await editor.fill(revisedSource);
  await expect(outline.getByRole("button", { name: "Expand Sampling", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(outline.getByRole("button", { name: /^Paragraph 2 /u })).toHaveCount(0);
  await expect(outline.getByRole("button", { name: /^Paragraph 3 /u })).toBeVisible();

  await outline.getByRole("button", { name: "Expand Sampling", exact: true }).click();
  await outline.getByRole("button", { name: `Paragraph 2 ${revisedMethod}` }).click();
  expect(await selectedText(editor)).toBe(revisedMethod);
  await expect(editor).toBeFocused();
});

test("follows the reading position by scrolling the outline without changing the active target", async ({ page }) => {
  const paragraphs = Array.from({ length: 24 }, (_, index) =>
    `Passage ${index + 1} describes the sampling decision. Each observation retains its context. `
      .repeat(index === 0 || index === 23 ? 100 : 8)
      .trim(),
  );
  const source = paragraphs.map((paragraph, index) => `## Section ${index + 1}\n\n${paragraph}`).join("\n\n");
  const editor = await openOutline(page, await createWorkspace(page), source);
  const outline = page.getByRole("navigation", { name: "Manuscript outline" });
  const firstParagraph = outline.getByRole("button", { name: /^Paragraph 1 /u });
  const lastParagraph = outline.getByRole("button", { name: /^Paragraph 24 /u });
  const caret = await placeCaret(editor, "Passage 1 describes");
  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(firstParagraph).toHaveAttribute("aria-current", "location");
  await page.getByLabel("Follow reading position", { exact: true }).check();
  await expect
    .poll(async () => {
      const [container, target, text] = await Promise.all([
        outline.boundingBox(),
        firstParagraph.boundingBox(),
        firstParagraph.locator("span").boundingBox(),
      ]);
      return (
        container !== null &&
        target !== null &&
        text !== null &&
        target.height > container.height &&
        target.y >= container.y - 1 &&
        text.y < container.y + container.height - 1
      );
    })
    .toBe(true);
  await editor.focus();
  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });

  await expect(lastParagraph).toHaveAttribute("aria-current", "location");
  await expect.poll(() => outline.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  await expect
    .poll(async () => {
      const [container, target] = await Promise.all([outline.boundingBox(), lastParagraph.boundingBox()]);
      return (
        container !== null &&
        target !== null &&
        target.y >= container.y - 1 &&
        target.y + target.height <= container.y + container.height + 1
      );
    })
    .toBe(true);
  await expect(firstParagraph).toHaveAttribute("aria-pressed", "true");
  await expect(lastParagraph).toHaveAttribute("aria-pressed", "false");
  await expect(editor).toBeFocused();
  expect(await editor.evaluate((element: HTMLTextAreaElement) => ({ start: element.selectionStart, end: element.selectionEnd }))).toEqual({
    start: caret,
    end: caret,
  });
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop)).toBe(0);
});

test("requires AI opt-in, rejects obsolete results, and pauses when its tab is hidden", async ({ page }) => {
  await configureModel(page);
  const requests: unknown[] = [];
  let releaseFirst = (): void => {
    throw new Error("The first analysis request has not started");
  };
  await page.route(modelEndpoint, async (route) => {
    if (await preflight(route)) return;
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      await respondToModel(route, "Obsolete paragraph interpretation.");
    } else {
      const body: unknown = route.request().postDataJSON();
      await respondToModel(
        route,
        isRecord(body) && body.model === "second-outline-model"
          ? "New model interpretation of sampling."
          : "Explains the revised sampling procedure.",
      );
    }
  });
  const workspaceId = await createWorkspace(page);
  const editor = await openOutline(page, workspaceId);
  await placeCaret(editor, method);
  await page.waitForTimeout(1_700);
  expect(requests).toHaveLength(0);
  await page.getByLabel("AI paragraph guidance", { exact: true }).check();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({
    model: "outline-test-model",
    response_format: { json_schema: { name: "kirjolab_paragraph_analysis" } },
    messages: [
      { role: "system", content: expect.stringContaining("untrusted") },
      {
        role: "user",
        content: JSON.stringify({
          selectedPassage: method,
          sectionTitle: "Sampling",
          previousParagraph: introduction,
          nextParagraph: findings,
        }),
      },
    ],
  });

  const revised = "We sampled prospectively registered trials. Duplicate registrations were excluded.";
  await editor.fill(manuscript.replace(method, revised));
  await placeCaret(editor, revised);
  releaseFirst();
  const feedback = page.getByRole("region", { name: "Paragraph purpose" });
  await expect(feedback).not.toContainText("Obsolete paragraph interpretation.");
  await expect(feedback).toContainText("Explains the revised sampling procedure.");
  await expect.poll(() => requests.length).toBe(2);

  const caret = await placeCaret(editor, revised);
  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(1_700);
  expect(requests).toHaveLength(2);
  await expect(editor).toBeFocused();
  expect(await editor.evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBe(caret);

  await page.locator("#preferences-menu > summary").click();
  const model = page.locator("#llm-model");
  await model.evaluate((element: HTMLSelectElement) => element.add(new Option("second-outline-model", "second-outline-model")));
  await model.selectOption("second-outline-model");
  await expect(feedback).not.toContainText("Explains the revised sampling procedure.");
  await page.locator("#preferences-menu > summary").click();
  await expect(feedback).toContainText("New model interpretation of sampling.");
  expect(requests[2]).toMatchObject({ model: "second-outline-model" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#show-authoring-surface").click();
  const mobileRevision = "We sampled recently registered trials. Duplicate registrations were excluded.";
  await editor.fill(manuscript.replace(method, mobileRevision));
  const mobileCaret = await placeCaret(editor, mobileRevision);
  await expect(page.getByRole("navigation", { name: "Manuscript outline" })).toBeHidden();
  await page.waitForTimeout(1_700);
  expect(requests).toHaveLength(3);
  await page.locator("#show-context-surface").click();
  await expect.poll(() => requests.length).toBe(4);
  await expect(feedback).toContainText("New model interpretation of sampling.");
  expect(await editor.evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBe(mobileCaret);
  await page.setViewportSize({ width: 1600, height: 900 });

  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await editor.fill(manuscript);
  await placeCaret(editor, method);
  await page.waitForTimeout(1_700);
  expect(requests).toHaveLength(4);
  await page.getByRole("tab", { name: "Outline & hints" }).click();
  await expect.poll(() => requests.length).toBe(5);
  await expect(page.getByLabel("AI paragraph guidance", { exact: true })).toBeChecked();

  await page.reload();
  await page.getByRole("tab", { name: "Outline & hints" }).click();
  await expect(page.getByLabel("AI paragraph guidance", { exact: true })).not.toBeChecked();
});

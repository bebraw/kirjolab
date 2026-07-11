import { expect, test, type Locator, type Page } from "@playwright/test";
import { isKnowledgeSearchResults, isWorkspaceKnowledgeGraph } from "./domain/knowledge";
import { isWorkspaceSnapshot, isWorkspaceSummaries } from "./domain/workspace";
import { createEvidencePdf } from "./test-support/pdf-fixture";

test("opens a live WYSIWYM scholarly workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "KIRJOLAB" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Evidence" })).toBeVisible();
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.locator("#source-editor")).toHaveValue(/## Evidence becomes prose/);

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

  const exported = await page.request.get("/api/workspaces/demo/export/document.md");
  expect(exported.ok()).toBe(true);
  expect(exported.headers()["content-disposition"]).toContain("kirjolab-document.md");
  expect(await exported.text()).toContain("A live collaborative note cites prior work");
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
  const candidateResponse = await page.request.post(`${api}/candidates`, {
    headers: { origin },
    data: {
      provider: "test",
      model: "anchor-preserving-model",
      sourceRevision: shiftedSnapshot.revision,
      sourceIds: [annotation.id],
      proposedSource: `${candidatePrefix}${shiftedSource}`,
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
    { code: 1003, reason: "Client text frames are not supported" },
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

test("projects collaborative bibliography edits into stable working-memory resources", async ({ page, context }) => {
  const workspaceId = await createWorkspace(page, "Collaborative bibliography projection");
  const api = `/api/workspaces/${workspaceId}`;
  const path = `/workspaces/${workspaceId}`;
  await page.goto(path);
  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();
  await Promise.all([
    page.getByText("Bibliography source", { exact: true }).click(),
    collaborator.getByText("Bibliography source", { exact: true }).click(),
  ]);
  await expect(page.locator("#bibliography-editor")).toBeVisible();
  await expect(collaborator.locator("#bibliography-editor")).toBeVisible();

  const initialBibliography = `@article{collaborative2026,
  author = {Doe, Jane and Researcher, Alex},
  title = {Collaborative Reference Projection},
  year = {2026},
  journal = {Journal of Shared Evidence},
  doi = {https://doi.org/10.5555/Collaborative.2026}
}
`;
  await page.locator("#bibliography-editor").fill(initialBibliography);
  await expect(collaborator.locator("#bibliography-editor")).toHaveValue(initialBibliography);
  await expect(page.locator("#publication-list")).toContainText("Collaborative Reference Projection");
  await expect(collaborator.locator("#publication-list")).toContainText("Collaborative Reference Projection");
  await expect
    .poll(async () => {
      const snapshot = await readWorkspaceSnapshot(page, api);
      return snapshot.publications.find((publication) => publication.citationKey === "collaborative2026");
    })
    .toMatchObject({
      title: "Collaborative Reference Projection",
      authors: ["Doe, Jane", "Researcher, Alex"],
      year: "2026",
      venue: "Journal of Shared Evidence",
      doi: "10.5555/collaborative.2026",
      metadataSource: "bibtex",
    });
  const initialSnapshot = await readWorkspaceSnapshot(page, api);
  const initialPublication = initialSnapshot.publications.find((publication) => publication.citationKey === "collaborative2026");
  if (!initialPublication) throw new Error("Expected a collaboratively projected publication");

  const updatedBibliography = `@article{collaborative2026,
  author = {Doe, Jane},
  title = {Revised Collaborative Projection},
  year = {2027},
  journal = {Journal of Durable Evidence},
  doi = {10.5555/collaborative.2026}
}
`;
  await collaborator.locator("#bibliography-editor").fill(updatedBibliography);
  await expect(page.locator("#bibliography-editor")).toHaveValue(updatedBibliography);
  await expect(page.locator("#publication-list")).toContainText("Revised Collaborative Projection");
  await expect(collaborator.locator("#publication-list")).toContainText("Revised Collaborative Projection");
  await expect
    .poll(async () => {
      const snapshot = await readWorkspaceSnapshot(page, api);
      return snapshot.publications.find((publication) => publication.citationKey === "collaborative2026");
    })
    .toMatchObject({
      id: initialPublication.id,
      title: "Revised Collaborative Projection",
      authors: ["Doe, Jane"],
      year: "2027",
      venue: "Journal of Durable Evidence",
      metadataSource: "bibtex",
    });

  const renamedBibliography = updatedBibliography
    .replace("collaborative2026,", "renamed2027,")
    .replace("10.5555/collaborative.2026", "https://doi.org/10.5555/COLLABORATIVE.2026");
  await page.locator("#bibliography-editor").fill(renamedBibliography);
  await expect(collaborator.locator("#bibliography-editor")).toHaveValue(renamedBibliography);
  await expect
    .poll(async () => {
      const snapshot = await readWorkspaceSnapshot(page, api);
      return snapshot.publications.find((publication) => publication.citationKey === "renamed2027");
    })
    .toMatchObject({
      id: initialPublication.id,
      doi: "10.5555/collaborative.2026",
      metadataSource: "bibtex",
    });

  await collaborator.locator("#bibliography-editor").fill("");
  await expect(page.locator("#bibliography-editor")).toHaveValue("");
  await expect
    .poll(async () => {
      const snapshot = await readWorkspaceSnapshot(page, api);
      return {
        bibliography: snapshot.bibliography,
        publication: snapshot.publications.find((publication) => publication.id === initialPublication.id),
      };
    })
    .toMatchObject({
      bibliography: "",
      publication: {
        citationKey: "renamed2027",
        title: "Revised Collaborative Projection",
        metadataSource: "bibtex",
      },
    });
  await expect(page.locator("#publication-list")).toContainText("Revised Collaborative Projection");
  await expect(collaborator.locator("#publication-list")).toContainText("Revised Collaborative Projection");
  await collaborator.close();
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
    data: { claimId: claim.id, start, end: start + excerpt.length, excerpt, sourceRevision: snapshot.revision },
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
        choices: [{ message: { content: "## Proposed revision\n\nThis stale draft must not be stored.\n" } }],
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
  await page.locator("[data-annotation-id]").first().check();
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
  await expect(page.locator("#candidate-list")).toContainText("Model candidates remain separate");
  const finalSnapshot = await readWorkspaceSnapshot(page, api);
  expect(finalSnapshot.candidates).toEqual([]);
  expect(finalSnapshot.source).toBe(concurrentSource);
  await collaborator.close();
});

test("moves evidence from PDF annotation through reviewed model prose", async ({ page }) => {
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

  await page.getByRole("button", { name: "New claim" }).click();
  await page.locator("#claim-text").fill("Inspectable evidence strengthens scholarly claims.");
  await page.locator("#claim-note").fill("Human-authored synthesis");
  await page.locator('#claim-evidence-options input[type="checkbox"]').first().check();
  await page.locator("#claim-dialog").getByRole("button", { name: "Save claim" }).click();
  await expect(page.locator("#claim-list")).toContainText("Inspectable evidence strengthens scholarly claims.");
  await expect(page.locator("#knowledge-connection-list")).toContainText("supports");

  await page.locator("#claim-list").getByRole("button", { name: "Edit" }).click();
  await page.locator("#claim-text").fill("Inspectable evidence keeps scholarly claims accountable.");
  await page.locator("#claim-note").fill("Revised human synthesis");
  await page.locator("#claim-relation").selectOption("extends");
  await page.locator("#claim-dialog").getByRole("button", { name: "Save claim" }).click();
  const claimCard = page.locator("#claim-list article").filter({ hasText: "keeps scholarly claims accountable" }).first();
  await expect(claimCard).toContainText("extends · Grounding for the revision");

  await editor.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf("into cited prose");
    element.focus();
    element.setSelectionRange(start, start + "into cited prose".length);
  });
  await claimCard.getByRole("button", { name: "Link selected prose" }).click();
  await expect(claimCard.getByRole("button", { name: "Open linked passage" })).toBeVisible();

  await page.locator("#knowledge-search-input").fill("human synthesis accountable");
  await page.locator("#knowledge-search-form").getByRole("button", { name: "Find" }).click();
  await expect(page.locator("#knowledge-search-results")).toContainText("Inspectable evidence keeps scholarly claims accountable.");

  await page.locator("#knowledge-search-input").fill("Grounding revision");
  await page.locator("#knowledge-search-form").getByRole("button", { name: "Find" }).click();
  await expect(page.locator("#knowledge-search-results")).toContainText("Grounding for the revision");
  await expect(page.locator("#knowledge-connection-list")).toContainText("annotates");
  await expect(page.locator("#knowledge-connection-list")).toContainText("used-in");

  const searchResponse = await page.request.get("/api/workspaces/demo/search?q=inspectable%20evidence");
  const searchResults: unknown = await searchResponse.json();
  expect(searchResponse.ok()).toBe(true);
  expect(isKnowledgeSearchResults(searchResults)).toBe(true);
  const graphResponse = await page.request.get("/api/workspaces/demo/graph");
  const graph: unknown = await graphResponse.json();
  expect(graphResponse.ok()).toBe(true);
  expect(isWorkspaceKnowledgeGraph(graph)).toBe(true);

  await claimCard.getByRole("button", { name: "Open linked passage" }).click();
  await expect(editor).toBeFocused();
  page.once("dialog", (dialog) => void dialog.accept());
  await claimCard.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("#claim-count")).toHaveText("0");
  await expect(page.locator("#annotation-list")).toContainText("Grounding for the revision");

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
  await page.locator("#llm-endpoint").fill("http://127.0.0.1:1234/v1/chat/completions");
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

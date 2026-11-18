import { expect, test } from "@playwright/test";

test("keeps the navigation toggle available across context tabs", async ({ page }) => {
  await page.goto("/editor/demo");
  const header = page.locator("#app-header");
  await page.getByRole("button", { name: "Hide top navigation" }).click();
  for (const name of ["Preview", "Outline & hints", "Library", "Writing assistant"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(header).toBeHidden();
    await page.getByRole("button", { name: "Show top navigation" }).click();
    await expect(header).toBeVisible();
    await page.getByRole("button", { name: "Hide top navigation" }).click();
  }
  await page.reload();
  await expect(header).toBeHidden();
  await expect(page.getByRole("button", { name: "Show top navigation" })).toBeVisible();
});

test("opens connection settings from Outline & hints with hidden navigation", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("kirjolab:preview-navigation-hidden", "true"));
  await page.goto("/editor/demo?context=outline");
  const header = page.locator("#app-header");
  await expect(header).toBeHidden();
  await page.locator(".outline-analysis").getByRole("button", { name: "Connection settings", exact: true }).click();
  await expect(header).toBeVisible();
  await expect(page.locator("#preferences-menu")).toHaveAttribute("open", "");
  await expect(page.locator("#llm-connection")).toBeFocused();
  await expect(page.getByRole("button", { name: "Hide top navigation" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("kirjolab:preview-navigation-hidden"))).toBeNull();
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 640 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    test.describe(`Library navigation at ${viewport.width}px in ${colorScheme}`, () => {
      test.use({ viewport, colorScheme, hasTouch: viewport.width < 1440 });

      test("keeps navigation restore beside Library actions without covering them", async ({ page }) => {
        await page.goto("/library");
        await page.getByRole("button", { name: "Hide top navigation" }).click();
        const restore = page.getByRole("button", { name: "Show top navigation" });
        const add = page.getByText("Add reference", { exact: true });
        await expect(restore).toBeFocused();
        await page.reload();
        await expect(page.locator("#app-header")).toBeHidden();
        await expect(restore).toBeVisible();

        const restoreBounds = await restore.boundingBox();
        const addBounds = await add.boundingBox();
        if (!restoreBounds || !addBounds) throw new Error("Expected visible Library controls");
        expect(restoreBounds.x + restoreBounds.width + 8).toBeLessThanOrEqual(addBounds.x);
        expect(restoreBounds.x).toBeGreaterThanOrEqual(0);
        expect(addBounds.x + addBounds.width).toBeLessThanOrEqual(viewport.width);
        if (viewport.width < 1440) expect(restoreBounds.height).toBeGreaterThanOrEqual(44);
        await expect(page.locator(".library-header [data-preview-navigation-restore]")).toBeVisible();
        await add.click();
        await expect(page.getByLabel("Website URL", { exact: true })).toBeVisible();
        await add.click();
        await restore.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#app-header")).toBeVisible();
        await expect(page.getByRole("button", { name: "Hide top navigation" })).toBeFocused();
        expect(await page.evaluate(() => localStorage.getItem("kirjolab:preview-navigation-hidden"))).toBeNull();
      });
    });
  }
}

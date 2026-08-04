import { expect, test } from "@playwright/test";

const disabledDeploymentOrigin = "http://127.0.0.1:8789";

test("keeps an unconfigured GitHub deployment hidden and request-free", async ({ page }) => {
  const githubRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/api/github/") || pathname.includes("/github-sync")) githubRequests.push(pathname);
  });

  await page.goto(`${disabledDeploymentOrigin}/editor/demo`);
  await expect(page.locator("body")).toHaveAttribute("data-github-capability", "disabled");
  await expect(page.locator("#workspace-surfaces")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#github-sync-control")).toBeHidden();
  await expect(page.locator("#open-github-import")).toBeHidden();

  await page.locator("#workspace-settings").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("[data-github-integration]")).toBeHidden();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);

  expect(githubRequests).toEqual([]);
  const directResponse = await page.request.get(`${disabledDeploymentOrigin}/api/workspaces/demo/github-sync`);
  expect(directResponse.status()).toBe(503);
  await expect(directResponse.json()).resolves.toEqual({ error: "GitHub integration is unavailable" });
});

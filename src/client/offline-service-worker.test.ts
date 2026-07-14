import { describe, expect, it, vi } from "vitest";
import { cacheOfflineNavigation, clearOfflineShellCaches, registerOfflineServiceWorker } from "./offline-service-worker";

describe("offline service worker lifecycle", () => {
  it("registers the root worker and waits until it is ready", async () => {
    const register = vi.fn().mockResolvedValue({});
    const target = { register, ready: Promise.resolve({}) };
    await expect(registerOfflineServiceWorker(target)).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith("/service-worker.js", { scope: "/" });
  });

  it("degrades without service workers and clears only Kirjolab offline caches", async () => {
    await expect(registerOfflineServiceWorker(undefined)).resolves.toBe(false);
    const remove = vi.fn().mockResolvedValue(true);
    const storage = {
      keys: vi.fn().mockResolvedValue(["kirjolab-offline-shell-v1", "unrelated"]),
      delete: remove,
      open: vi.fn(),
    };
    await clearOfflineShellCaches(storage);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("kirjolab-offline-shell-v1");
    await expect(clearOfflineShellCaches(undefined)).resolves.toBeUndefined();
  });

  it("stores only successful same-origin project navigation", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const storage = { keys: vi.fn(), delete: vi.fn(), open: vi.fn().mockResolvedValue({ put }) };
    const fetcher = vi.fn().mockResolvedValue(new Response("project", { status: 200 }));
    await expect(cacheOfflineNavigation(storage, fetcher, "https://write.example/workspaces/paper")).resolves.toBe(true);
    expect(storage.open).toHaveBeenCalledWith("kirjolab-offline-shell-v1");
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ url: "https://write.example/workspaces/paper" }), expect.any(Response));

    fetcher.mockResolvedValueOnce(new Response("denied", { status: 403 }));
    await expect(cacheOfflineNavigation(storage, fetcher, "https://write.example/workspaces/private")).resolves.toBe(false);
    expect(put).toHaveBeenCalledTimes(1);
  });
});

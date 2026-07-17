import { describe, expect, it, vi } from "vitest";
import {
  applicationVersion,
  cacheOfflineNavigation,
  clearOfflineShellCaches,
  offlineShellCacheName,
  registerOfflineServiceWorker,
} from "./offline-service-worker";

describe("offline service worker lifecycle", () => {
  it("exposes the shell fingerprint as the reportable application version", () => {
    expect(offlineShellCacheName).toBe(`kirjolab-offline-shell-${applicationVersion}`);
  });

  it("registers the root worker and waits until it is ready", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn().mockResolvedValue({ update });
    const target = { register, ready: Promise.resolve({}) };
    await expect(registerOfflineServiceWorker(target)).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith("/service-worker.js", { scope: "/" });
    expect(update).toHaveBeenCalledOnce();
  });

  it("reports an activated update only when the page already has a controller", async () => {
    const onControllerChange = vi.fn();
    let controllerChange: (() => void) | undefined;
    const target = {
      register: vi.fn().mockResolvedValue({ update: vi.fn().mockResolvedValue(undefined) }),
      ready: Promise.resolve({}),
      controller: {},
      addEventListener: vi.fn((_type: "controllerchange", listener: () => void) => {
        controllerChange = listener;
      }),
    };

    await registerOfflineServiceWorker(target, onControllerChange);
    expect(target.addEventListener).toHaveBeenCalledWith("controllerchange", onControllerChange, { once: true });
    controllerChange?.();
    expect(onControllerChange).toHaveBeenCalledOnce();
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
    expect(storage.open).toHaveBeenCalledWith(offlineShellCacheName);
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ url: "https://write.example/workspaces/paper" }), expect.any(Response));

    fetcher.mockResolvedValueOnce(new Response("denied", { status: 403 }));
    await expect(cacheOfflineNavigation(storage, fetcher, "https://write.example/workspaces/private")).resolves.toBe(false);
    expect(put).toHaveBeenCalledTimes(1);
  });
});

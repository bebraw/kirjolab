export const offlineShellCachePrefix = "kirjolab-offline-shell-";
declare const __OFFLINE_SHELL_CACHE_NAME__: string;

export const offlineShellCacheName =
  typeof __OFFLINE_SHELL_CACHE_NAME__ === "undefined" ? `${offlineShellCachePrefix}development` : __OFFLINE_SHELL_CACHE_NAME__;
export const applicationVersion = offlineShellCacheName.slice(offlineShellCachePrefix.length);

interface ServiceWorkerRegistrationTarget {
  register(scriptURL: string, options?: RegistrationOptions): Promise<{ update?: () => Promise<unknown> }>;
  readonly ready: Promise<unknown>;
  readonly controller?: unknown;
  addEventListener?(type: "controllerchange", listener: () => void, options?: AddEventListenerOptions): void;
}

interface OfflineCacheStorage {
  keys(): Promise<string[]>;
  delete(cacheName: string): Promise<boolean>;
  open(cacheName: string): Promise<{ put(request: Request, response: Response): Promise<void> }>;
}

export async function registerOfflineServiceWorker(
  target: ServiceWorkerRegistrationTarget | undefined,
  onControllerChange?: () => void,
): Promise<boolean> {
  if (!target) return false;
  if (target.controller && onControllerChange) {
    target.addEventListener?.("controllerchange", onControllerChange, { once: true });
  }
  const registration = await target.register("/service-worker.js", { scope: "/" });
  await registration.update?.();
  await target.ready;
  return true;
}

export async function clearOfflineShellCaches(storage: OfflineCacheStorage | undefined): Promise<void> {
  if (!storage) return;
  const cacheNames = await storage.keys();
  await Promise.all(cacheNames.filter((name) => name.startsWith(offlineShellCachePrefix)).map(async (name) => await storage.delete(name)));
}

export async function cacheOfflineNavigation(storage: OfflineCacheStorage, fetcher: typeof fetch, href: string): Promise<boolean> {
  const request = new Request(href, { credentials: "same-origin" });
  const response = await fetcher(request);
  const requestedOrigin = new URL(href).origin;
  if (!response.ok || response.redirected || (response.url && new URL(response.url).origin !== requestedOrigin)) return false;
  const cache = await storage.open(offlineShellCacheName);
  await cache.put(request, response.clone());
  return true;
}

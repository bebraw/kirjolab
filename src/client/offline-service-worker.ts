export const offlineShellCachePrefix = "kirjolab-offline-shell-";

interface ServiceWorkerRegistrationTarget {
  register(scriptURL: string, options?: RegistrationOptions): Promise<unknown>;
  readonly ready: Promise<unknown>;
}

interface OfflineCacheStorage {
  keys(): Promise<string[]>;
  delete(cacheName: string): Promise<boolean>;
  open(cacheName: string): Promise<{ put(request: Request, response: Response): Promise<void> }>;
}

export async function registerOfflineServiceWorker(target: ServiceWorkerRegistrationTarget | undefined): Promise<boolean> {
  if (!target) return false;
  await target.register("/service-worker.js", { scope: "/" });
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
  const cache = await storage.open(`${offlineShellCachePrefix}v1`);
  await cache.put(request, response.clone());
  return true;
}

/// <reference lib="webworker" />

import { offlineShellCachePrefix } from "./offline-service-worker";

declare const self: ServiceWorkerGlobalScope;

const cacheName = `${offlineShellCachePrefix}v1`;
const shellPaths = new Set(["/app.js", "/styles.css", "/favicon.svg", "/markdown-module-1.js"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then(async (cache) => await cache.addAll([...shellPaths]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then(async (names) => {
        await Promise.all(
          names
            .filter((name) => name.startsWith(offlineShellCachePrefix) && name !== cacheName)
            .map(async (name) => await caches.delete(name)),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/cdn-cgi/")) return;
  const workspaceNavigation =
    request.mode === "navigate" && (url.pathname === "/" || /^\/workspaces\/[a-z0-9-]{1,64}$/iu.test(url.pathname));
  if (!workspaceNavigation && !shellPaths.has(url.pathname)) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected && new URL(response.url).origin === self.location.origin) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

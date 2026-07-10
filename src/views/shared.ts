export function htmlResponse(body: string, status = 200, requestUrl?: URL): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": contentSecurityPolicy(requestUrl),
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-embedder-policy": "require-corp",
    },
  });
}

function contentSecurityPolicy(requestUrl?: URL): string {
  const webSocketOrigin = requestUrl ? `${requestUrl.protocol === "https:" ? "wss:" : "ws:"}//${requestUrl.host}` : undefined;
  const connectSources = ["'self'", webSocketOrigin, "http://127.0.0.1:*", "http://localhost:*"].filter(Boolean).join(" ");

  return [
    "default-src 'self'",
    "base-uri 'none'",
    `connect-src ${connectSources}`,
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' http: https:",
    "manifest-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "worker-src 'self'",
  ].join("; ");
}

export function cssResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function scriptResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

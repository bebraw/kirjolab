export function htmlResponse(
  body: string,
  status = 200,
  requestUrl?: URL,
  options: { readonly allowSameOriginFrames?: boolean; readonly crossOriginIsolated?: boolean } = {},
): Response {
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "content-security-policy": contentSecurityPolicy(requestUrl, options.allowSameOriginFrames === true),
    "cross-origin-opener-policy": "same-origin",
  };
  if (options.crossOriginIsolated !== false) headers["cross-origin-embedder-policy"] = "require-corp";

  return new Response(body, {
    status,
    headers,
  });
}

function contentSecurityPolicy(requestUrl?: URL, allowSameOriginFrames = false): string {
  const webSocketOrigin = requestUrl ? `${requestUrl.protocol === "https:" ? "wss:" : "ws:"}//${requestUrl.host}` : undefined;
  const connectSources = [
    "'self'",
    webSocketOrigin,
    "http://127.0.0.1:*",
    "https://127.0.0.1:*",
    "http://localhost:*",
    "https://localhost:*",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    "base-uri 'none'",
    `connect-src ${connectSources}`,
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `frame-src ${allowSameOriginFrames ? "'self'" : "'none'"}`,
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

export function pdfResponse(body: Uint8Array): Response {
  const bytes = new Uint8Array(body);
  return new Response(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes.byteLength),
      "content-disposition": 'inline; filename="kirjolab-document.pdf"',
      "cache-control": "no-store",
      "content-security-policy": "frame-ancestors 'self'",
      "cross-origin-resource-policy": "same-origin",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

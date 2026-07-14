export function htmlResponse(
  body: string,
  status = 200,
  requestUrl?: URL,
  options: { readonly allowSameOriginFrames?: boolean } = {},
): Response {
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "content-security-policy": contentSecurityPolicy(requestUrl, options.allowSameOriginFrames === true),
    "cross-origin-opener-policy": "same-origin",
  };
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
    "script-src 'self'",
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
      "cross-origin-resource-policy": "same-origin",
      "cross-origin-embedder-policy": "require-corp",
    },
  });
}

export function faviconResponse(): Response {
  const body = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0b6b51"/>
  <path d="M14 17h13a7 7 0 0 1 7 7v25a8 8 0 0 0-8-8H14zm36 0H41a7 7 0 0 0-7 7v25a8 8 0 0 1 8-8h8z" fill="none" stroke="#f8f6ef" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"/>
</svg>`;
  return new Response(body, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400",
      "cross-origin-resource-policy": "same-origin",
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

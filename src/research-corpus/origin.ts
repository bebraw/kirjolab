export function isCorpusOriginAllowed(request: Request, origin: string, allowedOrigins: ReadonlySet<string>): boolean {
  return origin === new URL(request.url).origin || allowedOrigins.has(origin);
}

export function isCorpusOriginRejected(request: Request, allowedOrigins: ReadonlySet<string>): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && !isCorpusOriginAllowed(request, origin, allowedOrigins);
}

export function withCorpusCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-expose-headers", "Accept-Ranges, Content-Disposition, Content-Length, Content-Range, ETag, Last-Modified");
  headers.append("vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

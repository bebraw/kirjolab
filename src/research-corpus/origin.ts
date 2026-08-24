export function isCorpusOriginAllowed(request: Request, origin: string, allowedOrigins: ReadonlySet<string>): boolean {
  return origin === new URL(request.url).origin || allowedOrigins.has(origin);
}

export function withCorpusCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.append("vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

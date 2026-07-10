export function createHealthResponse(routes: string[]): Response {
  return Response.json({
    ok: true,
    name: "vibe-template-worker",
    routes,
  });
}

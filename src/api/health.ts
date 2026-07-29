export function createHealthResponse(routes: string[], deployment: WorkerVersionMetadata | null = null): Response {
  return Response.json(
    {
      ok: true,
      name: "kirjolab",
      routes,
      deployment,
    },
    {
      headers: { "cache-control": "no-store" },
    },
  );
}

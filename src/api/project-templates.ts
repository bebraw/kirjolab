import { isPersonalProjectTemplateId, listBuiltInProjectTemplates } from "../domain/project-templates";
import type { AuthIdentity } from "../security/auth";

export async function handleProjectTemplateApi(request: Request, env: Env, identity: AuthIdentity): Promise<Response> {
  const url = new URL(request.url);
  const catalog = env.PROJECT_TEMPLATE_CATALOGS.getByName(identity.ownerKey);
  if (url.pathname === "/api/project-templates" && request.method === "GET") {
    return Response.json([...listBuiltInProjectTemplates(), ...(await catalog.listTemplates())]);
  }
  const match = /^\/api\/project-templates\/([0-9a-f-]{36})$/iu.exec(url.pathname);
  if (!match?.[1] || !isPersonalProjectTemplateId(match[1])) return jsonError("Project template not found", 404);
  if (request.method !== "DELETE") return jsonError("Route not found", 404);
  try {
    await catalog.deleteTemplate(match[1]);
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project template operation failed";
    return jsonError(message, /not found/iu.test(message) ? 404 : 400);
  }
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

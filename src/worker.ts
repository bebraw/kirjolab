import { createHealthResponse } from "./api/health";
import { handleWorkspaceApi } from "./api/workspace";
import { exampleRoutes } from "./app-routes";
import { DocumentRoom } from "./durable-objects/document-room";
import { renderHomePage } from "./views/home";
import { renderNotFoundPage } from "./views/not-found";
import { cssResponse, htmlResponse, scriptResponse } from "./views/shared";

export { DocumentRoom };

export default {
  async fetch(request: Request, env?: Env): Promise<Response> {
    return await handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;

export async function handleRequest(request: Request, env?: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/styles.css") {
    return cssResponse(await loadStylesheet());
  }

  if (url.pathname === "/app.js") {
    return scriptResponse(await loadClientScript());
  }

  if (url.pathname === "/pdf.worker.js") {
    return scriptResponse(await loadPdfWorkerScript());
  }

  if (url.pathname === "/") {
    return htmlResponse(renderHomePage(exampleRoutes));
  }

  if (url.pathname === "/api/health") {
    return createHealthResponse(exampleRoutes.map((route) => route.path));
  }

  if (url.pathname.startsWith("/api/workspaces/")) {
    if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
    return await handleWorkspaceApi(request, env);
  }

  return htmlResponse(renderNotFoundPage(url.pathname), 404);
}

async function loadStylesheet(): Promise<string> {
  // Stryker disable next-line ConditionalExpression: WebSocketPair is a Worker runtime primitive absent from Node unit tests.
  if (typeof WebSocketPair === "undefined") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return await readFile(fileURLToPath(new URL("../.generated/styles.css", import.meta.url).href), "utf8");
  }

  const styles = await import("../.generated/styles.css");
  return styles.default;
}

async function loadClientScript(): Promise<string> {
  // Stryker disable next-line ConditionalExpression: WebSocketPair is a Worker runtime primitive absent from Node unit tests.
  if (typeof WebSocketPair === "undefined") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return await readFile(fileURLToPath(new URL("../.generated/app.txt", import.meta.url).href), "utf8");
  }

  const script = await import("../.generated/app.txt");
  return script.default;
}

async function loadPdfWorkerScript(): Promise<string> {
  // Stryker disable next-line ConditionalExpression: WebSocketPair is a Worker runtime primitive absent from Node unit tests.
  if (typeof WebSocketPair === "undefined") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return await readFile(fileURLToPath(new URL("../.generated/pdf-worker.txt", import.meta.url).href), "utf8");
  }

  const script = await import("../.generated/pdf-worker.txt");
  return script.default;
}

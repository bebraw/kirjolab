import * as v from "valibot";

const errorResponseSchema = v.object({ error: v.string() });

export type JsonRequestMethod = "PATCH" | "POST" | "PUT";

export function jsonFetch(url: string, body: unknown, method: JsonRequestMethod = "POST"): Promise<Response> {
  return fetch(url, {
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method,
  });
}

export async function expectOk(response: Response): Promise<void> {
  if (response.ok) return;
  const value: unknown = await response.json().catch(() => null);
  throw new Error(v.is(errorResponseSchema, value) ? value.error : `Request failed (${response.status})`);
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

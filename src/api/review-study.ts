import { parseReviewProtocolContent } from "../domain/review-study";
import type { AuthIdentity } from "../security/auth";

const maximumProtocolRequestBytes = 2 * 1024 * 1024;

export async function handleReviewStudyApi(
  request: Request,
  study: DurableObjectStub<import("../durable-objects/review-study").ReviewStudy>,
  identity: AuthIdentity,
  suffix: string,
): Promise<Response> {
  if (suffix === "/review-study" && request.method === "GET") {
    return noStore(await study.getSnapshot("slr", identity.email));
  }
  if (suffix === "/review-study/protocol" && request.method === "PUT") {
    const body = await protocolRequest(request);
    return noStore(
      await study.replaceProtocol({
        expectedRevision: body.expectedRevision,
        content: body.content,
        ...(body.rationale ? { rationale: body.rationale } : {}),
        actor: identity.email,
      }),
    );
  }
  if (suffix === "/review-study/protocol/freeze" && request.method === "POST") {
    const body = await expectedRevisionRequest(request);
    return noStore(await study.freezeProtocol(body.expectedRevision, identity.email));
  }
  if (suffix === "/review-study/protocol/amend" && request.method === "POST") {
    const body = await protocolRequest(request, true);
    return noStore(
      await study.amendProtocol({
        expectedRevision: body.expectedRevision,
        content: body.content,
        rationale: body.rationale!,
        actor: identity.email,
      }),
    );
  }
  return Response.json({ error: "Review-study route not found" }, { status: 404 });
}

async function protocolRequest(request: Request, requireRationale = false) {
  assertRequestSize(request);
  const value: unknown = await request.json();
  if (!isRecord(value)) throw new Error("Review protocol request is invalid");
  const expectedRevision = parseRevision(value.expectedRevision);
  const content = parseReviewProtocolContent(value.content);
  const rationale = typeof value.rationale === "string" ? value.rationale.trim() : undefined;
  if (requireRationale && !rationale) throw new Error("Protocol amendment rationale is required");
  if (rationale && rationale.length > 2_000) throw new Error("Protocol rationale is invalid");
  return { expectedRevision, content, rationale };
}

async function expectedRevisionRequest(request: Request): Promise<{ expectedRevision: number }> {
  assertRequestSize(request);
  const value: unknown = await request.json();
  if (!isRecord(value)) throw new Error("Review protocol request is invalid");
  return { expectedRevision: parseRevision(value.expectedRevision) };
}

function parseRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error("Review revision is invalid");
  return value;
}

function assertRequestSize(request: Request): void {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maximumProtocolRequestBytes) throw new Error("Review protocol request is too large");
}

function noStore(value: unknown): Response {
  return Response.json(value, { headers: { "cache-control": "no-store" } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

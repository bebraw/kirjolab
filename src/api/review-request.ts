import { readBoundedRequestBytes } from "./request-body";

export const maximumReviewJsonRequestBytes = 2 * 1024 * 1024;

export class ReviewRequestTooLargeError extends RangeError {}

export async function readReviewJson(request: Request, maximumBytes = maximumReviewJsonRequestBytes): Promise<unknown> {
  const declaredBytes = Number(request.headers.get("content-length") ?? "0");
  if (declaredBytes > maximumBytes) throw new ReviewRequestTooLargeError("Review API request is too large");
  if (!request.body) throw new SyntaxError("Review API request body is empty");
  const bytes = await readBoundedRequestBytes(request.body, {
    maximumBytes,
    tooLarge: () => new ReviewRequestTooLargeError("Review API request is too large"),
  });
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
}

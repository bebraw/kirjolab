export const maximumReviewJsonRequestBytes = 2 * 1024 * 1024;

export class ReviewRequestTooLargeError extends RangeError {}

export async function readReviewJson(request: Request, maximumBytes = maximumReviewJsonRequestBytes): Promise<unknown> {
  const declaredBytes = Number(request.headers.get("content-length") ?? "0");
  if (declaredBytes > maximumBytes) throw new ReviewRequestTooLargeError("Review API request is too large");
  if (!request.body) throw new SyntaxError("Review API request body is empty");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    byteLength += result.value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel();
      throw new ReviewRequestTooLargeError("Review API request is too large");
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
}

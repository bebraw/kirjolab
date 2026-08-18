interface BoundedRequestBodyOptions {
  readonly maximumBytes: number;
  readonly tooLarge: () => Error;
  readonly preserveLimitErrorOnCancelFailure?: boolean;
}

export async function readBoundedRequestBytes(body: ReadableStream<Uint8Array>, options: BoundedRequestBodyOptions): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const result = await reader.read();
    if (result.done) break;
    byteLength += result.value.byteLength;
    if (byteLength > options.maximumBytes) {
      if (options.preserveLimitErrorOnCancelFailure) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the caller's stable size failure when stream teardown fails.
        }
      } else {
        await reader.cancel();
      }
      throw options.tooLarge();
    }
    chunks.push(result.value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

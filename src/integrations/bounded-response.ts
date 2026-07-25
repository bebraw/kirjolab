interface BoundedResponseTextOptions {
  readonly decoder?: TextDecoder;
  readonly invalidTextError?: () => Error;
}

export async function readBoundedResponseText(
  response: Response,
  maximumBytes: number,
  boundsError: () => Error,
  options: BoundedResponseTextOptions = {},
): Promise<string> {
  const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > maximumBytes) throw boundsError();
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw boundsError();
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return (options.decoder ?? new TextDecoder()).decode(bytes);
  } catch (error) {
    if (options.invalidTextError) throw options.invalidTextError();
    throw error;
  }
}

export function parseResponseJson(text: string, invalidJsonError: () => Error): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidJsonError();
  }
}

export async function readBoundedResponseJson(
  response: Response,
  maximumBytes: number,
  boundsError: () => Error,
  invalidJsonError: () => Error,
  options: BoundedResponseTextOptions = {},
): Promise<unknown> {
  if (!response.body) throw invalidJsonError();
  const text = await readBoundedResponseText(response, maximumBytes, boundsError, {
    ...options,
    invalidTextError: invalidJsonError,
  });
  if (!text) throw invalidJsonError();
  return parseResponseJson(text, invalidJsonError);
}

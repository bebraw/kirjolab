export interface R2DownloadOptions {
  readonly cacheControl: string;
  readonly contentDisposition: string;
}

export async function downloadR2Object(
  request: Request,
  bucket: Pick<R2Bucket, "get">,
  key: string,
  options: R2DownloadOptions,
): Promise<Response | null> {
  const object = await bucket.get(key, { onlyIf: request.headers, range: request.headers });
  if (!object) return null;

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", options.cacheControl);
  headers.set("content-disposition", options.contentDisposition);
  headers.set("etag", object.httpEtag);

  if (!("body" in object)) return new Response(null, { status: 412, headers });

  const range = resolvedRange(object.range, object.size);
  if (!range) {
    headers.set("content-length", String(object.size));
    return new Response(object.body, { headers });
  }

  headers.set("content-length", String(range.length));
  headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
  return new Response(object.body, { status: 206, headers });
}

function resolvedRange(range: R2Range | undefined, size: number): { readonly offset: number; readonly length: number } | null {
  if (!range) return null;
  if ("suffix" in range) {
    const length = Math.min(range.suffix, size);
    return { offset: size - length, length };
  }
  const offset = range.offset ?? 0;
  return { offset, length: Math.min(range.length ?? size - offset, size - offset) };
}

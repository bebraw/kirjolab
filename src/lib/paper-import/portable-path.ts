export function normalizePortablePath(value: string): string | null {
  const candidate = value.trim().replaceAll("\\", "/");
  if (!candidate || candidate.startsWith("/") || candidate.includes("\0")) return null;
  const segments: string[] = [];
  for (const segment of candidate.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.length === 0 ? null : segments.join("/");
}

export function resolvePortablePath(fromPath: string, requestedPath: string): string | null {
  const directory = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  return normalizePortablePath(directory ? `${directory}/${requestedPath}` : requestedPath);
}

export function comparePortableText(left: string, right: string): number {
  const foldedLeft = left.toLowerCase();
  const foldedRight = right.toLowerCase();
  if (foldedLeft < foldedRight) return -1;
  if (foldedLeft > foldedRight) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

export type LibraryUiRoute =
  | { readonly kind: "library"; readonly referenceId: string | null }
  | { readonly kind: "pdf"; readonly artifactId: string | null; readonly page: number };

export function readLibraryUiRoute(url: URL): LibraryUiRoute {
  const match = /^\/library\/pdfs\/([^/]+)$/u.exec(url.pathname);
  if (!match?.[1]) return { kind: "library", referenceId: url.searchParams.get("reference") };

  let artifactId: string | null;
  try {
    artifactId = decodeURIComponent(match[1]);
  } catch {
    artifactId = null;
  }
  const requestedPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return {
    artifactId,
    kind: "pdf",
    page: Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
}

export function libraryPdfRoute(artifactId: string, page: number): string {
  return `/library/pdfs/${encodeURIComponent(artifactId)}${page > 1 ? `?page=${page}` : ""}`;
}

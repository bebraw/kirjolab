import { isRecord } from "./unknown-value";
import type { LibraryPdfArtifact, LibraryHighlight, LibraryPdfMarkup } from "./reference-library";

/** Returned only to the authenticated Library owner. The href is a bearer capability. */
export interface LibraryPdfShare {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly href: string;
}

export interface LibraryPdfShareRegistration {
  readonly id: string;
  readonly artifactId: string;
  readonly token: string;
  readonly digest: string;
  readonly name: string;
  readonly createdAt: string;
}

export type LibraryPdfShareListResult =
  { readonly status: "ok"; readonly shares: readonly LibraryPdfShare[] } | { readonly status: "missing" };
export type LibraryPdfShareRegistrationResult =
  { readonly status: "created"; readonly share: LibraryPdfShare } | { readonly status: "missing" | "limit" | "invalid" };
export type LibraryPdfShareRevocationResult = { readonly status: "revoked"; readonly digest: string } | { readonly status: "missing" };
export type LibraryPdfShareSourceResult =
  | {
      readonly status: "ok";
      readonly artifact: LibraryPdfArtifact;
      readonly highlights: readonly LibraryHighlight[];
      readonly markups: readonly LibraryPdfMarkup[];
    }
  | { readonly status: "missing" | "limit" };

export function isLibraryPdfShare(value: unknown): value is LibraryPdfShare {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    /^[0-9a-f-]{36}$/iu.test(value.id) &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    value.name.length <= 200 &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.href === "string" &&
    /^\/share\/pdf\/[A-Za-z0-9_-]{43}$/u.test(value.href)
  );
}

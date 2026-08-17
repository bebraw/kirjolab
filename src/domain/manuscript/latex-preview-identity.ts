import { canonicalJson } from "../canonical-json";
import { sha256Bytes, sha256Text } from "../sha256";
import { compareText } from "../text-order";
import type { LatexArchiveFile } from "./latex-import";

export {
  defaultLatexConversionOptions as latexPreviewConversionOptions,
  latexConverterVersion,
} from "../../lib/paper-import/latex-conversion";

export const latexPreviewIdentitySchemaVersion = 1;

export type LatexPreviewOptionValue = boolean | number | string;

export interface LatexPreviewIdentity {
  readonly schemaVersion: number;
  readonly archiveSha256: string;
  readonly rootPath: string;
  readonly bibliographyPath: string | null;
  readonly converterVersion: string;
  readonly options: Readonly<Record<string, LatexPreviewOptionValue>>;
  readonly manifestSha256: string;
}

interface LatexArchiveManifestEntry {
  readonly path: string;
  readonly kind: LatexArchiveFile["kind"];
  readonly byteCount: number;
  readonly sha256: string;
}

export async function latexPreviewDigest(identity: LatexPreviewIdentity): Promise<string> {
  return await sha256Text(canonicalJson(identity));
}

export async function latexArchiveManifestSha256(files: readonly LatexArchiveFile[]): Promise<string> {
  const entries: LatexArchiveManifestEntry[] = [];
  for (const file of [...files].sort((left, right) => compareText(left.path, right.path))) {
    entries.push({
      path: file.path,
      kind: file.kind,
      byteCount: file.bytes.byteLength,
      sha256: await sha256Bytes(file.bytes),
    });
  }
  return await sha256Text(canonicalJson({ schemaVersion: 1, files: entries }));
}

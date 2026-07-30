import { isRecord } from "../unknown-value";

export type OpenAccessPdfProvider = "openalex" | "unpaywall";

export interface OpenAccessPdfCandidate {
  readonly provider: OpenAccessPdfProvider;
  readonly providerRecordId: string;
  readonly landingUrl: string;
  readonly pdfUrl: string;
  readonly license: string;
  readonly version: string;
  readonly fingerprint: string;
}

export interface OpenAccessPdfDiscovery {
  readonly candidate: OpenAccessPdfCandidate | null;
}

export interface OpenAccessPdfImportInput {
  readonly provider: OpenAccessPdfProvider;
  readonly fingerprint: string;
}

export interface OpenAccessPdfProvenance {
  readonly provider: OpenAccessPdfProvider;
  readonly providerRecordId: string;
  readonly finalUrl: string;
  readonly license: string;
  readonly version: string;
  readonly retrievedAt: string;
  readonly contentFingerprint: string;
}

export function isOpenAccessPdfDiscovery(value: unknown): value is OpenAccessPdfDiscovery {
  return isRecord(value) && (value.candidate === null || isOpenAccessPdfCandidate(value.candidate));
}

export function isOpenAccessPdfImportInput(value: unknown): value is OpenAccessPdfImportInput {
  return (
    isRecord(value) &&
    (value.provider === "openalex" || value.provider === "unpaywall") &&
    typeof value.fingerprint === "string" &&
    /^sha256:[a-f0-9]{64}$/u.test(value.fingerprint)
  );
}

function isOpenAccessPdfCandidate(value: unknown): value is OpenAccessPdfCandidate {
  return (
    isRecord(value) &&
    (value.provider === "openalex" || value.provider === "unpaywall") &&
    ["providerRecordId", "landingUrl", "pdfUrl", "license", "version", "fingerprint"].every((key) => typeof value[key] === "string") &&
    /^sha256:[a-f0-9]{64}$/u.test(value.fingerprint as string)
  );
}

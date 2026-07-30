import { normalizePublicationDoi } from "../domain/publication-intake";
import { isRecord } from "../domain/unknown-value";
import type { OpenAccessPdfCandidate, OpenAccessPdfProvider } from "../domain/open-access-pdf";
import { readBoundedResponseJson } from "./bounded-response";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const maximumMetadataBytes = 1_000_000;
const maximumPdfBytes = 25 * 1024 * 1024;
const maximumRedirects = 5;
const maximumProviderUrlLength = 1_000;

export interface OpenAccessPdfConfig {
  readonly openAlexApiKey: string | undefined;
  readonly contactEmail: string | undefined;
}

export interface DownloadedOpenAccessPdf {
  readonly bytes: Uint8Array;
  readonly finalUrl: string;
  readonly fingerprint: string;
}

export async function discoverOpenAccessPdf(
  doiValue: string,
  config: OpenAccessPdfConfig,
  fetcher: Fetcher = fetch,
): Promise<OpenAccessPdfCandidate | null> {
  const doi = normalizePublicationDoi(doiValue);
  const openAlexKey = config.openAlexApiKey?.trim();
  if (openAlexKey) {
    const candidate = await fetchProviderCandidate("openalex", doi, config, fetcher);
    if (candidate) return candidate;
  }
  if (config.contactEmail?.trim()) return await fetchProviderCandidate("unpaywall", doi, config, fetcher);
  return null;
}

export async function refetchOpenAccessPdfCandidate(
  provider: OpenAccessPdfProvider,
  doiValue: string,
  config: OpenAccessPdfConfig,
  fetcher: Fetcher = fetch,
): Promise<OpenAccessPdfCandidate | null> {
  return await fetchProviderCandidate(provider, normalizePublicationDoi(doiValue), config, fetcher);
}

export async function downloadOpenAccessPdf(urlValue: string, fetcher: Fetcher = fetch): Promise<DownloadedOpenAccessPdf> {
  let url = safePublicHttpsUrl(urlValue);
  for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
    const response = await fetcher(url, {
      redirect: "manual",
      headers: { accept: "application/pdf", "user-agent": "Kirjolab/0.1" },
    });
    if (response.status >= 300 && response.status < 400) {
      if (redirects === maximumRedirects) throw new Error("Open PDF has too many redirects");
      const location = response.headers.get("location");
      if (!location) throw new Error("Open PDF redirect has no location");
      url = safePublicHttpsUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error("Open PDF download failed");
    if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/pdf") {
      throw new Error("Open PDF response is not application/pdf");
    }
    const bytes = await readBoundedBytes(response, maximumPdfBytes);
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Open PDF response has no PDF signature");
    return { bytes, finalUrl: url.toString(), fingerprint: await sha256(bytes) };
  }
  throw new Error("Open PDF redirect limit exceeded");
}

async function fetchProviderCandidate(
  provider: OpenAccessPdfProvider,
  doi: string,
  config: OpenAccessPdfConfig,
  fetcher: Fetcher,
): Promise<OpenAccessPdfCandidate | null> {
  const url = providerUrl(provider, doi, config);
  const response = await fetcher(url, { headers: { accept: "application/json", "user-agent": "Kirjolab/0.1" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${provider === "openalex" ? "OpenAlex" : "Unpaywall"} open-PDF lookup failed`);
  const body = await readBoundedResponseJson(
    response,
    maximumMetadataBytes,
    () => new Error("Open-PDF metadata response is too large"),
    () => new Error("Open-PDF provider returned invalid metadata"),
  );
  const fields = provider === "openalex" ? openAlexFields(body) : unpaywallFields(body);
  if (!fields) return null;
  const unsigned = {
    provider,
    ...fields,
    landingUrl: fields.landingUrl ? safePublicHttpsUrl(fields.landingUrl).toString() : "",
    pdfUrl: safePublicHttpsUrl(fields.pdfUrl).toString(),
  };
  return { ...unsigned, fingerprint: await sha256(new TextEncoder().encode(JSON.stringify(unsigned))) };
}

function providerUrl(provider: OpenAccessPdfProvider, doi: string, config: OpenAccessPdfConfig): URL {
  if (provider === "openalex") {
    const key = config.openAlexApiKey?.trim();
    if (!key) throw new Error("OpenAlex API key is not configured");
    const url = new URL(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`);
    url.searchParams.set("select", "id,best_oa_location");
    url.searchParams.set("api_key", key);
    return url;
  }
  const email = config.contactEmail?.trim();
  if (!email) throw new Error("Unpaywall contact email is not configured");
  const url = new URL(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}`);
  url.searchParams.set("email", email);
  return url;
}

function openAlexFields(value: unknown): Omit<OpenAccessPdfCandidate, "provider" | "fingerprint"> | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.best_oa_location)) return null;
  const location = value.best_oa_location;
  if (location.is_oa !== true || typeof location.pdf_url !== "string" || !location.pdf_url.trim()) return null;
  return {
    providerRecordId: boundedString(value.id, 256),
    landingUrl: boundedString(location.landing_page_url, maximumProviderUrlLength),
    pdfUrl: boundedString(location.pdf_url, maximumProviderUrlLength),
    license: boundedString(location.license, 100),
    version: boundedString(location.version, 100),
  };
}

function unpaywallFields(value: unknown): Omit<OpenAccessPdfCandidate, "provider" | "fingerprint"> | null {
  if (!isRecord(value) || typeof value.doi !== "string" || !isRecord(value.best_oa_location)) return null;
  const location = value.best_oa_location;
  if (value.is_oa !== true || typeof location.url_for_pdf !== "string" || !location.url_for_pdf.trim()) return null;
  return {
    providerRecordId: boundedString(value.doi, 256),
    landingUrl: boundedString(location.url, maximumProviderUrlLength),
    pdfUrl: boundedString(location.url_for_pdf, maximumProviderUrlLength),
    license: boundedString(location.license, 100),
    version: boundedString(location.version, 100),
  };
}

function safePublicHttpsUrl(value: string): URL {
  if (value.length > maximumProviderUrlLength) throw new Error("Open PDF URL is too long");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Open PDF URL must use HTTPS");
  if (url.username || url.password) throw new Error("Open PDF URL must not contain credentials");
  const hostname = url.hostname.toLowerCase();
  if (
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname) ||
    hostname.includes(":")
  ) {
    throw new Error("Open PDF URL must use a public hostname");
  }
  return url;
}

async function readBoundedBytes(response: Response, maximumBytes: number): Promise<Uint8Array> {
  const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error("Open PDF exceeds the 25 MB limit");
  if (!response.body) throw new Error("Open PDF response has no body");
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
        throw new Error("Open PDF exceeds the 25 MB limit");
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
  return bytes;
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function boundedString(value: unknown, maximumLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

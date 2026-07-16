const version = "v1";

export async function encryptSecret(value: string, encodedKey: string, context: string): Promise<string> {
  if (!value) throw new TypeError("Secret value is required");
  const key = await importKey(encodedKey, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
    key,
    new TextEncoder().encode(value),
  );
  return `${version}.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string, encodedKey: string, context: string): Promise<string> {
  const [storedVersion, encodedIv, encodedCiphertext, extra] = value.split(".");
  if (storedVersion !== version || !encodedIv || !encodedCiphertext || extra !== undefined) {
    throw new TypeError("Encrypted secret is invalid");
  }
  const iv = decodeBase64Url(encodedIv);
  if (iv.byteLength !== 12) throw new TypeError("Encrypted secret is invalid");
  const key = await importKey(encodedKey, "decrypt");
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
      key,
      decodeBase64Url(encodedCiphertext),
    );
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(decrypted);
  } catch {
    throw new TypeError("Encrypted secret could not be opened");
  }
}

async function importKey(encodedKey: string, usage: "decrypt" | "encrypt"): Promise<CryptoKey> {
  const bytes = decodeBase64Url(encodedKey.trim());
  if (bytes.byteLength !== 32) throw new TypeError("Secret encryption key must contain 32 bytes");
  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [usage]);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+={0,2}$/u.test(value)) throw new TypeError("Base64url value is invalid");
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new TypeError("Base64url value is invalid");
  }
}

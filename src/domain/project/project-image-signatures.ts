import { isInertSvgImage, type ProjectImageMediaType } from "./project-files";

export function hasProjectImageSignature(mediaType: ProjectImageMediaType, bytes: Uint8Array): boolean {
  const ascii = (start: number, end: number): string => new TextDecoder().decode(bytes.subarray(start, end));
  if (mediaType === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (mediaType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mediaType === "image/gif") return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
  if (mediaType === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (mediaType === "image/avif") return ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12));
  return isInertSvgImage(bytes);
}

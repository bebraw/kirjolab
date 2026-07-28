export function stripProviderMarkup(value: string): string {
  return value
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll(/&lt;/gu, "<")
    .replaceAll(/&gt;/gu, ">")
    .replaceAll(/&amp;/gu, "&")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

export function boundProviderText(value: string, maximumLength: number): string {
  return value.slice(0, maximumLength);
}

type LatexCommandArgument =
  { readonly kind: "open"; readonly open: number } | { readonly kind: "absent"; readonly next: number } | { readonly kind: "malformed" };

export function latexCommandArgument(source: string, from: number): LatexCommandArgument {
  let cursor = skipLatexWhitespace(source, from);
  while (source[cursor] === "[") {
    const close = source.indexOf("]", cursor + 1);
    if (close < 0) return { kind: "malformed" };
    cursor = skipLatexWhitespace(source, close + 1);
  }
  return source[cursor] === "{" ? { kind: "open", open: cursor } : { kind: "absent", next: cursor };
}

export function skipLatexWhitespace(source: string, from: number): number {
  let cursor = from;
  while (cursor < source.length && /\s/u.test(source[cursor]!)) cursor += 1;
  return cursor;
}

export function matchingLatexBrace(source: string, open: number, end = source.length): number {
  let depth = 0;
  for (let index = open; index < end; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

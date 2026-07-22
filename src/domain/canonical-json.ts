import { canonicalValue } from "./canonical-value";

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

import * as v from "valibot";
import type { CitationAssertion } from "./citation-assertions";
import { isCitationAssertionContract, isIdentifier, isResponseId, isTimestamp } from "./citation-contract-validation";
import type { CitationExpansionResult } from "./citation-expansion-types";
import { isValidDoi } from "./publication-intake";

const boundedString = (maximum: number) => v.pipe(v.string(), v.maxLength(maximum));
const citationExpansionCandidateSchema = v.object({
  doi: v.pipe(v.string(), v.check(isValidDoi)),
  title: boundedString(2_000),
  authors: boundedString(2_000),
  year: boundedString(100),
  unstructured: boundedString(4_000),
});
const citationExpansionResultSchema = v.object({
  provider: v.literal("crossref"),
  direction: v.literal("references"),
  seedReferenceId: v.custom<string>(isIdentifier),
  retrievedAt: v.custom<string>(isTimestamp),
  responseId: v.custom<string>(isResponseId),
  sourceLocator: boundedString(2_000),
  assertions: v.pipe(v.array(v.custom<CitationAssertion>(isCitationAssertionContract)), v.maxLength(128)),
  unmatched: v.pipe(v.array(citationExpansionCandidateSchema), v.maxLength(128)),
  truncated: v.boolean(),
  requestedBy: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
});

export function isCitationExpansionResult(value: unknown): value is CitationExpansionResult {
  return v.is(citationExpansionResultSchema, value);
}

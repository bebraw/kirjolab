import { describe, it } from "vitest";

const isMutationWorker = process.env.STRYKER_MUTATOR_WORKER !== undefined;
export const itOutsideMutation = isMutationWorker ? it.skip : it;
export const describeOutsideMutation = isMutationWorker ? describe.skip : describe;

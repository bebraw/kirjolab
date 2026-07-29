/**
 * Compatibility facade for reference-library contracts.
 *
 * New consumers should import the narrow capability module below. Existing
 * consumers may continue using this facade while migrations remain incremental.
 */
export * from "./reference-library/artifact-analysis";
export * from "./reference-library/artifacts";
export * from "./reference-library/metadata";
export * from "./reference-library/pdf-annotations";
export * from "./reference-library/research";
export * from "./reference-library/snapshot";
export * from "./reference-library/web-sources";

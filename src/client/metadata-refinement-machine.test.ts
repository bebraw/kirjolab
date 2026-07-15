import { afterEach, describe, expect, it } from "vitest";
import { createMetadataRefinementActor, metadataRefinementBusy, type MetadataRefinementActor } from "./metadata-refinement-machine";
import type { MetadataRefinementPreview } from "../domain/reference-library";

const actors: MetadataRefinementActor[] = [];
const local = {
  title: "Local title",
  authors: ["Local Author"],
  year: "2025",
  doi: "10.1000/local",
  pagesScanned: 2,
  diagnostics: [],
};
const preview: MetadataRefinementPreview = { referenceId: "ref-1", artifactId: "pdf-1", candidates: [] };

afterEach(() => {
  for (const actor of actors.splice(0)) actor.stop();
});

function actor(): MetadataRefinementActor {
  const value = createMetadataRefinementActor();
  actors.push(value);
  return value;
}

describe("metadata refinement machine", () => {
  it("coordinates extraction, discovery, review, and apply", () => {
    const value = actor();
    value.send({ type: "START", referenceId: "ref-1", artifactId: "pdf-1" });
    const requestId = value.getSnapshot().context.requestId;
    expect(metadataRefinementBusy(value.getSnapshot())).toBe(true);
    value.send({ type: "LOCAL_READY", requestId, local });
    value.send({ type: "DISCOVERY_READY", requestId, preview });
    expect(value.getSnapshot()).toMatchObject({ value: "reviewing", context: { local, preview } });
    value.send({ type: "APPLY", referenceId: "ref-1" });
    value.send({ type: "APPLIED" });
    expect(value.getSnapshot().value).toBe("complete");
  });

  it("keeps local suggestions reviewable when provider discovery fails", () => {
    const value = actor();
    value.send({ type: "START", referenceId: "ref-1", artifactId: "pdf-1" });
    const requestId = value.getSnapshot().context.requestId;
    value.send({ type: "LOCAL_READY", requestId, local });
    value.send({ type: "DISCOVERY_FAILED", requestId, message: "Provider unavailable" });
    expect(value.getSnapshot()).toMatchObject({
      value: "reviewing",
      context: { local, preview: null, error: "Provider unavailable" },
    });
  });

  it("ignores late responses after another refinement supersedes the request", () => {
    const value = actor();
    value.send({ type: "START", referenceId: "ref-1", artifactId: "pdf-1" });
    const staleRequest = value.getSnapshot().context.requestId;
    value.send({ type: "START", referenceId: "ref-2", artifactId: "pdf-2" });
    value.send({ type: "LOCAL_READY", requestId: staleRequest, local });
    expect(value.getSnapshot()).toMatchObject({
      value: "extracting",
      context: { referenceId: "ref-2", artifactId: "pdf-2", local: null },
    });
    expect(value.getSnapshot().context.requestId).toBe(staleRequest + 1);
    value.send({ type: "FAIL", requestId: staleRequest, message: "late failure" });
    expect(value.getSnapshot().value).toBe("extracting");
  });

  it("returns to review with the same candidates when apply fails", () => {
    const value = actor();
    value.send({ type: "START", referenceId: "ref-1", artifactId: "pdf-1" });
    const requestId = value.getSnapshot().context.requestId;
    value.send({ type: "LOCAL_READY", requestId, local });
    value.send({ type: "DISCOVERY_READY", requestId, preview });
    value.send({ type: "APPLY", referenceId: "ref-1" });
    value.send({ type: "APPLY_FAILED", message: "Metadata changed" });
    expect(value.getSnapshot()).toMatchObject({
      value: "reviewing",
      context: { local, preview, error: "Metadata changed" },
    });
  });

  it("invalidates work and clears transient context when cancelled", () => {
    const value = actor();
    value.send({ type: "START", referenceId: "ref-1", artifactId: "pdf-1" });
    const requestId = value.getSnapshot().context.requestId;
    value.send({ type: "LOCAL_READY", requestId, local });
    expect(metadataRefinementBusy(value.getSnapshot())).toBe(true);
    value.send({ type: "DISCOVERY_FAILED", requestId: requestId + 1, message: "wrong request" });
    expect(value.getSnapshot().value).toBe("discovering");
    value.send({ type: "CANCEL" });
    expect(value.getSnapshot()).toMatchObject({
      value: "idle",
      context: { requestId: requestId + 1, referenceId: null, artifactId: null, local: null, preview: null, error: null },
    });
    expect(metadataRefinementBusy(value.getSnapshot())).toBe(false);
  });

  it("accepts apply only for the active reference", () => {
    const value = actor();
    value.send({ type: "START", referenceId: "ref-1", artifactId: "pdf-1" });
    const requestId = value.getSnapshot().context.requestId;
    value.send({ type: "LOCAL_READY", requestId, local });
    value.send({ type: "DISCOVERY_READY", requestId, preview });
    value.send({ type: "APPLY", referenceId: "ref-2" });
    expect(value.getSnapshot().value).toBe("reviewing");
    value.send({ type: "APPLY", referenceId: "ref-1" });
    expect(metadataRefinementBusy(value.getSnapshot())).toBe(true);
  });
});

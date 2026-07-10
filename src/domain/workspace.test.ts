import { describe, expect, it } from "vitest";
import {
  isCreateAnnotationInput,
  isCreateCandidateInput,
  isCreateClaimPassageLinkInput,
  isCreatePassageLinkInput,
  isCreateWorkspaceInput,
  isInviteWorkspaceMemberInput,
  isImportBibliographyInput,
  isUpsertClaimInput,
  isWorkspaceSnapshot,
  isWorkspaceMembers,
  isWorkspaceSummaries,
} from "./workspace";

describe("workspace input guards", () => {
  it("accepts complete resource inputs", () => {
    expect(
      isCreateAnnotationInput({
        pdfId: "pdf",
        page: 1,
        quote: "evidence",
        prefix: "before",
        suffix: "after",
        comment: "note",
        rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
      }),
    ).toBe(true);
    expect(isCreatePassageLinkInput({ annotationId: "a", start: 0, end: 4, excerpt: "text" })).toBe(true);
    expect(
      isUpsertClaimInput({
        text: "Evidence supports inspection.",
        note: "Working note",
        evidence: [{ annotationId: "a", relation: "supports" }],
      }),
    ).toBe(true);
    expect(isCreateClaimPassageLinkInput({ claimId: "claim", start: 0, end: 4, excerpt: "text" })).toBe(true);
    expect(isCreateWorkspaceInput({ title: "New study" })).toBe(true);
    expect(isInviteWorkspaceMemberInput({ email: "researcher@example.org" })).toBe(true);
    expect(isImportBibliographyInput({ bibtex: "@article{key, title={Title}}" })).toBe(true);
    expect(isWorkspaceMembers([{ email: "owner@example.org", role: "owner", addedAt: "now" }])).toBe(true);
    expect(
      isWorkspaceSummaries([{ id: "workspace", title: "Study", href: "/workspaces/workspace", createdAt: "now", updatedAt: "now" }]),
    ).toBe(true);
    expect(
      isCreateCandidateInput({ provider: "local", model: "qwen", sourceRevision: 0, sourceIds: ["a"], proposedSource: "## Revised" }),
    ).toBe(true);
    expect(
      isWorkspaceSnapshot({
        id: "demo",
        title: "Title",
        source: "",
        bibliography: "",
        revision: 0,
        pdfs: [],
        publications: [],
        annotations: [],
        links: [],
        claims: [],
        claimEvidenceLinks: [],
        claimLinks: [],
        candidates: [],
      }),
    ).toBe(true);
  });

  it("rejects malformed resource inputs", () => {
    expect(isCreateAnnotationInput(null)).toBe(false);
    expect(isCreateAnnotationInput({ pdfId: "", page: 0, quote: "", prefix: 1, suffix: "", comment: "", rects: [] })).toBe(false);
    expect(isCreatePassageLinkInput({ annotationId: "a", start: -1, end: 0, excerpt: "" })).toBe(false);
    expect(isUpsertClaimInput({ text: "", note: "", evidence: [] })).toBe(false);
    expect(isCreateClaimPassageLinkInput({ claimId: "", start: -1, end: 0, excerpt: "" })).toBe(false);
    expect(isCreateWorkspaceInput({ title: "" })).toBe(false);
    expect(isCreateWorkspaceInput({ title: "x".repeat(121) })).toBe(false);
    expect(isCreateWorkspaceInput(null)).toBe(false);
    expect(isInviteWorkspaceMemberInput({ email: "invalid" })).toBe(false);
    expect(isInviteWorkspaceMemberInput(null)).toBe(false);
    expect(isImportBibliographyInput({ bibtex: "" })).toBe(false);
    expect(isImportBibliographyInput({ bibtex: "x".repeat(2_000_001) })).toBe(false);
    expect(isImportBibliographyInput(null)).toBe(false);
    expect(isWorkspaceMembers(null)).toBe(false);
    for (const member of [
      { email: "", role: "owner", addedAt: "now" },
      { email: "owner@example.org", role: "admin", addedAt: "now" },
      { email: "owner@example.org", role: "member", addedAt: "" },
    ]) {
      expect(isWorkspaceMembers([member]), JSON.stringify(member)).toBe(false);
    }
    expect(isWorkspaceSummaries(null)).toBe(false);
    const validSummary = {
      id: "workspace",
      title: "Study",
      href: "/workspaces/workspace",
      createdAt: "created",
      updatedAt: "updated",
    };
    for (const change of [{ id: "" }, { title: "" }, { href: "" }, { createdAt: "" }, { updatedAt: "" }]) {
      expect(isWorkspaceSummaries([{ ...validSummary, ...change }]), JSON.stringify(change)).toBe(false);
    }
    expect(isCreateCandidateInput({ provider: "", model: "", sourceRevision: -1, sourceIds: [1], proposedSource: "" })).toBe(false);
    expect(isWorkspaceSnapshot({ id: "demo" })).toBe(false);
  });

  it("enforces every annotation boundary", () => {
    const valid = {
      pdfId: "pdf",
      page: 1,
      quote: "evidence",
      prefix: "before",
      suffix: "after",
      comment: "note",
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    };
    for (const change of [
      { pdfId: "" },
      { pdfId: "x".repeat(129) },
      { page: 0 },
      { page: 1.5 },
      { page: "1" },
      { quote: "" },
      { quote: "x".repeat(20_001) },
      { prefix: 1 },
      { prefix: "x".repeat(2_001) },
      { suffix: 1 },
      { suffix: "x".repeat(2_001) },
      { comment: 1 },
      { comment: "x".repeat(4_001) },
      { rects: null },
      { rects: Array.from({ length: 65 }, () => ({ x: 0, y: 0, width: 0.1, height: 0.1 })) },
      { rects: [{ x: -0.1, y: 0, width: 0.1, height: 0.1 }] },
      { rects: [{ x: 0, y: -0.1, width: 0.1, height: 0.1 }] },
      { rects: [{ x: 0, y: 0, width: 0, height: 0.1 }] },
      { rects: [{ x: 0, y: 0, width: 0.1, height: 0 }] },
      { rects: [{ x: 0.95, y: 0, width: 0.1, height: 0.1 }] },
      { rects: [{ x: 0, y: 0.95, width: 0.1, height: 0.1 }] },
      { rects: [{ x: Number.NaN, y: 0, width: 0.1, height: 0.1 }] },
    ]) {
      expect(isCreateAnnotationInput({ ...valid, ...change }), JSON.stringify(change)).toBe(false);
    }
  });

  it("enforces every passage-link boundary", () => {
    const valid = { annotationId: "annotation", start: 0, end: 4, excerpt: "text" };
    for (const change of [
      { annotationId: "" },
      { annotationId: "x".repeat(129) },
      { start: -1 },
      { start: 0.5 },
      { start: "0" },
      { end: 0 },
      { end: 4.5 },
      { end: "4" },
      { excerpt: "" },
      { excerpt: "x".repeat(50_001) },
    ]) {
      expect(isCreatePassageLinkInput({ ...valid, ...change }), JSON.stringify(change)).toBe(false);
    }
  });

  it("enforces every claim boundary", () => {
    const valid = { text: "A proposition", note: "A note", evidence: [{ annotationId: "annotation", relation: "supports" }] };
    for (const change of [
      { text: "" },
      { text: "x".repeat(2_001) },
      { note: 1 },
      { note: "x".repeat(8_001) },
      { evidence: null },
      { evidence: [] },
      { evidence: Array.from({ length: 21 }, (_, index) => ({ annotationId: String(index), relation: "supports" })) },
      { evidence: [{ annotationId: "", relation: "supports" }] },
      { evidence: [{ annotationId: "x".repeat(129), relation: "supports" }] },
      { evidence: [{ annotationId: "annotation", relation: "unknown" }] },
      {
        evidence: [
          { annotationId: "annotation", relation: "supports" },
          { annotationId: "annotation", relation: "extends" },
        ],
      },
    ]) {
      expect(isUpsertClaimInput({ ...valid, ...change }), JSON.stringify(change)).toBe(false);
    }
    expect(isUpsertClaimInput(null)).toBe(false);
  });

  it("enforces every claim-passage boundary", () => {
    const valid = { claimId: "claim", start: 0, end: 4, excerpt: "text" };
    for (const change of [
      { claimId: "" },
      { claimId: "x".repeat(129) },
      { start: -1 },
      { start: 0.5 },
      { start: "0" },
      { end: 0 },
      { end: 4.5 },
      { end: "4" },
      { excerpt: "" },
      { excerpt: "x".repeat(50_001) },
    ]) {
      expect(isCreateClaimPassageLinkInput({ ...valid, ...change }), JSON.stringify(change)).toBe(false);
    }
  });

  it("enforces every candidate boundary", () => {
    const valid = { provider: "local", model: "model", sourceRevision: 0, sourceIds: ["a"], proposedSource: "source" };
    for (const change of [
      { provider: "" },
      { provider: "x".repeat(513) },
      { model: "" },
      { model: "x".repeat(257) },
      { sourceRevision: -1 },
      { sourceRevision: 0.5 },
      { sourceRevision: "0" },
      { sourceIds: "a" },
      { sourceIds: Array.from({ length: 101 }, () => "a") },
      { sourceIds: [1] },
      { sourceIds: [""] },
      { sourceIds: ["x".repeat(129)] },
      { proposedSource: "" },
      { proposedSource: "x".repeat(2_000_001) },
    ]) {
      expect(
        isCreateCandidateInput({ ...valid, ...change }),
        typeof change.sourceIds === "string" ? change.sourceIds : "candidate boundary",
      ).toBe(false);
    }
  });

  it("validates every snapshot field", () => {
    const valid = {
      id: "demo",
      title: "Title",
      source: "",
      bibliography: "",
      revision: 0,
      pdfs: [],
      publications: [],
      annotations: [],
      links: [],
      claims: [],
      claimEvidenceLinks: [],
      claimLinks: [],
      candidates: [],
    };
    for (const change of [
      { id: "" },
      { title: "" },
      { source: null },
      { bibliography: null },
      { revision: "0" },
      { pdfs: null },
      { publications: null },
      { annotations: null },
      { links: null },
      { claims: null },
      { claimEvidenceLinks: null },
      { claimLinks: null },
      { candidates: null },
    ]) {
      expect(isWorkspaceSnapshot({ ...valid, ...change }), JSON.stringify(change)).toBe(false);
    }
    expect(isWorkspaceSnapshot([])).toBe(false);
    expect(isWorkspaceSnapshot("workspace")).toBe(false);
    expect(isWorkspaceSnapshot({ ...valid, claims: [{ id: "claim" }] })).toBe(false);
    expect(isWorkspaceSnapshot({ ...valid, claimEvidenceLinks: [{ relation: "unknown" }] })).toBe(false);
    expect(isWorkspaceSnapshot({ ...valid, claimLinks: [{ start: 2, end: 1 }] })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  isCreateAnnotationInput,
  isCreateCandidateInput,
  isCreatePassageLinkInput,
  isCreateWorkspaceInput,
  isInviteWorkspaceMemberInput,
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
    expect(isCreateWorkspaceInput({ title: "New study" })).toBe(true);
    expect(isInviteWorkspaceMemberInput({ email: "researcher@example.org" })).toBe(true);
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
        annotations: [],
        links: [],
        candidates: [],
      }),
    ).toBe(true);
  });

  it("rejects malformed resource inputs", () => {
    expect(isCreateAnnotationInput(null)).toBe(false);
    expect(isCreateAnnotationInput({ pdfId: "", page: 0, quote: "", prefix: 1, suffix: "", comment: "", rects: [] })).toBe(false);
    expect(isCreatePassageLinkInput({ annotationId: "a", start: -1, end: 0, excerpt: "" })).toBe(false);
    expect(isCreateWorkspaceInput({ title: "" })).toBe(false);
    expect(isCreateWorkspaceInput({ title: "x".repeat(121) })).toBe(false);
    expect(isCreateWorkspaceInput(null)).toBe(false);
    expect(isInviteWorkspaceMemberInput({ email: "invalid" })).toBe(false);
    expect(isInviteWorkspaceMemberInput(null)).toBe(false);
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
      annotations: [],
      links: [],
      candidates: [],
    };
    for (const change of [
      { id: "" },
      { title: "" },
      { source: null },
      { bibliography: null },
      { revision: "0" },
      { pdfs: null },
      { annotations: null },
      { links: null },
      { candidates: null },
    ]) {
      expect(isWorkspaceSnapshot({ ...valid, ...change }), JSON.stringify(change)).toBe(false);
    }
    expect(isWorkspaceSnapshot([])).toBe(false);
    expect(isWorkspaceSnapshot("workspace")).toBe(false);
  });
});

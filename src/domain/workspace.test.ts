import { describe, expect, it } from "vitest";
import {
  isCreateAnnotationInput,
  isCreateAnnotationLinkInput,
  isCreateCandidateInput,
  isCreateClaimPassageLinkInput,
  isCreatePassageLinkInput,
  isCreatePublicationPdfLinkInput,
  isAcceptPublicationIntakeInput,
  isPreviewPublicationIntakeInput,
  isPublicationIntakePreview,
  isCreateWorkspaceInput,
  isInviteWorkspaceMemberInput,
  isImportBibliographyInput,
  isModelCandidate,
  isUpsertClaimInput,
  isWorkspaceSnapshot,
  isWorkspaceMembers,
  isWorkspaceSummaries,
} from "./workspace";

describe("workspace input guards", () => {
  it("accepts complete resource inputs", () => {
    const anchor = {
      version: 1,
      fileId: "main-file",
      relativeStart: "AA",
      relativeEnd: "AQ",
      exact: "text",
      prefix: "",
      suffix: "",
      originalRange: { start: 0, end: 4 },
      anchoredRevision: 0,
    } as const;
    const resolution = { status: "resolved", start: 0, end: 4, text: "text", exactMatch: true } as const;
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
    expect(isCreatePassageLinkInput({ annotationId: "a", fileId: "main-file", start: 0, end: 4, excerpt: "text", sourceRevision: 0 })).toBe(
      true,
    );
    expect(
      isCreateAnnotationLinkInput({
        annotation: {
          pdfId: "pdf",
          page: 1,
          quote: "evidence",
          prefix: "before",
          suffix: "after",
          comment: "note",
          rects: [],
        },
        passage: { fileId: "main-file", start: 0, end: 4, excerpt: "text", sourceRevision: 0 },
      }),
    ).toBe(true);
    expect(
      isUpsertClaimInput({
        text: "Evidence supports inspection.",
        note: "Working note",
        evidence: [{ annotationId: "a", relation: "supports" }],
      }),
    ).toBe(true);
    expect(
      isCreateClaimPassageLinkInput({ claimId: "claim", fileId: "main-file", start: 0, end: 4, excerpt: "text", sourceRevision: 0 }),
    ).toBe(true);
    expect(isCreateWorkspaceInput({ title: "New study" })).toBe(true);
    expect(isInviteWorkspaceMemberInput({ email: "researcher@example.org" })).toBe(true);
    expect(isImportBibliographyInput({ bibtex: "@article{key, title={Title}}" })).toBe(true);
    expect(isCreatePublicationPdfLinkInput({ publicationId: "publication", pdfId: "pdf" })).toBe(true);
    expect(isPreviewPublicationIntakeInput({ pdfId: "pdf", doi: "https://doi.org/10.1000/example" })).toBe(true);
    expect(
      isAcceptPublicationIntakeInput({
        pdfId: "pdf",
        doi: "10.1000/example",
        citationKey: "doe2026",
        metadataFingerprint: "a".repeat(64),
      }),
    ).toBe(true);
    expect(isWorkspaceMembers([{ id: "person-1", email: "owner@example.org", role: "owner", addedAt: "now" }])).toBe(true);
    expect(
      isWorkspaceSummaries([{ id: "workspace", title: "Study", href: "/workspaces/workspace", createdAt: "now", updatedAt: "now" }]),
    ).toBe(true);
    expect(isCreateCandidateInput(validCandidateInput())).toBe(true);
    expect(
      isWorkspaceSnapshot({
        id: "demo",
        title: "Title",
        entryFileId: "main-file",
        files: [{ id: "main-file", path: "main.md", mediaType: "text/markdown", content: "", createdAt: "now", updatedAt: "now" }],
        composition: { content: "", sourceMap: [], diagnostics: [], dependencies: {} },
        source: "",
        bibliography: "",
        revision: 0,
        pdfs: [],
        publications: [],
        projectReferences: [],
        researchShares: [],
        publicationPdfLinks: [{ id: "artifact-link", publicationId: "publication", pdfId: "pdf", createdAt: "now" }],
        annotations: [],
        links: [{ id: "link", annotationId: "annotation", anchor, resolution, createdAt: "now" }],
        claims: [],
        claimEvidenceLinks: [],
        claimLinks: [{ id: "claim-link", claimId: "claim", anchor, resolution, createdAt: "now" }],
        candidates: [],
      }),
    ).toBe(true);
  });

  it("rejects malformed resource inputs", () => {
    expect(isCreateAnnotationInput(null)).toBe(false);
    expect(isCreateAnnotationInput({ pdfId: "", page: 0, quote: "", prefix: 1, suffix: "", comment: "", rects: [] })).toBe(false);
    expect(isCreateAnnotationLinkInput(null)).toBe(false);
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
    expect(isCreatePublicationPdfLinkInput({ publicationId: "", pdfId: "" })).toBe(false);
    expect(isCreatePublicationPdfLinkInput(null)).toBe(false);
    expect(isPreviewPublicationIntakeInput(null)).toBe(false);
    expect(isAcceptPublicationIntakeInput(null)).toBe(false);
    expect(isWorkspaceMembers(null)).toBe(false);
    for (const member of [
      { id: "", email: "owner@example.org", role: "owner", addedAt: "now" },
      { id: "person-1", email: "", role: "owner", addedAt: "now" },
      { id: "person-1", email: "owner@example.org", role: "admin", addedAt: "now" },
      { id: "person-1", email: "owner@example.org", role: "member", addedAt: "" },
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
    expect(isCreateCandidateInput(null)).toBe(false);
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
    const valid = { annotationId: "annotation", fileId: "main-file", start: 0, end: 4, excerpt: "text", sourceRevision: 0 };
    for (const change of [
      { annotationId: "" },
      { annotationId: "x".repeat(129) },
      { fileId: "" },
      { fileId: "x".repeat(129) },
      { start: -1 },
      { start: 0.5 },
      { start: "0" },
      { end: 0 },
      { end: 4.5 },
      { end: "4" },
      { excerpt: "" },
      { excerpt: "x".repeat(50_001) },
      { sourceRevision: -1 },
      { sourceRevision: 0.5 },
      { sourceRevision: "0" },
    ]) {
      expect(isCreatePassageLinkInput({ ...valid, ...change }), JSON.stringify(change)).toBe(false);
    }
  });

  it("requires valid annotation and passage inputs for atomic evidence links", () => {
    const valid = {
      annotation: {
        pdfId: "pdf",
        page: 1,
        quote: "evidence",
        prefix: "before",
        suffix: "after",
        comment: "note",
        rects: [],
      },
      passage: { fileId: "main-file", start: 0, end: 4, excerpt: "text", sourceRevision: 0 },
    };
    expect(isCreateAnnotationLinkInput({ ...valid, annotation: null })).toBe(false);
    expect(isCreateAnnotationLinkInput({ ...valid, annotation: { ...valid.annotation, pdfId: "" } })).toBe(false);
    expect(isCreateAnnotationLinkInput({ ...valid, passage: null })).toBe(false);
    expect(isCreateAnnotationLinkInput({ ...valid, passage: { ...valid.passage, end: 0 } })).toBe(false);
  });

  it("enforces every publication-PDF link boundary", () => {
    const valid = { publicationId: "publication", pdfId: "pdf" };
    for (const change of [
      { publicationId: "" },
      { publicationId: "x".repeat(129) },
      { publicationId: 1 },
      { pdfId: "" },
      { pdfId: "x".repeat(129) },
      { pdfId: 1 },
    ]) {
      expect(isCreatePublicationPdfLinkInput({ ...valid, ...change }), JSON.stringify(change)).toBe(false);
    }
  });

  it("enforces publication-intake preview and acceptance input boundaries", () => {
    const preview = { pdfId: "pdf", doi: "https://doi.org/10.1000/example" };
    for (const change of [{ pdfId: "" }, { pdfId: "x".repeat(129) }, { pdfId: 1 }, { doi: "" }, { doi: "x".repeat(501) }, { doi: 1 }]) {
      expect(isPreviewPublicationIntakeInput({ ...preview, ...change }), JSON.stringify(change)).toBe(false);
    }

    const accepted = { ...preview, citationKey: "doe2026", metadataFingerprint: "a".repeat(64) };
    for (const change of [
      { citationKey: "" },
      { citationKey: "has space" },
      { citationKey: "has,comma" },
      { citationKey: "has[bracket]" },
      { citationKey: "x".repeat(201) },
      { citationKey: 1 },
      { metadataFingerprint: "" },
      { metadataFingerprint: "a".repeat(63) },
      { metadataFingerprint: "a".repeat(65) },
      { metadataFingerprint: "A".repeat(64) },
      { metadataFingerprint: "g".repeat(64) },
      { metadataFingerprint: 1 },
    ]) {
      expect(isAcceptPublicationIntakeInput({ ...accepted, ...change }), JSON.stringify(change)).toBe(false);
    }
    expect(isAcceptPublicationIntakeInput({ ...accepted, pdfId: "" })).toBe(false);
    expect(isAcceptPublicationIntakeInput({ ...accepted, doi: "" })).toBe(false);
    expect(isAcceptPublicationIntakeInput({ ...accepted, citationKey: "x".repeat(200) })).toBe(true);
  });

  it("validates publication-intake preview representations", () => {
    const preview = {
      pdfId: "pdf",
      doi: "10.1000/example",
      metadata: {
        type: "article",
        title: "Inspectable evidence",
        authors: ["Doe, Jane", "Roe, Richard"],
        year: "2026",
        venue: "Journal of Testing",
        doi: "10.1000/example",
        url: "https://doi.org/10.1000/example",
        abstract: "An inspectable abstract.",
      },
      metadataFingerprint: "b".repeat(64),
      citationKey: "doe2026",
      existingPublicationId: null,
    };

    expect(isPublicationIntakePreview(preview)).toBe(true);
    expect(isPublicationIntakePreview({ ...preview, existingPublicationId: "publication" })).toBe(true);
    expect(isPublicationIntakePreview({ ...preview, metadata: { ...preview.metadata, type: undefined } })).toBe(true);
    expect(isPublicationIntakePreview(null)).toBe(false);

    for (const change of [
      { pdfId: "" },
      { pdfId: "x".repeat(129) },
      { doi: "" },
      { doi: "x".repeat(501) },
      { metadata: null },
      { metadataFingerprint: "a".repeat(63) },
      { metadataFingerprint: "A".repeat(64) },
      { citationKey: "" },
      { citationKey: "x".repeat(201) },
      { existingPublicationId: "" },
      { existingPublicationId: "x".repeat(129) },
    ]) {
      expect(isPublicationIntakePreview({ ...preview, ...change }), JSON.stringify(change)).toBe(false);
    }

    for (const metadataChange of [
      { type: "x".repeat(33) },
      { title: "" },
      { title: "x".repeat(2_001) },
      { authors: Array.from({ length: 101 }, () => "Author") },
      { authors: [""] },
      { authors: ["x".repeat(501)] },
      { year: "x".repeat(33) },
      { venue: "x".repeat(2_001) },
      { doi: "" },
      { doi: "x".repeat(501) },
      { url: "x".repeat(2_001) },
      { abstract: "x".repeat(20_001) },
    ]) {
      expect(
        isPublicationIntakePreview({ ...preview, metadata: { ...preview.metadata, ...metadataChange } }),
        JSON.stringify(Object.keys(metadataChange)),
      ).toBe(false);
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
    const valid = { claimId: "claim", fileId: "main-file", start: 0, end: 4, excerpt: "text", sourceRevision: 0 };
    for (const change of [
      { claimId: "" },
      { claimId: "x".repeat(129) },
      { fileId: "" },
      { start: -1 },
      { start: 0.5 },
      { start: "0" },
      { end: 0 },
      { end: 4.5 },
      { end: "4" },
      { excerpt: "" },
      { excerpt: "x".repeat(50_001) },
      { sourceRevision: -1 },
      { sourceRevision: 0.5 },
      { sourceRevision: "0" },
    ]) {
      expect(isCreateClaimPassageLinkInput({ ...valid, ...change }), JSON.stringify(change)).toBe(false);
    }
  });

  it("enforces every candidate boundary", () => {
    const valid = validCandidateInput();
    for (const change of [
      { providerAdapter: "other" },
      { providerLabel: "" },
      { providerLabel: "x".repeat(257) },
      { providerLabel: 1 },
      { model: "" },
      { model: "x".repeat(257) },
      { model: 1 },
      { promptVersion: "revise-selection-v2" },
      { instruction: "" },
      { instruction: "x".repeat(4_001) },
      { instruction: 1 },
      { target: null },
      { target: { ...valid.target, excerpt: "" } },
      { target: { ...valid.target, excerpt: "x".repeat(20_001) } },
      { target: { ...valid.target, sourceRevision: -1 } },
      { evidence: "annotation" },
      { evidence: [] },
      { evidence: Array.from({ length: 13 }, (_, index) => evidenceReference("annotation", String(index))) },
      { evidence: [{ kind: "note", id: "note", version: "v1" }] },
      { evidence: [{ kind: "annotation", id: "", version: "v1" }] },
      { evidence: [{ kind: "annotation", id: "x".repeat(129), version: "v1" }] },
      { evidence: [{ kind: "annotation", id: 1, version: "v1" }] },
      { evidence: [{ kind: "annotation", id: "annotation", version: "" }] },
      { evidence: [{ kind: "annotation", id: "annotation", version: "x".repeat(129) }] },
      { evidence: [{ kind: "annotation", id: "annotation", version: 1 }] },
      { evidence: [{ kind: "annotation", id: "annotation", version: "v1", extra: true }] },
      {
        evidence: [evidenceReference("annotation", "same", "v1"), evidenceReference("annotation", "same", "v2")],
      },
      { proposedReplacement: "" },
      { proposedReplacement: "   " },
      { proposedReplacement: "x".repeat(50_001) },
      { proposedReplacement: 1 },
    ]) {
      expect(isCreateCandidateInput({ ...valid, ...change }), JSON.stringify(Object.keys(change))).toBe(false);
    }

    expect(
      isCreateCandidateInput({
        ...valid,
        evidence: [evidenceReference("annotation", "shared"), evidenceReference("claim", "shared")],
      }),
    ).toBe(true);
    expect(
      isCreateCandidateInput({ ...valid, evidence: Array.from({ length: 12 }, (_, index) => evidenceReference("claim", String(index))) }),
    ).toBe(true);
    expect(
      isCreateCandidateInput({
        ...valid,
        providerLabel: "p".repeat(256),
        model: "m".repeat(256),
        instruction: "i".repeat(4_000),
        target: { ...valid.target, excerpt: "e".repeat(20_000) },
        proposedReplacement: "r".repeat(50_000),
      }),
    ).toBe(true);
    expect(isCreateCandidateInput({ ...valid, legacy: "unexpected" })).toBe(false);
  });

  it("validates immutable grounded candidate representations", () => {
    const valid = validCandidate();
    expect(isModelCandidate(valid)).toBe(true);
    expect(isModelCandidate({ ...valid, status: "accepted" })).toBe(true);
    expect(isModelCandidate({ ...valid, status: "rejected" })).toBe(true);
    expect(isModelCandidate({ ...valid, target: { ...valid.target, resolution: { status: "stale" } } })).toBe(true);

    for (const change of [
      { id: "" },
      { id: "x".repeat(129) },
      { operation: "revise-document" },
      { promptVersion: "revise-selection-v2" },
      { providerAdapter: "other" },
      { providerLabel: "" },
      { providerLabel: "x".repeat(257) },
      { model: "" },
      { model: "x".repeat(257) },
      { instruction: "" },
      { instruction: "x".repeat(4_001) },
      { sourceRevision: -1 },
      { sourceRevision: 0.5 },
      { sourceRevision: "3" },
      { target: null },
      { target: { ...valid.target, extra: true } },
      { target: { ...valid.target, anchor: { ...valid.target.anchor, anchoredRevision: 4 } } },
      { target: { ...valid.target, anchor: { ...valid.target.anchor, exact: "x".repeat(20_001) } } },
      {
        target: {
          ...valid.target,
          resolution: { ...valid.target.resolution, text: "different text!!", exactMatch: true },
        },
      },
      { target: { ...valid.target, resolution: { ...valid.target.resolution, exactMatch: false } } },
      { evidence: [] },
      { evidence: Array.from({ length: 13 }, (_, index) => ({ ...annotationEvidence(), id: String(index) })) },
      { evidence: [{ ...annotationEvidence(), version: "different" }] },
      { evidence: [{ ...claimEvidence(), version: "different" }] },
      { evidence: [{ ...annotationEvidence(), kind: "note" }] },
      { evidence: [{ ...annotationEvidence(), extra: true }] },
      { evidence: [annotationEvidence(), annotationEvidence()] },
      { proposedReplacement: "" },
      { proposedReplacement: " ".repeat(10) },
      { proposedReplacement: "x".repeat(50_001) },
      { status: "stale" },
      { createdAt: "" },
      { createdAt: "x".repeat(129) },
    ]) {
      expect(isModelCandidate({ ...valid, ...change }), JSON.stringify(Object.keys(change))).toBe(false);
    }

    expect(isModelCandidate({ ...valid, sourceIds: ["legacy"] })).toBe(false);
    expect(isModelCandidate({ ...valid, proposedSource: "legacy" })).toBe(false);
    expect(isModelCandidate(null)).toBe(false);
  });

  it("validates every annotation and claim evidence snapshot field", () => {
    const valid = validCandidate();
    const annotation = annotationEvidence();
    for (const change of [
      { id: "" },
      { id: "x".repeat(129) },
      { version: "" },
      { version: "x".repeat(129) },
      { pdfId: "" },
      { pdfId: "x".repeat(129) },
      { page: 0 },
      { page: 1.5 },
      { page: "1" },
      { quote: "" },
      { quote: "x".repeat(20_001) },
      { quote: 1 },
      { prefix: "x".repeat(2_001) },
      { prefix: 1 },
      { suffix: "x".repeat(2_001) },
      { suffix: 1 },
      { comment: "x".repeat(4_001) },
      { comment: 1 },
      { rects: null },
      { rects: Array.from({ length: 65 }, () => ({ x: 0, y: 0, width: 0.1, height: 0.1 })) },
      { rects: [{ x: -1, y: 0, width: 0.1, height: 0.1 }] },
      { createdAt: "" },
      { createdAt: "x".repeat(129) },
      { createdAt: "different" },
    ]) {
      expect(isModelCandidate({ ...valid, evidence: [{ ...annotation, ...change }] }), JSON.stringify(Object.keys(change))).toBe(false);
    }

    const claim = claimEvidence();
    for (const change of [
      { id: "" },
      { id: "x".repeat(129) },
      { version: "" },
      { version: "x".repeat(129) },
      { text: "" },
      { text: "x".repeat(2_001) },
      { text: 1 },
      { note: "x".repeat(8_001) },
      { note: 1 },
      { createdAt: "" },
      { createdAt: "x".repeat(129) },
      { createdAt: 1 },
      { updatedAt: "" },
      { updatedAt: "x".repeat(129) },
      { updatedAt: 1 },
      { updatedAt: "different" },
    ]) {
      expect(isModelCandidate({ ...valid, evidence: [{ ...claim, ...change }] }), JSON.stringify(Object.keys(change))).toBe(false);
    }

    expect(isModelCandidate({ ...valid, evidence: [annotationEvidence(), claimEvidence()] })).toBe(true);
  });

  it("validates every snapshot field", () => {
    const valid = {
      id: "demo",
      title: "Title",
      entryFileId: "main-file",
      files: [{ id: "main-file", path: "main.md", mediaType: "text/markdown", content: "", createdAt: "now", updatedAt: "now" }],
      composition: { content: "", sourceMap: [], diagnostics: [], dependencies: {} },
      source: "",
      bibliography: "",
      revision: 0,
      pdfs: [],
      publications: [],
      projectReferences: [],
      researchShares: [],
      publicationPdfLinks: [],
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
      { publicationPdfLinks: null },
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
    expect(isWorkspaceSnapshot({ ...valid, claimLinks: [{ anchor: null, resolution: null }] })).toBe(false);
    const validPublicationPdfLink = {
      id: "link",
      publicationId: "publication",
      pdfId: "pdf",
      createdAt: "created",
    };
    for (const change of [{ id: "" }, { publicationId: "" }, { pdfId: "" }, { createdAt: "" }]) {
      expect(
        isWorkspaceSnapshot({ ...valid, publicationPdfLinks: [{ ...validPublicationPdfLink, ...change }] }),
        JSON.stringify(change),
      ).toBe(false);
    }
    expect(isWorkspaceSnapshot({ ...valid, candidates: [validCandidate()] })).toBe(true);
    expect(isWorkspaceSnapshot({ ...valid, candidates: [{ ...validCandidate(), providerLabel: "" }] })).toBe(false);
    expect(
      isWorkspaceSnapshot({
        ...valid,
        candidates: [{ id: "legacy", provider: "local", model: "model", sourceIds: [], proposedSource: "document" }],
      }),
    ).toBe(false);
  });
});

function validCandidateInput() {
  return {
    providerAdapter: "openai-compatible",
    providerLabel: "Local model",
    model: "test-model",
    promptVersion: "revise-selection-v1",
    instruction: "Make the selected claim more precise.",
    target: { fileId: "main-file", start: 2, end: 18, excerpt: "selected passage", sourceRevision: 3 },
    evidence: [evidenceReference("annotation", "annotation-1"), evidenceReference("claim", "claim-1")],
    proposedReplacement: "more precise passage",
  } as const;
}

function evidenceReference(kind: "annotation" | "claim", id: string, version = "2026-07-11T08:00:00.000Z") {
  return { kind, id, version } as const;
}

function annotationEvidence() {
  const createdAt = "2026-07-11T08:00:00.000Z";
  return {
    kind: "annotation",
    id: "annotation-1",
    version: createdAt,
    pdfId: "pdf-1",
    page: 4,
    quote: "Inspectable evidence grounds this revision.",
    prefix: "Before. ",
    suffix: " After.",
    comment: "Grounding note",
    rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    createdAt,
  } as const;
}

function claimEvidence() {
  const updatedAt = "2026-07-11T08:01:00.000Z";
  return {
    kind: "claim",
    id: "claim-1",
    version: updatedAt,
    text: "Evidence should remain inspectable.",
    note: "Human-authored synthesis",
    createdAt: "2026-07-11T08:00:00.000Z",
    updatedAt,
  } as const;
}

function validCandidate() {
  const exact = "selected passage";
  return {
    id: "candidate-1",
    operation: "revise-selection",
    promptVersion: "revise-selection-v1",
    providerAdapter: "openai-compatible",
    providerLabel: "Local model",
    model: "test-model",
    instruction: "Make the selected claim more precise.",
    sourceRevision: 3,
    target: {
      anchor: {
        version: 1,
        fileId: "main-file",
        relativeStart: "AA",
        relativeEnd: "AQ",
        exact,
        prefix: "Before. ",
        suffix: " After.",
        originalRange: { start: 2, end: 18 },
        anchoredRevision: 3,
      },
      resolution: { status: "resolved", start: 2, end: 18, text: exact, exactMatch: true },
    },
    evidence: [annotationEvidence(), claimEvidence()],
    proposedReplacement: "more precise passage",
    status: "pending",
    createdAt: "2026-07-11T08:02:00.000Z",
  } as const;
}

import { reviewExportSchemaVersion, type ReviewExportAuthority } from "./review-export-types";

interface HistoryEvent {
  readonly at: string;
  readonly actor: string;
  readonly kind: string;
  readonly subject: string;
  readonly detail: string;
}

export function reviewAuthorityJson(authority: ReviewExportAuthority): string {
  return stableReviewJson({ schemaVersion: reviewExportSchemaVersion, ...authority });
}

export function reviewHistoryJson(authority: ReviewExportAuthority): string {
  const events = [
    ...protocolHistoryEvents(authority),
    ...searchHistoryEvents(authority),
    ...authority.screening.records.flatMap(screeningHistoryEvents),
    ...evidenceHistoryEvents(authority),
    ...modelHistoryEvents(authority),
    ...reassessmentHistoryEvents(authority),
    ...findingHistoryEvents(authority),
  ].sort(
    (left, right) => left.at.localeCompare(right.at) || left.kind.localeCompare(right.kind) || left.subject.localeCompare(right.subject),
  );
  return stableReviewJson({ revision: authority.revision, events });
}

function protocolHistoryEvents(authority: ReviewExportAuthority): readonly HistoryEvent[] {
  return authority.protocol.protocolHistory.map((revision) => ({
    at: revision.createdAt,
    actor: revision.createdBy,
    kind: "protocol-revision",
    subject: String(revision.revision),
    detail: revision.rationale,
  }));
}

function searchHistoryEvents(authority: ReviewExportAuthority): readonly HistoryEvent[] {
  return [
    ...authority.search.runs.map((run) => ({
      at: run.importedAt,
      actor: run.importedBy,
      kind: "search-run",
      subject: run.id,
      detail: `${run.sourceName} · ${run.occurrenceCount} occurrences`,
    })),
    ...authority.search.duplicateCandidates
      .filter((candidate) => candidate.resolvedAt && candidate.resolvedBy)
      .map((candidate) => ({
        at: candidate.resolvedAt!,
        actor: candidate.resolvedBy!,
        kind: "duplicate-resolution",
        subject: candidate.id,
        detail: candidate.status,
      })),
  ];
}

function screeningHistoryEvents(record: ReviewExportAuthority["screening"]["records"][number]): readonly HistoryEvent[] {
  const events = [
    ...record.titleAbstract.decisions.map((decision) =>
      historyEvent("screening-decision", decision.id, decision.createdAt, decision.reviewer, decision.decision),
    ),
    ...record.fullText.decisions.map((decision) =>
      historyEvent("screening-decision", decision.id, decision.createdAt, decision.reviewer, decision.decision),
    ),
  ];
  const titleAdjudication = record.titleAbstract.adjudication;
  if (titleAdjudication)
    events.push(
      historyEvent(
        "screening-adjudication",
        titleAdjudication.id,
        titleAdjudication.createdAt,
        titleAdjudication.adjudicator,
        titleAdjudication.outcome,
      ),
    );
  const fullTextAdjudication = record.fullText.adjudication;
  if (fullTextAdjudication)
    events.push(
      historyEvent(
        "screening-adjudication",
        fullTextAdjudication.id,
        fullTextAdjudication.createdAt,
        fullTextAdjudication.adjudicator,
        fullTextAdjudication.outcome,
      ),
    );
  const finalDecision = record.finalInclusion.decision;
  if (finalDecision)
    events.push(
      historyEvent("final-inclusion-decision", finalDecision.id, finalDecision.createdAt, finalDecision.reviewer, finalDecision.outcome),
    );
  return events;
}

function evidenceHistoryEvents(authority: ReviewExportAuthority): readonly HistoryEvent[] {
  return authority.evidence.records.flatMap((record) => [
    ...record.qualityValues.map((value) => historyEvent("quality-value", value.id, value.createdAt, value.reviewer, value.answerId)),
    ...record.extractionValues.map((value) => historyEvent("extraction-value", value.id, value.createdAt, value.reviewer, value.fieldId)),
  ]);
}

function modelHistoryEvents(authority: ReviewExportAuthority): readonly HistoryEvent[] {
  return authority.model.candidates.map((candidate) =>
    historyEvent(
      "model-candidate",
      candidate.id,
      candidate.disposedAt ?? candidate.createdAt,
      candidate.disposedBy ?? candidate.createdBy,
      `${candidate.operation}:${candidate.disposition}`,
    ),
  );
}

function reassessmentHistoryEvents(authority: ReviewExportAuthority): readonly HistoryEvent[] {
  return authority.reassessment.obligations.flatMap((obligation) =>
    obligation.status === "completed" && obligation.completedAt !== null && obligation.completedBy !== null
      ? [
          historyEvent(
            "reassessment-completion",
            obligation.id,
            obligation.completedAt,
            obligation.completedBy,
            `${obligation.stage}:${obligation.completionRationale ?? ""}`,
          ),
        ]
      : [],
  );
}

function findingHistoryEvents(authority: ReviewExportAuthority): readonly HistoryEvent[] {
  return authority.findings.findings.map((finding) =>
    historyEvent("review-finding", finding.id, finding.createdAt, finding.createdBy, finding.researchQuestionId),
  );
}

export function stableReviewJson(value: unknown): string {
  return `${JSON.stringify(
    value,
    (_key, item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
    },
    2,
  )}\n`;
}

function historyEvent(kind: string, subject: string, at: string, actor: string, detail: string): HistoryEvent {
  return { at, actor, kind, subject, detail };
}

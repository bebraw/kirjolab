import type { ReviewEvidenceSnapshot } from "./review-evidence";
import type { ReviewFindingsSnapshot } from "./review-findings";
import type { ReviewModelSnapshot } from "./review-model";
import type { ReviewScreeningSnapshot } from "./review-screening";
import type { ReviewSearchSnapshot } from "./review-search";
import type { ReviewReassessmentSnapshot, ReviewStudySnapshot } from "./review-study";
import type { ReviewSynthesis } from "./review-synthesis";

export const reviewExportSchemaVersion = "kirjolab-review-package-v1" as const;

export interface ReviewExportAuthority {
  readonly revision: number;
  readonly protocol: ReviewStudySnapshot;
  readonly reassessment: ReviewReassessmentSnapshot;
  readonly search: ReviewSearchSnapshot;
  readonly screening: ReviewScreeningSnapshot;
  readonly evidence: ReviewEvidenceSnapshot;
  readonly model: ReviewModelSnapshot;
  readonly findings: ReviewFindingsSnapshot;
  readonly synthesis: ReviewSynthesis;
}

export interface PrismaFlowData {
  readonly schemaVersion: "prisma-2020-flow-v1";
  readonly reviewRevision: number;
  readonly identified: number;
  readonly duplicatesRemoved: number;
  readonly titleAbstractScreened: number;
  readonly titleAbstractExcluded: number;
  readonly fullTextAssessed: number;
  readonly fullTextExcluded: number;
  readonly included: number;
  readonly exclusionReasons: {
    readonly titleAbstract: Readonly<Record<string, number>>;
    readonly fullText: Readonly<Record<string, number>>;
  };
}

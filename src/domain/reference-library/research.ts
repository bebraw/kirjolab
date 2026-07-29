export interface LibraryNote {
  readonly id: string;
  readonly referenceId: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReadingState {
  readonly referenceId: string;
  readonly status: "unread" | "reading" | "read";
  readonly rating: number | null;
  readonly priority: "low" | "normal" | "high";
  readonly updatedAt: string;
}

export type ResearchShareKind = "artifact" | "note" | "highlight" | "web-snapshot";

export type SharedResearchContent =
  | { readonly kind: "artifact"; readonly name: string; readonly size: number; readonly fingerprint: string; readonly objectKey: string }
  | { readonly kind: "note"; readonly body: string }
  | { readonly kind: "highlight"; readonly page: number; readonly quote: string; readonly comment: string }
  | {
      readonly kind: "web-snapshot";
      readonly snapshotId: string;
      readonly accessedAt: string;
      readonly finalUrl: string;
      readonly contentHash: string;
      readonly rawObjectKey: string | null;
      readonly readableObjectKey: string | null;
      readonly complete: boolean;
      readonly diagnostics: readonly string[];
    };

export interface ResearchShareSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly referenceId: string;
  readonly resourceId: string;
  readonly kind: ResearchShareKind;
  readonly content: SharedResearchContent;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

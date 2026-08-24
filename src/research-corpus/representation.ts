import type { CorpusArtifact, CorpusArtifactPage } from "./service";

export interface CorpusArtifactDocument extends CorpusArtifact {
  readonly links: {
    readonly self: string;
    readonly original: string;
    readonly extractions: Readonly<Record<"pdf-highlights" | "pdf-references" | "pdf-text", string>>;
  };
}

export interface CorpusArtifactPageDocument {
  readonly artifacts: readonly CorpusArtifactDocument[];
  readonly next: string | null;
}

export function corpusArtifactPageDocument(page: CorpusArtifactPage, publicOrigin: string): CorpusArtifactPageDocument {
  return { artifacts: page.artifacts.map((artifact) => corpusArtifactDocument(artifact, publicOrigin)), next: page.next };
}

export function corpusArtifactDocument(artifact: CorpusArtifact, publicOrigin: string): CorpusArtifactDocument {
  const base = `${publicOrigin}/v1/artifacts/${encodeURIComponent(artifact.id)}`;
  return {
    ...artifact,
    links: {
      self: base,
      original: `${base}/representations/original`,
      extractions: {
        "pdf-highlights": `${base}/extractions/pdf-highlights`,
        "pdf-references": `${base}/extractions/pdf-references`,
        "pdf-text": `${base}/extractions/pdf-text`,
      },
    },
  };
}

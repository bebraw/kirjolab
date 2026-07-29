export const pdfReferenceCorpus = [
  {
    name: "numbered DOI bibliography",
    pages: [
      ["Prior work [1] established the method."],
      [
        "References",
        "1. Doe, Jane. 2024. Inspectable Evidence. Journal of Tests. doi:10.5555/evidence.1",
        "2. Roe, Alex. 2023. Reproducible Pipelines. https://example.test/pipeline",
      ],
    ],
    expected: {
      headingPage: 2,
      references: [{ doi: "10.5555/evidence.1" }, { title: "Reproducible Pipelines" }],
      mentions: [{ reference: { doi: "10.5555/evidence.1" }, page: 1, style: "numeric" }],
    },
  },
  {
    name: "author-year bibliography and mention",
    pages: [
      ["The evaluation follows Doe, 2022."],
      ["Bibliography", "Doe, Jane. (2022). Evaluation Without Guesswork. Evaluation Journal."],
    ],
    expected: {
      headingPage: 2,
      references: [{ title: "Evaluation Without Guesswork" }],
      mentions: [{ reference: { title: "Evaluation Without Guesswork" }, page: 1, style: "author-year" }],
    },
  },
  {
    name: "document without bibliography",
    pages: [["Introduction", "No reference section appears in this paper."]],
    expected: { headingPage: null, references: [], mentions: [] },
  },
  {
    name: "accented bibliography heading",
    pages: [["Earlier evidence follows Martin, 2021."], ["Références", "Martin, Marie. 2021. Étude reproductible."]],
    expected: {
      headingPage: 2,
      references: [{ title: "Étude reproductible" }],
      mentions: [{ reference: { title: "Étude reproductible" }, page: 1, style: "author-year" }],
    },
  },
];

export function evaluatePdfReferenceCorpus(samples, analyze) {
  const counts = {
    headings: { truePositive: 0, falsePositive: 0, falseNegative: 0 },
    references: { truePositive: 0, falsePositive: 0, falseNegative: 0 },
    mentions: { truePositive: 0, falsePositive: 0, falseNegative: 0 },
  };
  const failures = [];
  for (const sample of samples) {
    const pages = sample.pages.map((lines, index) => ({ page: index + 1, text: lines.join("\n") }));
    const result = analyze(pages, pages.length);
    compareHeading(sample, result, counts.headings, failures);
    const expectedReferences = new Set(sample.expected.references.map(referenceKey));
    const actualReferences = new Set(result.candidates.map(referenceKey));
    compareSets(sample.name, "reference", expectedReferences, actualReferences, counts.references, failures);
    const candidateKeys = new Map(result.candidates.map((candidate) => [candidate.id, referenceKey(candidate)]));
    const expectedMentions = new Set(
      sample.expected.mentions.map((mention) => mentionKey(referenceKey(mention.reference), mention.page, mention.style)),
    );
    const actualMentions = new Set(
      (result.mentions ?? []).flatMap((mention) => {
        const key = candidateKeys.get(mention.candidateId);
        return key ? [mentionKey(key, mention.page, mention.style)] : [];
      }),
    );
    compareSets(sample.name, "mention", expectedMentions, actualMentions, counts.mentions, failures);
  }
  return {
    corpusVersion: 1,
    documents: samples.length,
    metrics: Object.fromEntries(Object.entries(counts).map(([name, value]) => [name, metric(value)])),
    failures,
  };
}

export function pdfReferenceQualityMarkdown(report) {
  const rows = Object.entries(report.metrics)
    .map(
      ([name, value]) =>
        `| ${name} | ${value.truePositive} | ${value.falsePositive} | ${value.falseNegative} | ${percent(value.precision)} | ${percent(value.recall)} | ${percent(value.f1)} |`,
    )
    .join("\n");
  const failures = report.failures.length
    ? report.failures
        .map(({ sample, category, expected, actual }) => `- ${sample} · ${category}: expected ${expected}; observed ${actual}`)
        .join("\n")
    : "- None";
  return [
    "# PDF Reference Extraction Quality",
    "",
    `Corpus v${report.corpusVersion} · ${report.documents} documents`,
    "",
    "| Signal | TP | FP | FN | Precision | Recall | F1 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    rows,
    "",
    "## Failure examples",
    "",
    failures,
  ].join("\n");
}

function compareHeading(sample, result, counts, failures) {
  const expected = sample.expected.headingPage;
  const actual = result.referencesStartPage;
  if (expected === actual) {
    if (expected !== null) counts.truePositive += 1;
    return;
  }
  if (actual !== null) counts.falsePositive += 1;
  if (expected !== null) counts.falseNegative += 1;
  failures.push({ sample: sample.name, category: "heading", expected: String(expected), actual: String(actual) });
}

function compareSets(sample, category, expected, actual, counts, failures) {
  for (const key of actual) {
    if (expected.has(key)) counts.truePositive += 1;
    else {
      counts.falsePositive += 1;
      failures.push({ sample, category: `${category} false positive`, expected: "absent", actual: key });
    }
  }
  for (const key of expected) {
    if (!actual.has(key)) {
      counts.falseNegative += 1;
      failures.push({ sample, category: `${category} missed`, expected: key, actual: "absent" });
    }
  }
}

function metric(counts) {
  const precision = ratio(counts.truePositive, counts.truePositive + counts.falsePositive);
  const recall = ratio(counts.truePositive, counts.truePositive + counts.falseNegative);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { ...counts, precision, recall, f1 };
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator;
}

function referenceKey(reference) {
  return reference.doi ? `doi:${reference.doi.toLocaleLowerCase()}` : `title:${normalizeText(reference.title ?? "")}`;
}

function mentionKey(reference, page, style) {
  return `${reference}|page:${page}|style:${style}`;
}

function normalizeText(value) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/\p{Mark}/gu, "")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

import { analyzePdfReferencePages } from "../src/lib/pdf-analysis/references";
import { evaluatePdfReferenceCorpus, pdfReferenceCorpus, pdfReferenceQualityMarkdown } from "./pdf-reference-quality.mjs";

const report = evaluatePdfReferenceCorpus(pdfReferenceCorpus, analyzePdfReferencePages);
console.log(process.argv.includes("--json") ? JSON.stringify(report, null, 2) : pdfReferenceQualityMarkdown(report));

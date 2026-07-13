export function createEvidencePdf(text = "Knowledge grows through inspectable evidence."): Buffer {
  return createPdf([text]);
}

export function createTwoPageEvidencePdf(): Buffer {
  return createPdf(["First page keeps its reading position.", "Second page verifies restored PDF context."]);
}

export function createMetadataEvidencePdf(): Buffer {
  return createPdf(["Reviewed paper DOI 10.5555/metadata.review"], {
    Title: "Metadata Review in Practice",
    Author: "Doe, Jane; Roe, Alex",
    CreationDate: "D:20250713120000",
  });
}

function createPdf(pageTexts: string[], information?: Readonly<Record<string, string>>): Buffer {
  const pageIds = pageTexts.map((_, index) => 3 + index);
  const fontId = 3 + pageTexts.length;
  const contentIds = pageTexts.map((_, index) => fontId + 1 + index);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageTexts.length} >>`,
    ...contentIds.map(
      (contentId) =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    ),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pageTexts.map((text) => {
      const content = `BT /F1 18 Tf 72 700 Td (${text}) Tj ET`;
      return `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
    }),
  ];
  const informationId = information ? objects.length + 1 : null;
  if (information) {
    objects.push(
      `<< ${Object.entries(information)
        .map(([key, value]) => `/${key} (${escapePdfString(value)})`)
        .join(" ")} >>`,
    );
  }
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${informationId ? ` /Info ${informationId} 0 R` : ""} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source, "ascii");
}

function escapePdfString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

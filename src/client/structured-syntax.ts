export interface TableRequirements {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export function parseTableRequirements(caption: string, columns: string, rows: string): TableRequirements {
  const parsedColumns = columns
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
  if (parsedColumns.length < 2 || parsedColumns.length > 8) throw new RangeError("Enter between 2 and 8 column names, one per line.");
  const parsedRows = rows
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((value) => value.trim()));
  if (parsedRows.length === 0 || parsedRows.length > 100) throw new RangeError("Enter between 1 and 100 table rows.");
  if (parsedRows.some((row) => row.length !== parsedColumns.length || row.some((cell) => !cell))) {
    throw new TypeError(`Each row must contain ${parsedColumns.length} non-empty cells separated by |.`);
  }
  return { caption: caption.trim(), columns: parsedColumns, rows: parsedRows };
}

export function tableMarkdown(table: TableRequirements): string {
  const lines = [
    `| ${table.columns.map(escapeCell).join(" | ")} |`,
    `| ${table.columns.map(() => "---").join(" | ")} |`,
    ...table.rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ];
  return `${table.caption ? `**${table.caption.replace(/\*/gu, "\\*")}**\n\n` : ""}${lines.join("\n")}`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ").trim();
}

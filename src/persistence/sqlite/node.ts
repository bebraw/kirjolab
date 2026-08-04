import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { URL as NodeURL } from "node:url";
import type { SQLiteCursor, SQLiteRow, SQLiteSql, SQLiteStorage, SQLiteValue } from "./storage";

export interface NodeSQLiteStorageOptions {
  readonly foreignKeys?: boolean;
  readonly readOnly?: boolean;
  readonly timeoutMs?: number;
}

export class NodeSQLiteStorage implements SQLiteStorage {
  readonly #database: DatabaseSync;

  readonly sql: SQLiteSql = {
    exec: <Row extends SQLiteRow>(query: string, ...bindings: SQLiteValue[]): SQLiteCursor<Row> => this.#execute<Row>(query, bindings),
  };

  constructor(path: string | NodeURL, options: NodeSQLiteStorageOptions = {}) {
    this.#database = new DatabaseSync(path, {
      allowBareNamedParameters: false,
      allowExtension: false,
      allowUnknownNamedParameters: false,
      defensive: true,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: options.foreignKeys ?? false,
      readBigInts: false,
      readOnly: options.readOnly ?? false,
      returnArrays: false,
      timeout: options.timeoutMs ?? 5_000,
    });
  }

  close(): void {
    if (this.#database.isOpen) this.#database.close();
  }

  transactionSync<Result>(closure: () => Result): Result {
    if (this.#database.isTransaction) throw new Error("Nested SQLite transactions are not supported");

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = closure();
      if (isPromiseLike(result)) throw new TypeError("SQLite transactions must complete synchronously");
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #execute<Row extends SQLiteRow>(query: string, bindings: readonly SQLiteValue[]): SQLiteCursor<Row> {
    const statement = this.#database.prepare(query);
    const hasTail = hasMeaningfulSqlTail(query, statement);
    const returnsRows = statement.columns().length > 0;

    if (returnsRows) {
      if (hasTail) throw new TypeError("A row-producing statement cannot be followed by another SQL statement");
      const rows = statement.all(...bindings.map(normalizeBinding)).map((row) => normalizeRow<Row>(row));
      return new MaterializedSQLiteCursor(rows);
    }

    if (bindings.length > 0) {
      if (hasTail) throw new TypeError("Bound SQLite statement batches are not supported");
      statement.run(...bindings.map(normalizeBinding));
    } else {
      this.#database.exec(query);
    }
    return new MaterializedSQLiteCursor([]);
  }
}

class MaterializedSQLiteCursor<Row extends SQLiteRow> implements SQLiteCursor<Row>, Iterator<Row> {
  readonly #rows: readonly Row[];
  #index = 0;

  constructor(rows: readonly Row[]) {
    this.#rows = rows;
  }

  [Symbol.iterator](): IterableIterator<Row> {
    return this;
  }

  next(): IteratorResult<Row> {
    const value = this.#rows[this.#index];
    if (value === undefined) return { done: true, value: undefined };
    this.#index += 1;
    return { done: false, value };
  }

  toArray(): Row[] {
    const rows = this.#rows.slice(this.#index);
    this.#index = this.#rows.length;
    return rows.map(copyRow);
  }

  one(): Row {
    const rows = this.toArray();
    if (rows.length !== 1) throw new Error(`Expected exactly one row, received ${rows.length}`);
    const row = rows[0];
    if (row === undefined) throw new Error("Expected exactly one row, received 0");
    return row;
  }
}

function normalizeBinding(value: SQLiteValue): null | number | string | Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)) {
    throw new TypeError("SQLite integer bindings must be safe JavaScript integers");
  }
  return value;
}

function normalizeRow<Row extends SQLiteRow>(source: Record<string, bigint | null | number | string | Uint8Array>): Row {
  const row: SQLiteRow = Object.create(null);
  for (const [key, value] of Object.entries(source)) row[key] = normalizeResult(value);
  return row as Row;
}

function normalizeResult(value: bigint | null | number | string | Uint8Array): SQLiteValue {
  if (typeof value === "bigint") throw new TypeError("SQLite bigint results are outside the portable value contract");
  if (!(value instanceof Uint8Array)) return value;
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function copyRow<Row extends SQLiteRow>(source: Row): Row {
  const row: SQLiteRow = Object.create(null);
  for (const [key, value] of Object.entries(source)) {
    row[key] = value instanceof ArrayBuffer ? value.slice(0) : value;
  }
  return row as Row;
}

function hasMeaningfulSqlTail(query: string, statement: StatementSync): boolean {
  const sourceIndex = query.indexOf(statement.sourceSQL);
  if (sourceIndex < 0) throw new Error("Prepared SQLite source could not be matched to its query");
  const tail = query.slice(sourceIndex + statement.sourceSQL.length);
  return !/^[;\s]*$/u.test(tail);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === "object" || typeof value === "function") && value !== null && "then" in value;
}

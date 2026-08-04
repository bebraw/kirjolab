export type SQLiteValue = ArrayBuffer | string | number | null;

export type SQLiteRow = Record<string, SQLiteValue>;

export interface SQLiteCursor<Row extends SQLiteRow> extends Iterable<Row> {
  toArray(): Row[];
  one(): Row;
}

export interface SQLiteSql {
  exec<Row extends SQLiteRow>(query: string, ...bindings: SQLiteValue[]): SQLiteCursor<Row>;
}

export interface SQLiteStorage {
  readonly sql: SQLiteSql;
  transactionSync<Result>(closure: () => Result): Result;
}

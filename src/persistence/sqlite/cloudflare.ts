import type { SQLiteCursor, SQLiteRow, SQLiteSql, SQLiteStorage, SQLiteValue } from "./storage";

interface CloudflareSQLiteSource {
  readonly sql: {
    exec<Row extends SQLiteRow>(query: string, ...bindings: SQLiteValue[]): SQLiteCursor<Row>;
  };
  transactionSync<Result>(closure: () => Result): Result;
}

export function cloudflareSQLiteStorage(storage: CloudflareSQLiteSource): SQLiteStorage {
  const sql: SQLiteSql = {
    exec<Row extends SQLiteRow>(query: string, ...bindings: SQLiteValue[]): SQLiteCursor<Row> {
      return storage.sql.exec<Row>(query, ...bindings);
    },
  };

  return {
    sql,
    transactionSync<Result>(closure: () => Result): Result {
      return storage.transactionSync(closure);
    },
  };
}

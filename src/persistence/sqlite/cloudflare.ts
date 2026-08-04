import type { SQLiteCursor, SQLiteRow, SQLiteSql, SQLiteStorage, SQLiteValue } from "./storage";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";

interface CloudflareSQLiteSource {
  readonly sql: {
    exec<Row extends SQLiteRow>(query: string, ...bindings: SQLiteValue[]): SQLiteCursor<Row>;
  };
  transactionSync<Result>(closure: () => Result): Result;
}

interface CloudflareSQLiteMigrationContext {
  readonly storage: CloudflareSQLiteSource;
  readonly blockConcurrencyWhile: DurableObjectState["blockConcurrencyWhile"];
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

export function initializeCloudflareSQLiteMigrations(
  context: CloudflareSQLiteMigrationContext,
  migrations: readonly SQLiteMigration[],
): void {
  void context.blockConcurrencyWhile(async () => {
    runSQLiteMigrations(cloudflareSQLiteStorage(context.storage), migrations);
  });
}

const migrationLedgerTable = "_kirjolab_migrations";

interface MigrationLedgerRow extends Record<string, SqlStorageValue> {
  version: number;
  name: string;
}

export interface SQLiteMigration {
  readonly version: number;
  readonly name: string;
  readonly apply: (sql: SQLiteMigrationSql) => undefined;
}

export interface SQLiteMigrationCursor<Row extends Record<string, SqlStorageValue>> {
  toArray(): Row[];
}

export interface SQLiteMigrationSql {
  exec<Row extends Record<string, SqlStorageValue>>(query: string, ...bindings: SqlStorageValue[]): SQLiteMigrationCursor<Row>;
}

export interface SQLiteMigrationStorage {
  readonly sql: SQLiteMigrationSql;
  transactionSync<Result>(closure: () => Result): Result;
}

export function validateSQLiteMigrations(value: unknown): asserts value is readonly SQLiteMigration[] {
  if (!Array.isArray(value)) throw new TypeError("SQLite migrations must be an array");

  let previousVersion = 0;
  for (const migration of value) {
    if (!isRecord(migration)) throw new TypeError("Each SQLite migration must be an object");
    if (!Number.isSafeInteger(migration.version) || typeof migration.version !== "number" || migration.version <= 0) {
      throw new TypeError("SQLite migration versions must be positive safe integers");
    }
    if (migration.version <= previousVersion) {
      throw new TypeError("SQLite migration versions must be unique and strictly increasing");
    }
    if (
      typeof migration.name !== "string" ||
      migration.name.length === 0 ||
      migration.name.length > 200 ||
      migration.name.trim() !== migration.name
    ) {
      throw new TypeError("SQLite migration names must be non-empty, trimmed strings of at most 200 characters");
    }
    if (typeof migration.apply !== "function") throw new TypeError("SQLite migrations require an apply callback");
    previousVersion = migration.version;
  }
}

export function runSQLiteMigrations(storage: SQLiteMigrationStorage, migrations: readonly SQLiteMigration[]): void {
  validateSQLiteMigrations(migrations);
  bootstrapMigrationLedger(storage.sql);

  const appliedByVersion = new Map(
    storage.sql
      .exec<MigrationLedgerRow>(`SELECT version, name FROM ${migrationLedgerTable} ORDER BY version ASC`)
      .toArray()
      .map((row) => [row.version, row.name] as const),
  );

  for (const migration of migrations) {
    const recordedName = appliedByVersion.get(migration.version);
    if (recordedName !== undefined && recordedName !== migration.name) {
      throw new Error(
        `SQLite migration ${migration.version} was recorded as "${recordedName}" and cannot be renamed to "${migration.name}"`,
      );
    }
  }

  const latestAppliedVersion = Math.max(0, ...appliedByVersion.keys());
  for (const migration of migrations) {
    if (!appliedByVersion.has(migration.version) && migration.version < latestAppliedVersion) {
      throw new Error(
        `SQLite migration ${migration.version} cannot be applied after recorded migration ${latestAppliedVersion}; migrations are append-only`,
      );
    }
  }

  for (const migration of migrations) {
    if (appliedByVersion.has(migration.version)) continue;
    storage.transactionSync(() => {
      const result: unknown = migration.apply(storage.sql);
      if (result !== undefined) {
        throw new TypeError(`SQLite migration ${migration.version} apply callback must return undefined synchronously`);
      }
      storage.sql.exec(
        `INSERT INTO ${migrationLedgerTable} (version, name, applied_at) VALUES (?, ?, ?)`,
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
    });
    appliedByVersion.set(migration.version, migration.name);
  }
}

function bootstrapMigrationLedger(sql: SQLiteMigrationSql): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS ${migrationLedgerTable} (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

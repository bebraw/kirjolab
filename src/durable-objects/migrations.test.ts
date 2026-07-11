import { describe, expect, it, vi } from "vitest";
import {
  runSQLiteMigrations,
  validateSQLiteMigrations,
  type SQLiteMigration,
  type SQLiteMigrationCursor,
  type SQLiteMigrationSql,
  type SQLiteMigrationStorage,
} from "./migrations";

const apply = (): undefined => undefined;

describe("SQLite migration definitions", () => {
  it("accepts empty, complete, and non-contiguous phase subsets", () => {
    expect(() => validateSQLiteMigrations([])).not.toThrow();
    expect(() =>
      validateSQLiteMigrations([
        { version: 1, name: "create-schema", apply },
        { version: 2, name: "backfill-resources", apply },
      ] satisfies readonly SQLiteMigration[]),
    ).not.toThrow();
    expect(() => validateSQLiteMigrations([{ version: 4, name: "post-load-backfill", apply }])).not.toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("rejects invalid version %s", (version) => {
    expect(() => validateSQLiteMigrations([{ version, name: "invalid-version", apply }])).toThrow("positive safe integers");
  });

  it("rejects duplicate and decreasing versions", () => {
    expect(() =>
      validateSQLiteMigrations([
        { version: 1, name: "first", apply },
        { version: 1, name: "duplicate", apply },
      ]),
    ).toThrow("unique and strictly increasing");
    expect(() =>
      validateSQLiteMigrations([
        { version: 2, name: "second", apply },
        { version: 1, name: "first", apply },
      ]),
    ).toThrow("unique and strictly increasing");
  });

  it.each(["", " ", " padded", "padded ", "x".repeat(201)])("rejects invalid name %j", (name) => {
    expect(() => validateSQLiteMigrations([{ version: 1, name, apply }])).toThrow("migration names");
  });

  it("rejects non-array, non-object, and missing callback definitions", () => {
    expect(() => validateSQLiteMigrations(null)).toThrow("must be an array");
    expect(() => validateSQLiteMigrations([null])).toThrow("must be an object");
    expect(() => validateSQLiteMigrations([{ version: 1, name: "missing-apply" }])).toThrow("apply callback");
  });
});

describe("SQLite migration runner", () => {
  it("applies each migration once and permits later append-only phases", () => {
    const storage = new FakeMigrationStorage();
    const first = vi.fn(apply);
    const second = vi.fn(apply);

    runSQLiteMigrations(storage, [{ version: 2, name: "initial-phase", apply: first }]);
    runSQLiteMigrations(storage, [{ version: 2, name: "initial-phase", apply: first }]);
    runSQLiteMigrations(storage, [{ version: 4, name: "later-phase", apply: second }]);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(storage.recordedMigrations).toEqual([
      { version: 2, name: "initial-phase" },
      { version: 4, name: "later-phase" },
    ]);
  });

  it("rejects a missing lower version before applying any later migration in the batch", () => {
    const storage = new FakeMigrationStorage();
    const lower = vi.fn(apply);
    const later = vi.fn(apply);
    runSQLiteMigrations(storage, [{ version: 2, name: "already-recorded", apply }]);

    expect(() =>
      runSQLiteMigrations(storage, [
        { version: 1, name: "late-gap", apply: lower },
        { version: 3, name: "otherwise-valid", apply: later },
      ]),
    ).toThrow("migration 1 cannot be applied after recorded migration 2");
    expect(lower).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
    expect(storage.recordedMigrations).toEqual([{ version: 2, name: "already-recorded" }]);
  });

  it("rejects a recorded migration rename before applying a later migration", () => {
    const storage = new FakeMigrationStorage();
    const later = vi.fn(apply);
    runSQLiteMigrations(storage, [{ version: 1, name: "original-name", apply }]);

    expect(() =>
      runSQLiteMigrations(storage, [
        { version: 1, name: "renamed", apply },
        { version: 2, name: "later", apply: later },
      ]),
    ).toThrow('migration 1 was recorded as "original-name" and cannot be renamed to "renamed"');
    expect(later).not.toHaveBeenCalled();
    expect(storage.recordedMigrations).toEqual([{ version: 1, name: "original-name" }]);
  });

  it.each([
    ["a value", 1],
    ["a promise", Promise.resolve()],
  ])("rolls back when an apply callback returns %s", (_description, returnedValue) => {
    const storage = new FakeMigrationStorage();
    const invalidApply = (): undefined => runtimeValue<undefined>(returnedValue);

    expect(() =>
      runSQLiteMigrations(storage, [
        {
          version: 1,
          name: "invalid-result",
          apply(sql): undefined {
            sql.exec("CREATE TABLE should_be_rolled_back (id INTEGER)");
            return invalidApply();
          },
        },
      ]),
    ).toThrow("apply callback must return undefined synchronously");
    expect(storage.recordedMigrations).toEqual([]);
    expect(storage.appliedStatements).toEqual([]);
  });
});

interface RecordedMigration {
  readonly version: number;
  readonly name: string;
}

class FakeMigrationStorage implements SQLiteMigrationStorage {
  #ledger: RecordedMigration[] = [];
  #statements: string[] = [];

  readonly sql: SQLiteMigrationSql = {
    exec: <Row extends Record<string, SqlStorageValue>>(query: string, ...bindings: SqlStorageValue[]): SQLiteMigrationCursor<Row> => {
      const normalized = query.replaceAll(/\s+/g, " ").trim();
      if (normalized.startsWith("SELECT version, name FROM _kirjolab_migrations")) {
        return cursor(this.#ledger.map((migration) => ({ ...migration })));
      }
      if (normalized.startsWith("INSERT INTO _kirjolab_migrations")) {
        const [version, name] = bindings;
        if (typeof version !== "number" || typeof name !== "string") throw new TypeError("Invalid fake migration row");
        this.#ledger.push({ version, name });
      } else if (!normalized.startsWith("CREATE TABLE IF NOT EXISTS _kirjolab_migrations")) {
        this.#statements.push(normalized);
      }
      return cursor([]);
    },
  };

  get recordedMigrations(): readonly RecordedMigration[] {
    return this.#ledger.map((migration) => ({ ...migration }));
  }

  get appliedStatements(): readonly string[] {
    return [...this.#statements];
  }

  transactionSync<Result>(closure: () => Result): Result {
    const ledger = this.recordedMigrations;
    const statements = this.appliedStatements;
    try {
      return closure();
    } catch (error) {
      this.#ledger = ledger.map((migration) => ({ ...migration }));
      this.#statements = [...statements];
      throw error;
    }
  }
}

function cursor<Row extends Record<string, SqlStorageValue>>(rows: readonly Record<string, SqlStorageValue>[]): SQLiteMigrationCursor<Row> {
  return {
    toArray(): Row[] {
      return rows.map((row) => {
        const result = Object.create(null) as Row;
        for (const [key, value] of Object.entries(row)) result[key as keyof Row] = value as Row[keyof Row];
        return result;
      });
    },
  };
}

function runtimeValue<Value>(value: unknown): Value {
  return value as Value;
}

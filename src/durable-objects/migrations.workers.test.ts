import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DocumentRoom } from "./document-room";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";

interface MigrationLedgerRow extends Record<string, SqlStorageValue> {
  name: string;
  version: number;
}

describe("SQLite migrations in the Workers runtime", () => {
  it("rolls callbacks back, records them once, and rejects renamed versions", async () => {
    const stub = env.DOCUMENT_ROOMS.getByName(`migration-runner-${crypto.randomUUID()}`);
    await stub.getSnapshot("migration-runner");

    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      const failingMigration: SQLiteMigration = {
        version: 10_000,
        name: "runtime-rollback-probe",
        apply(sql): undefined {
          sql.exec("CREATE TABLE migration_runtime_probe (value TEXT NOT NULL)");
          sql.exec("INSERT INTO migration_runtime_probe (value) VALUES ('must roll back')");
          throw new Error("deliberate migration failure");
        },
      };

      expect(() => runSQLiteMigrations(state.storage, [failingMigration])).toThrow("deliberate migration failure");
      expect(tableExists(state, "migration_runtime_probe")).toBe(false);
      expect(migrationRows(state).some((row) => row.version === 10_000)).toBe(false);

      let applyCount = 0;
      const successfulMigration: SQLiteMigration = {
        version: 10_000,
        name: "runtime-commit-probe",
        apply(sql): undefined {
          applyCount += 1;
          sql.exec("CREATE TABLE migration_runtime_probe (value TEXT NOT NULL)");
          sql.exec("INSERT INTO migration_runtime_probe (value) VALUES ('committed')");
          return undefined;
        },
      };

      runSQLiteMigrations(state.storage, [successfulMigration]);
      runSQLiteMigrations(state.storage, [successfulMigration]);
      expect(applyCount).toBe(1);
      expect(state.storage.sql.exec<{ value: string }>("SELECT value FROM migration_runtime_probe").one().value).toBe("committed");
      expect(migrationRows(state).filter((row) => row.version === 10_000)).toEqual([{ version: 10_000, name: "runtime-commit-probe" }]);

      expect(() =>
        runSQLiteMigrations(state.storage, [
          {
            version: 10_000,
            name: "renamed-runtime-commit-probe",
            apply(): undefined {
              return undefined;
            },
          },
          {
            version: 10_001,
            name: "must-not-run-after-rename",
            apply(sql): undefined {
              sql.exec("CREATE TABLE migration_after_rename (value TEXT NOT NULL)");
              return undefined;
            },
          },
        ]),
      ).toThrow('was recorded as "runtime-commit-probe" and cannot be renamed');
      expect(tableExists(state, "migration_after_rename")).toBe(false);
    });
  });
});

function migrationRows(state: DurableObjectState): MigrationLedgerRow[] {
  return state.storage.sql.exec<MigrationLedgerRow>("SELECT version, name FROM _kirjolab_migrations ORDER BY version ASC").toArray();
}

function tableExists(state: DurableObjectState, name: string): boolean {
  return (
    state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?", name).one()
      .count === 1
  );
}

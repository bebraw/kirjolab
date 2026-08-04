import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";
import { NodeSQLiteStorage } from "./node";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Node SQLite storage", () => {
  it("executes schema batches and returns bound query rows", () => {
    const storage = new NodeSQLiteStorage(":memory:");

    storage.sql.exec(`
      CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);
      CREATE INDEX notes_body ON notes(body);
    `);
    storage.sql.exec("INSERT INTO notes (id, body) VALUES (?, ?)", 1, "portable");

    const cursor = storage.sql.exec<{ id: number; body: string }>("SELECT id, body FROM notes WHERE id = ?", 1);
    expect([...cursor]).toEqual([{ id: 1, body: "portable" }]);

    storage.close();
  });

  it("normalizes binary values to owned ArrayBuffers", () => {
    const storage = new NodeSQLiteStorage(":memory:");
    const bytes = Uint8Array.from([7, 11, 13]).buffer;

    storage.sql.exec("CREATE TABLE blobs (value BLOB NOT NULL)");
    storage.sql.exec("INSERT INTO blobs (value) VALUES (?)", bytes);
    const row = storage.sql.exec<{ value: ArrayBuffer }>("SELECT value FROM blobs").one();

    expect(row.value).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(row.value)]).toEqual([7, 11, 13]);
    expect(row.value).not.toBe(bytes);

    storage.close();
  });

  it("requires one() to receive exactly one remaining row", () => {
    const storage = new NodeSQLiteStorage(":memory:");

    expect(() => storage.sql.exec<{ value: number }>("SELECT 1 AS value WHERE 0").one()).toThrow("exactly one row");
    expect(() => storage.sql.exec<{ value: number }>("SELECT 1 AS value UNION ALL SELECT 2 AS value").one()).toThrow("exactly one row");
    expect(storage.sql.exec<{ value: number }>("SELECT 3 AS value").one()).toEqual({ value: 3 });

    storage.close();
  });

  it("rolls back thrown, asynchronous, and nested transactions", () => {
    const storage = new NodeSQLiteStorage(":memory:");
    storage.sql.exec("CREATE TABLE events (value TEXT NOT NULL)");

    expect(() =>
      storage.transactionSync(() => {
        storage.sql.exec("INSERT INTO events (value) VALUES ('thrown')");
        throw new Error("stop");
      }),
    ).toThrow("stop");
    expect(() => storage.transactionSync(() => Promise.resolve("later"))).toThrow("must complete synchronously");
    expect(() => storage.transactionSync(() => storage.transactionSync(() => undefined))).toThrow("Nested SQLite transactions");
    expect(storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM events").one()).toEqual({ count: 0 });

    storage.transactionSync(() => storage.sql.exec("INSERT INTO events (value) VALUES ('committed')"));
    expect(storage.sql.exec<{ value: string }>("SELECT value FROM events").one()).toEqual({ value: "committed" });

    storage.close();
  });

  it("persists file-backed state and makes foreign-key policy explicit", () => {
    const directory = mkdtempSync(join(tmpdir(), "kirjolab-sqlite-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "authority.sqlite");
    const first = new NodeSQLiteStorage(path, { foreignKeys: true, timeoutMs: 3210 });

    first.sql.exec(`
      CREATE TABLE parents (id INTEGER PRIMARY KEY);
      CREATE TABLE children (parent_id INTEGER NOT NULL REFERENCES parents(id));
      INSERT INTO parents (id) VALUES (1);
      INSERT INTO children (parent_id) VALUES (1);
    `);
    expect(() => first.sql.exec("INSERT INTO children (parent_id) VALUES (2)")).toThrow();
    expect(first.sql.exec<{ timeout: number }>("PRAGMA busy_timeout").one()).toEqual({ timeout: 3210 });
    first.close();

    const reopened = new NodeSQLiteStorage(path, { foreignKeys: true });
    expect(reopened.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM children").one()).toEqual({ count: 1 });
    reopened.close();
  });

  it("rejects a row-producing statement followed by an ignored SQL tail", () => {
    const storage = new NodeSQLiteStorage(":memory:");

    expect(() => storage.sql.exec("SELECT 1 AS value; SELECT 2 AS value")).toThrow("row-producing statement");

    storage.close();
  });

  it("preserves append-only migration and rollback semantics", () => {
    const storage = new NodeSQLiteStorage(":memory:");
    const first: SQLiteMigration = {
      version: 1,
      name: "create-items",
      apply(sql): undefined {
        sql.exec("CREATE TABLE items (value TEXT NOT NULL)");
        sql.exec("INSERT INTO items (value) VALUES ('kept')");
      },
    };

    runSQLiteMigrations(storage, [first]);
    runSQLiteMigrations(storage, [first]);
    expect(storage.sql.exec<{ value: string }>("SELECT value FROM items").one()).toEqual({ value: "kept" });
    expect(() => runSQLiteMigrations(storage, [{ ...first, name: "renamed" }])).toThrow("cannot be renamed");

    expect(() =>
      runSQLiteMigrations(storage, [
        first,
        {
          version: 2,
          name: "fail-atomically",
          apply(sql): undefined {
            sql.exec("CREATE TABLE rolled_back (value TEXT NOT NULL)");
            throw new Error("migration failed");
          },
        },
      ]),
    ).toThrow("migration failed");
    expect(storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'rolled_back'").one()).toEqual({
      count: 0,
    });
    expect(storage.sql.exec<{ version: number }>("SELECT version FROM _kirjolab_migrations ORDER BY version").toArray()).toEqual([
      { version: 1 },
    ]);

    storage.close();
  });
});

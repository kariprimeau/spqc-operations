import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { buildBackup, type Row } from "../src/backup";
import { upsertSql } from "../src/sql";
import { restoreTest } from "../scripts/restore-test";
import { loadFixtures } from "./helpers";

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));

function freshDb() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS).sort()) db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  return db;
}

function importSql() {
  const { acc, rec } = loadFixtures();
  return upsertSql("accounts", acc.rows as unknown as Row[]) + upsertSql("recurring_expenses", rec.rows as unknown as Row[]);
}

describe("backup before real data (spec section 10)", () => {
  it("refuses the import until a backup has succeeded", () => {
    const db = freshDb();
    expect(() => db.exec(importSql())).toThrow(/successful OneDrive backup/);
    db.exec("INSERT INTO settings (key, value) VALUES ('backup.last_ok_at', '2026-11-23T08:00:00Z')");
    db.exec(importSql());
    db.exec(importSql()); // re-running replaces, never duplicates
    expect(db.prepare("SELECT count(*) n FROM accounts").get()).toEqual({ n: 3 });
    expect(db.prepare("SELECT count(*) n FROM recurring_expenses").get()).toEqual({ n: 3 });
    expect(db.prepare("SELECT amount_cents FROM recurring_expenses WHERE id = 'internet'").get()).toEqual({ amount_cents: null });
  });
});

describe("backup and restore test", () => {
  async function makeBackup() {
    const db = freshDb();
    db.exec("INSERT INTO settings (key, value) VALUES ('backup.last_ok_at', '2026-11-22T08:00:00Z'), ('secret:onedrive.refresh', 'TOPSECRET')");
    db.exec(importSql());
    const { manifest, files } = await buildBackup(async (sql) => db.prepare(sql).all() as Row[], "2026-11-23T08:00:00Z");
    const dir = mkdtempSync(join(tmpdir(), "spqc-backup-"));
    for (const f of files) writeFileSync(join(dir, f.name), f.content);
    return { manifest, files, dir };
  }

  it("writes JSON, CSV and a manifest, without secrets", async () => {
    const { manifest, files } = await makeBackup();
    expect(files.map((f) => f.name).sort()).toEqual([
      "accounts.csv", "accounts.json", "manifest.json", "recurring_expenses.csv", "recurring_expenses.json", "settings.csv", "settings.json"]);
    expect(manifest.tables.accounts!.rows).toBe(3);
    expect(files.map((f) => f.content).join("")).not.toContain("TOPSECRET");
  });

  it("passes on an intact backup and fails on a changed file", async () => {
    const { dir } = await makeBackup();
    expect(await restoreTest(dir, MIGRATIONS)).toEqual([]);
    const p = join(dir, "accounts.json");
    writeFileSync(p, readFileSync(p, "utf8").replace("Alpha Bank", "Alpha Bank X"));
    const problems = await restoreTest(dir, MIGRATIONS);
    expect(problems.join(" ")).toMatch(/accounts.json does not match its checksum/);
  });
});

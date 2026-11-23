// Monthly restore test. Point it at one backup folder in your synced OneDrive:
//
//   npm run restore-test -- "C:\Users\...\OneDrive - ...\_SPQC Backups\2026-11-23"
//   npm run restore-test -- "<folder>" --record     (also records the pass on the site)
//
// It checks every file against the manifest, rebuilds the database from scratch in memory
// using this repository's migrations, and compares every row. Nothing is sent anywhere
// unless --record is given.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { dumpTables, restoreSql, type Manifest, type Row } from "../src/backup";
import { sha256Hex } from "../src/crypto";

export async function restoreTest(folder: string, migrationsDir: string): Promise<string[]> {
  const problems: string[] = [];
  const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")) as Manifest;
  if (manifest.app !== "spqc-operations") throw new Error("Not an SPQC Operations backup");
  const data: Record<string, Row[]> = {};
  for (const [table, info] of Object.entries(manifest.tables)) {
    const text = readFileSync(join(folder, `${table}.json`), "utf8");
    if ((await sha256Hex(text)) !== info.json_sha256) problems.push(`${table}.json does not match its checksum`);
    data[table] = JSON.parse(text) as Row[];
    if (data[table]!.length !== info.rows) problems.push(`${table}: manifest says ${info.rows} rows, file has ${data[table]!.length}`);
  }
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join(migrationsDir, f), "utf8"));
  }
  db.exec(restoreSql(manifest, data));
  const back = await dumpTables(async (sql) => db.prepare(sql).all() as Row[]);
  for (const table of Object.keys(manifest.tables)) {
    const expected = data[table] ?? [];
    let actual = back[table] ?? [];
    if (table === "settings") {
      // restoreSql adds backup.last_ok_at when the backup predates it.
      actual = actual.filter((r) => expected.some((e) => e.key === r.key));
    }
    const norm = (rs: Row[]) => JSON.stringify(rs.map((r) => Object.fromEntries(Object.entries(r).sort())));
    if (norm(expected) !== norm(actual)) problems.push(`${table}: restored rows differ from the backup`);
  }
  db.close();
  return problems;
}

async function main() {
  const folder = process.argv[2];
  if (!folder || folder.startsWith("--")) {
    console.error('Usage: npm run restore-test -- "<backup folder>" [--record]');
    process.exit(2);
  }
  const problems = await restoreTest(folder, fileURLToPath(new URL("../migrations", import.meta.url)));
  const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")) as Manifest;
  if (problems.length) {
    console.error("RESTORE TEST FAILED");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const counts = Object.entries(manifest.tables).map(([t, i]) => `${t} ${i.rows}`).join(", ");
  console.log(`RESTORE TEST PASSED for the backup made ${manifest.created_at} (${counts}).`);
  if (process.argv.includes("--record")) {
    const now = new Date().toISOString();
    execFileSync("npx", ["wrangler", "d1", "execute", "spqc-operations", "--remote", "--command",
      `INSERT INTO settings (key, value) VALUES ('restore.last_ok_at', '${now}') ON CONFLICT(key) DO UPDATE SET value=excluded.value`],
      { stdio: "inherit", shell: process.platform === "win32" });
    console.log("Recorded on the site's Home page.");
  }
}

if (process.argv[1] && /restore-test\.ts$/.test(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });

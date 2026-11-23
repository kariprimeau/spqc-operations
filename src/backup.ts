// Nightly backup: every table as JSON and CSV, plus a manifest with row counts and checksums.
// The same files drive the monthly restore test (scripts/restore-test.ts).

import { toCsv } from "./csv";
import { sha256Hex } from "./crypto";
import { TABLES, setSettings, type Env } from "./db";
import { todayCt } from "./format";
import { accessToken, drivePath, oneDriveConfigured, upload } from "./onedrive";
import { insertSql } from "./sql";

export const SCHEMA_VERSION = 1;

export type Row = Record<string, unknown>;
export type Query = (sql: string) => Promise<Row[]>;

export interface Manifest {
  app: "spqc-operations";
  schema_version: number;
  created_at: string;
  tables: Record<string, { rows: number; json_sha256: string; columns: string[] }>;
}

export interface BackupFile { name: string; content: string; type: string }

/** Settings that must never leave the database: the OneDrive sign-in and sign-in state. */
export const SECRET_PREFIX = "secret:";

export async function dumpTables(q: Query): Promise<Record<string, Row[]>> {
  const out: Record<string, Row[]> = {};
  for (const t of TABLES) {
    const order = t === "settings" ? "key" : "id";
    let rows = await q(`SELECT * FROM ${t} ORDER BY ${order}`);
    if (t === "settings") rows = rows.filter((r) => !String(r.key).startsWith(SECRET_PREFIX));
    out[t] = rows;
  }
  return out;
}

export async function buildBackup(q: Query, createdAt: string): Promise<{ manifest: Manifest; files: BackupFile[] }> {
  const data = await dumpTables(q);
  const files: BackupFile[] = [];
  const manifest: Manifest = { app: "spqc-operations", schema_version: SCHEMA_VERSION, created_at: createdAt, tables: {} };
  for (const [t, rows] of Object.entries(data)) {
    const json = JSON.stringify(rows, null, 2);
    const columns = rows[0] ? Object.keys(rows[0]) : [];
    manifest.tables[t] = { rows: rows.length, json_sha256: await sha256Hex(json), columns };
    files.push({ name: `${t}.json`, content: json, type: "application/json" });
    files.push({ name: `${t}.csv`, content: toCsv(columns, rows.map((r) => columns.map((c) => r[c]))), type: "text/csv" });
  }
  files.push({ name: "manifest.json", content: JSON.stringify(manifest, null, 2), type: "application/json" });
  return { manifest, files };
}

/**
 * SQL that rebuilds the data in an empty database that already has the schema.
 * Settings go first so the "backup before data" triggers allow the rows back in.
 */
export function restoreSql(manifest: Manifest, data: Record<string, Row[]>): string {
  const settings = [...(data.settings ?? [])];
  if (!settings.some((r) => r.key === "backup.last_ok_at")) {
    settings.push({ key: "backup.last_ok_at", value: manifest.created_at });
  }
  return [
    insertSql("settings", settings),
    insertSql("accounts", data.accounts ?? []),
    insertSql("recurring_expenses", data.recurring_expenses ?? []),
  ].join("");
}

export async function runBackup(env: Env, now = new Date()): Promise<{ ok: boolean; message: string }> {
  const attemptAt = now.toISOString();
  if (!oneDriveConfigured(env)) {
    return { ok: false, message: "OneDrive backups are not set up yet." };
  }
  try {
    const q: Query = async (sql) => (await env.DB.prepare(sql).all<Row>()).results;
    const { files } = await buildBackup(q, attemptAt);
    const token = await accessToken(env);
    const folder = `${env.BACKUP_FOLDER || "_SPQC Backups"}/${todayCt(now)}`;
    // Manifest last: a folder with a manifest is a complete backup.
    for (const f of files) await upload(token, drivePath(folder, f.name), f.content, f.type);
    await setSettings(env.DB, {
      "backup.last_attempt_at": attemptAt, "backup.last_ok_at": attemptAt,
      "backup.last_path": folder, "backup.last_error": null,
    });
    return { ok: true, message: `Backup saved to OneDrive: ${folder}` };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await setSettings(env.DB, { "backup.last_attempt_at": attemptAt, "backup.last_error": msg });
    return { ok: false, message: `Backup failed: ${msg}` };
  }
}

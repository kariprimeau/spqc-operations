// Build step 1 import: reads the Accounts and Recurring Expenses CSV exports and writes
// an SQL file to load with wrangler. Nothing is sent anywhere by this script.
//
//   npm run import -- --accounts "C:\path\Accounts.csv" --recurring "C:\path\Recurring Expenses.csv"
//   npx wrangler d1 execute spqc-operations --remote --file import-2026-11-23.sql

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { importAccounts } from "../src/import/accounts";
import { importRecurring } from "../src/import/recurring";
import { upsertSql } from "../src/sql";

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) {
    console.error(`Missing --${name} <file>.\nUsage: npm run import -- --accounts Accounts.csv --recurring "Recurring Expenses.csv" [--out file.sql]`);
    process.exit(2);
  }
  return v;
}

const accountsPath = arg("accounts");
const recurringPath = arg("recurring");
const outIdx = process.argv.indexOf("--out");
const now = new Date();
const importedAt = now.toISOString();
const out = outIdx >= 0 ? process.argv[outIdx + 1]! : `import-${importedAt.slice(0, 10)}.sql`;

try {
  const acc = importAccounts(readFileSync(accountsPath, "utf8"), basename(accountsPath), importedAt);
  const rec = importRecurring(readFileSync(recurringPath, "utf8"), basename(recurringPath), importedAt, acc.rows);

  const sql =
    `-- SPQC Operations import, ${importedAt}\n` +
    `-- ${basename(accountsPath)}: ${acc.rows.length} accounts; ${basename(recurringPath)}: ${rec.rows.length} recurring expenses\n` +
    upsertSql("accounts", acc.rows as unknown as Record<string, unknown>[]) +
    upsertSql("recurring_expenses", rec.rows as unknown as Record<string, unknown>[]) +
    `INSERT INTO settings (key, value) VALUES ('import.last_at', ${"'" + importedAt + "'"}) ON CONFLICT(key) DO UPDATE SET value=excluded.value;\n`;
  writeFileSync(out, sql, "utf8");

  console.log(`Accounts: ${acc.rows.length}`);
  for (const a of acc.rows) console.log(`  ${a.short_name} ••${a.last4}  (${a.account_type ?? "type not recorded"})`);
  console.log(`Recurring expenses: ${rec.rows.length}`);
  const byStatus = new Map<string, number>();
  for (const r of rec.rows) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  for (const [s, n] of byStatus) console.log(`  ${s}: ${n}`);
  const notes = [...acc.warnings, ...rec.warnings];
  if (notes.length) {
    console.log("Notes:");
    for (const w of notes) console.log(`  - ${w}`);
  }
  console.log(`\nWrote ${out}. Load it with:\n  npx wrangler d1 execute spqc-operations --remote --file "${out}"`);
  console.log("The database refuses this import until one OneDrive backup has succeeded.");
} catch (e) {
  console.error(`Import stopped, nothing written: ${(e as Error).message}`);
  process.exit(1);
}

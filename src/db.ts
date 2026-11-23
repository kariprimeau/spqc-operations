import type { Account } from "./import/accounts";
import type { RecurringExpense } from "./import/recurring";

export interface Env {
  DB: D1Database;
  /** e.g. https://spqc.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag from the Cloudflare Access application. */
  ACCESS_AUD?: string;
  /** The only email allowed in (secret). */
  ALLOWED_EMAIL?: string;
  /** OneDrive folder for backups, relative to the drive root. */
  BACKUP_FOLDER?: string;
  MS_TENANT_ID?: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  /** 32-byte key, base64, used to encrypt the stored OneDrive sign-in. */
  TOKEN_KEY?: string;
  /** Local development only: skip the Access check on localhost. */
  DEV_BYPASS_AUTH?: string;
}

export const TABLES = ["accounts", "recurring_expenses", "settings"] as const;

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const r = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string | null }>();
  return r?.value ?? null;
}

export async function getSettings(db: D1Database, prefix: string): Promise<Record<string, string | null>> {
  const { results } = await db.prepare("SELECT key, value FROM settings WHERE key LIKE ?").bind(prefix + "%")
    .all<{ key: string; value: string | null }>();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

export async function setSettings(db: D1Database, values: Record<string, string | null>): Promise<void> {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  await db.batch(Object.entries(values).map(([k, v]) => stmt.bind(k, v)));
}

export async function listAccounts(db: D1Database): Promise<Account[]> {
  const { results } = await db.prepare(
    "SELECT * FROM accounts ORDER BY CASE account_type WHEN 'Banking' THEN 0 ELSE 1 END, short_name",
  ).all<Account>();
  return results;
}

export async function listRecurring(db: D1Database): Promise<RecurringExpense[]> {
  const { results } = await db.prepare(
    "SELECT * FROM recurring_expenses ORDER BY CASE billing_frequency WHEN 'Monthly' THEN 0 ELSE 1 END, next_due_date IS NULL, next_due_date, title",
  ).all<RecurringExpense>();
  return results;
}

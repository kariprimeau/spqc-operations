// SQL text generation for the import and restore scripts (run with `wrangler d1 execute --file`).

export function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`Cannot store ${v}`);
    return String(v);
  }
  if (typeof v === "boolean") return v ? "1" : "0";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Bad column name ${name}`);
  return name;
}

/** INSERT ... ON CONFLICT(id) DO UPDATE, so re-running an import replaces rows instead of duplicating. */
export function upsertSql(table: string, rows: Record<string, unknown>[], key = "id"): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]!).map(ident);
  const updates = cols.filter((c) => c !== key).map((c) => `${c}=excluded.${c}`).join(", ");
  return rows.map((r) =>
    `INSERT INTO ${ident(table)} (${cols.join(", ")}) VALUES (${cols.map((c) => sqlValue(r[c])).join(", ")})` +
    ` ON CONFLICT(${ident(key)}) DO UPDATE SET ${updates};`,
  ).join("\n") + "\n";
}

export function insertSql(table: string, rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]!).map(ident);
  return rows.map((r) =>
    `INSERT INTO ${ident(table)} (${cols.join(", ")}) VALUES (${cols.map((c) => sqlValue(r[c])).join(", ")});`,
  ).join("\n") + "\n";
}

// Small RFC 4180 CSV reader and writer. No dependencies.

export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // byte-order mark
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (inQuotes) throw new Error("CSV ends inside a quoted field");
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  // Drop blank lines.
  return rows.filter((r) => !(r.length === 1 && r[0]!.trim() === ""));
}

/** Rows as objects keyed by the header row. Throws if a required column is missing. */
export function csvObjects(text: string, required: string[]): Record<string, string>[] {
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header) throw new Error("CSV is empty");
  const names = header.map((h) => h.trim());
  const missing = required.filter((r) => !names.includes(r));
  if (missing.length) throw new Error(`CSV is missing column(s): ${missing.join(", ")}`);
  return rows.map((r) => {
    const o: Record<string, string> = {};
    names.forEach((n, i) => { o[n] = (r[i] ?? "").trim(); });
    return o;
  });
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Guard against spreadsheet formula injection when the export is opened in Excel.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s;
  return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

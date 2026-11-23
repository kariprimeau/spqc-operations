// Shared parsing rules for list imports. Blank input always becomes null, never 0 (rule 3).

export class ImportError extends Error {}

export function blankToNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" || t.toUpperCase() === "N/A" ? null : t;
}

/** "11/8/2026" or "11/2/2026 12:00 AM" -> "2026-11-08". Null for blank. Throws on anything else. */
export function parseUsDate(v: string | undefined): string | null {
  const t = blankToNull(v);
  if (t === null) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?$/i.exec(t);
  if (!m) throw new ImportError(`Not a date: "${t}"`);
  const [, mo, d, y] = m;
  const month = Number(mo), day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new ImportError(`Not a date: "${t}"`);
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "$69.99", "1,234.50", "($5.00)" -> cents. Null for blank. Throws on text that is not money. */
export function parseMoneyCents(v: string | undefined): number | null {
  const t = blankToNull(v);
  if (t === null) return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const digits = t.replace(/[()$,\s-]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(digits)) throw new ImportError(`Not an amount: "${t}"`);
  const [whole, frac = ""] = digits.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return neg ? -cents : cents;
}

export function parseYesNo(v: string | undefined): number | null {
  const t = blankToNull(v);
  if (t === null) return null;
  if (/^(yes|y|true)$/i.test(t)) return 1;
  if (/^(no|n|false)$/i.test(t)) return 0;
  throw new ImportError(`Expected Yes or No: "${t}"`);
}

export function parsePercent(v: string | undefined): number | null {
  const t = blankToNull(v);
  if (t === null) return null;
  const n = Number(t.replace("%", ""));
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new ImportError(`Not a percentage: "${t}"`);
  return n;
}

/** Rule 8: last four characters only. Rejects anything longer instead of truncating silently. */
export function requireLast4(v: string | undefined, what: string): string {
  const t = blankToNull(v);
  if (t === null) throw new ImportError(`${what}: account number is blank`);
  const clean = t.replace(/[\s•.*xX-]/g, "");
  if (!/^[A-Za-z0-9]{1,4}$/.test(clean)) {
    throw new ImportError(`${what}: account number must be the last four characters only`);
  }
  return clean.toUpperCase();
}

/** Any run of 5+ digits, optionally with a letter prefix, that could be a full account number. */
const LONG_ACCOUNT = /[A-Za-z]?\d{5,}/;

export interface ScrubbedUrl { url: string | null; removed: boolean }

/**
 * Rule 8 for links: a portal URL may carry a full account number (Fidelity puts it after '#').
 * Keep the link but drop the fragment or query when it holds a long number.
 */
export function scrubUrl(v: string | undefined): ScrubbedUrl {
  const t = blankToNull(v);
  if (t === null) return { url: null, removed: false };
  let u: URL;
  try { u = new URL(t); } catch { throw new ImportError(`Not a link: "${t}"`); }
  if (u.protocol !== "https:") throw new ImportError(`Link must use https: "${t}"`);
  let removed = false;
  if (LONG_ACCOUNT.test(u.hash)) { u.hash = ""; removed = true; }
  if (LONG_ACCOUNT.test(u.search)) { u.search = ""; removed = true; }
  if (LONG_ACCOUNT.test(u.pathname)) {
    throw new ImportError(`Link contains what looks like a full account number; remove it from the list first: ${u.origin}`);
  }
  return { url: u.toString(), removed };
}

export function slug(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

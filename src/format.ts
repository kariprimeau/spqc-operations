// Display rules. Unknown is never zero (rule 3): every formatter takes the words to show for null.

export const NOT_AVAILABLE = "Not available";
export const NOT_CONFIRMED = "Not confirmed";
export const NOT_ESTABLISHED = "Not established";

export function money(cents: number | null | undefined, unknown = NOT_AVAILABLE): string {
  if (cents === null || cents === undefined) return unknown;
  const abs = Math.abs(cents);
  const s = "$" + Math.floor(abs / 100).toLocaleString("en-US") + "." + String(abs % 100).padStart(2, "0");
  return cents < 0 ? `(${s})` : s;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-08" -> "Nov 8, 2026". */
export function date(iso: string | null | undefined, unknown = NOT_CONFIRMED): string {
  if (!iso) return unknown;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return unknown;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** An instant shown in Central Time, e.g. "Nov 22, 2026, 8:15 PM CT". */
export function timeCt(isoInstant: string | null | undefined, unknown = NOT_ESTABLISHED): string {
  if (!isoInstant) return unknown;
  const d = new Date(isoInstant);
  if (Number.isNaN(d.getTime())) return unknown;
  return d.toLocaleString("en-US", {
    timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }) + " CT";
}

/** Today's date in Central Time as YYYY-MM-DD. */
export function todayCt(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function percent(p: number | null | undefined, unknown = NOT_CONFIRMED): string {
  if (p === null || p === undefined) return unknown;
  return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
}

export function yesNo(v: number | null | undefined, unknown = NOT_CONFIRMED): string {
  if (v === null || v === undefined) return unknown;
  return v ? "Yes" : "No";
}

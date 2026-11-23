import { csvObjects } from "../csv";
import { ImportError, blankToNull, parseUsDate, requireLast4, scrubUrl, slug } from "./common";

export interface Account {
  id: string;
  title: string;
  short_name: string;
  account_type: string | null;
  last4: string;
  opened_date: string | null;
  closed_date: string | null;
  overview_url: string | null;
  statement_url: string | null;
  positions_url: string | null;
  activity_url: string | null;
  notes: string | null;
  source_file: string;
  source_row: number;
  imported_at: string;
}

export interface ImportResult<T> { rows: T[]; warnings: string[] }

const REQUIRED = ["Title", "Account Type", "Account Number", "Opened"];

/**
 * Display names. Tradier Business and Tradier Futures are one account, shown as
 * "Tradier Futures" (TTS handoff, Nov 12).
 */
export function shortName(title: string): string {
  if (/^tradier/i.test(title)) return "Tradier Futures";
  return title.replace(/\s+(business\s+)?(checking|account)$/i, "").trim();
}

export function importAccounts(csvText: string, sourceFile: string, importedAt: string): ImportResult<Account> {
  const warnings: string[] = [];
  const objs = csvObjects(csvText, REQUIRED);
  const rows: Account[] = [];
  const seen = new Set<string>();
  objs.forEach((o, i) => {
    const rowNo = i + 2; // header is row 1
    const title = blankToNull(o["Title"]);
    if (!title) throw new ImportError(`${sourceFile} row ${rowNo}: Title is blank`);
    const last4 = requireLast4(o["Account Number"], `${sourceFile} row ${rowNo} (${title})`);
    if (blankToNull(o["Routing Number"])) {
      warnings.push(`${title}: routing number is not stored.`);
    }
    const name = shortName(title);
    const id = `${slug(name)}-${last4.toLowerCase()}`;
    if (seen.has(id)) throw new ImportError(`${sourceFile} row ${rowNo}: duplicate account ${name} ${last4}`);
    seen.add(id);
    const link = (col: string) => {
      const r = scrubUrl(o[col]);
      if (r.removed) warnings.push(`${name} ••${last4}: removed an account number from the ${col}.`);
      return r.url;
    };
    rows.push({
      id,
      title,
      short_name: name,
      account_type: blankToNull(o["Account Type"]),
      last4,
      opened_date: parseUsDate(o["Opened"]),
      closed_date: parseUsDate(o["Closed"]),
      overview_url: link("Overview Link"),
      statement_url: link("Statement Link"),
      positions_url: link("Positions Link"),
      activity_url: link("Activity Link"),
      notes: blankToNull(o["Notes"]),
      source_file: sourceFile,
      source_row: rowNo,
      imported_at: importedAt,
    });
  });
  return { rows, warnings };
}

import { csvObjects } from "../csv";
import type { Account, ImportResult } from "./accounts";
import {
  ImportError, blankToNull, parseMoneyCents, parsePercent, parseUsDate, parseYesNo, scrubUrl, slug,
} from "./common";

export type ExpenseStatus = "Upcoming" | "Needs verification" | "Overdue" | "Paid" | "Not confirmed";

export interface RecurringExpense {
  id: string;
  title: string;
  vendor: string | null;
  category: string | null;
  legal_entity: string | null;
  initiative: string | null;
  list_status: string | null;
  billing_frequency: string | null;
  amount_cents: number | null;
  amount_type: string | null;
  next_due_date: string | null;
  expected_charge_date: string | null;
  autopay: number | null;
  paid_from_text: string | null;
  paid_from_account_id: string | null;
  paid_from_kind: "business" | "owner_paid" | null;
  paid_from_last4: string | null;
  billing_account_reference: string | null;
  business_use_percent: number | null;
  reimbursement_needed: number | null;
  billing_portal_url: string | null;
  invoice_download_url: string | null;
  renewal_date: string | null;
  cancel_by_date: string | null;
  last_verified_date: string | null;
  evidence_url: string | null;
  notes: string | null;
  last_observed_charge_text: string | null;
  last_observed_charge_date: string | null;
  source_reference: string | null;
  verification_text: string | null;
  status: ExpenseStatus;
  source_file: string;
  source_row: number;
  imported_at: string;
}

const REQUIRED = ["Title", "Billing Frequency", "Payment Amount", "Paid From Account", "Verification Status"];

/**
 * Status at import. Nothing is Paid, Upcoming or Overdue until a statement line proves it
 * (report brief, Oct 26). The list's own Verification Status decides between the two
 * unverified states.
 */
export function initialStatus(verificationText: string | null): ExpenseStatus {
  if (verificationText === null) return "Not confirmed";
  return "Needs verification";
}

/** "USAA AmEx • 3789" -> institution text + last 4. Rejects long numbers (rule 8). */
export function parsePaidFrom(v: string | null, accounts: Account[]):
  { text: string | null; last4: string | null; accountId: string | null; kind: "business" | "owner_paid" | null } {
  if (v === null) return { text: null, last4: null, accountId: null, kind: null };
  const m = /^(.*?)[\s•·.*-]+((?=[A-Za-z]*\d)[A-Za-z0-9]{1,4})$/.exec(v);
  if (!m) {
    if (/\d{5,}/.test(v)) throw new ImportError(`Paid From Account "${v.replace(/\d/g, "#")}" holds a full account number`);
    return { text: v, last4: null, accountId: null, kind: null };
  }
  const name = m[1]!.trim();
  const last4 = m[2]!.toUpperCase();
  const acct = accounts.find((a) => a.last4 === last4 && name.toLowerCase().startsWith(a.short_name.toLowerCase().split(" ")[0]!));
  return { text: `${name} ••${last4}`, last4, accountId: acct?.id ?? null, kind: acct ? "business" : "owner_paid" };
}

export function importRecurring(
  csvText: string, sourceFile: string, importedAt: string, accounts: Account[],
): ImportResult<RecurringExpense> {
  const warnings: string[] = [];
  const objs = csvObjects(csvText, REQUIRED);
  const rows: RecurringExpense[] = [];
  const seen = new Set<string>();
  objs.forEach((o, i) => {
    const rowNo = i + 2;
    const where = `${sourceFile} row ${rowNo}`;
    const title = blankToNull(o["Title"]);
    if (!title) throw new ImportError(`${where}: Title is blank`);
    const wrap = <T>(f: () => T): T => {
      try { return f(); } catch (e) { throw new ImportError(`${where} (${title}): ${(e as Error).message}`); }
    };
    let id = slug(title);
    if (seen.has(id)) id = `${id}-${rowNo}`;
    seen.add(id);
    const paid = wrap(() => parsePaidFrom(blankToNull(o["Paid From Account"]), accounts));
    const lastObserved = blankToNull(o["Last Observed Charge Date"]);
    const verification = blankToNull(o["Verification Status"]);
    const link = (col: string) => wrap(() => scrubUrl(o[col]).url);
    const amount = wrap(() => parseMoneyCents(o["Payment Amount"]));
    if (amount === null) warnings.push(`${title}: no payment amount; shown as Not available.`);
    const pct = wrap(() => parsePercent(o["Business Use Percent"]));
    if (pct !== null && pct < 100) warnings.push(`${title}: ${pct}% business use is a mixed-use estimate for your accountant to confirm.`);
    rows.push({
      id,
      title,
      vendor: blankToNull(o["Vendor"]),
      category: blankToNull(o["Category"]),
      legal_entity: blankToNull(o["Legal Entity"]),
      initiative: blankToNull(o["Initiative"]),
      list_status: blankToNull(o["Status"]),
      billing_frequency: blankToNull(o["Billing Frequency"]),
      amount_cents: amount,
      amount_type: blankToNull(o["Amount Type"]),
      next_due_date: wrap(() => parseUsDate(o["Next Due Date"])),
      expected_charge_date: wrap(() => parseUsDate(o["Expected Charge Date"])),
      autopay: wrap(() => parseYesNo(o["Autopay"])),
      paid_from_text: paid.text,
      paid_from_account_id: paid.accountId,
      paid_from_kind: paid.kind,
      paid_from_last4: paid.last4,
      billing_account_reference: blankToNull(o["Billing Account Reference"]),
      business_use_percent: pct,
      reimbursement_needed: wrap(() => parseYesNo(o["Reimbursement Needed"])),
      billing_portal_url: link("Billing Portal URL"),
      invoice_download_url: link("Invoice Download URL"),
      renewal_date: wrap(() => parseUsDate(o["Renewal Date"])),
      cancel_by_date: wrap(() => parseUsDate(o["Cancel By Date"])),
      last_verified_date: wrap(() => parseUsDate(o["Last Verified Date"])),
      evidence_url: link("Evidence URL"),
      notes: blankToNull(o["Notes"]),
      last_observed_charge_text: lastObserved,
      last_observed_charge_date: wrap(() => parseUsDate(lastObserved ?? "")),
      source_reference: blankToNull(o["Source Reference"]),
      verification_text: verification,
      status: initialStatus(verification),
      source_file: sourceFile,
      source_row: rowNo,
      imported_at: importedAt,
    });
  });
  const owner = rows.filter((r) => r.paid_from_kind === "owner_paid");
  if (owner.length) {
    const cards = [...new Set(owner.map((r) => r.paid_from_text))].join(", ");
    warnings.push(`${owner.length} service(s) are paid from personal cards (${cards}); they are shown as owner-paid, not business accounts.`);
  }
  return { rows, warnings };
}

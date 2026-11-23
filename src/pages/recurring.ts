import type { RecurringExpense } from "../import/recurring";
import { NOT_AVAILABLE, NOT_CONFIRMED, date, money, percent, timeCt, todayCt, yesNo } from "../format";
import { chip, html, page, type Html } from "../html";

/** Only rows not awaiting verification count toward confirmed totals (report brief, Oct 26). */
export function isConfirmed(r: RecurringExpense): boolean {
  return r.status !== "Needs verification" && r.status !== "Not confirmed";
}

export interface Totals {
  confirmedMonthlyCents: number | null;  // null when no monthly row is confirmed
  confirmedMonthlyCount: number;
  monthlyCount: number;
  listedMonthlyCents: number | null;     // sum of listed (unverified) amounts
  listedMonthlyMissing: number;          // monthly rows with no amount
  annualCount: number;
  listedAnnualCents: number | null;
}

export function totals(rows: RecurringExpense[]): Totals {
  const monthly = rows.filter((r) => r.billing_frequency === "Monthly");
  const annual = rows.filter((r) => r.billing_frequency === "Annual");
  const sum = (rs: RecurringExpense[]) => {
    const known = rs.filter((r) => r.amount_cents !== null);
    return known.length ? known.reduce((s, r) => s + r.amount_cents!, 0) : null;
  };
  const confirmed = monthly.filter(isConfirmed);
  return {
    confirmedMonthlyCents: confirmed.length ? sum(confirmed) : null,
    confirmedMonthlyCount: confirmed.length,
    monthlyCount: monthly.length,
    listedMonthlyCents: sum(monthly),
    listedMonthlyMissing: monthly.filter((r) => r.amount_cents === null).length,
    annualCount: annual.length,
    listedAnnualCents: sum(annual),
  };
}

function observedSource(r: RecurringExpense): string {
  const m = /^Finances retrieved (\d{4}-\d{2}-\d{2})/.exec(r.source_reference ?? "");
  return m ? `old finance feed, retrieved ${date(m[1])}` : "as exported";
}

function lastObserved(r: RecurringExpense): Html {
  if (!r.last_observed_charge_text) return html`<span class="muted">${NOT_CONFIRMED}</span>`;
  const time = /\s(\d{1,2}:\d{2}\s*[AP]M)$/i.exec(r.last_observed_charge_text)?.[1];
  return html`${date(r.last_observed_charge_date)}${time ? ` ${time}` : ""}<div class="sub">Last observed, ${observedSource(r)}</div>`;
}

function nextDue(r: RecurringExpense, today: string): Html {
  if (!r.next_due_date) return html`<span class="muted">${NOT_CONFIRMED}</span>`;
  const passed = r.next_due_date < today && !isConfirmed(r);
  return html`${date(r.next_due_date)} <span class="chip c-grey">Estimated</span>${passed ? html`<div class="sub">Date has passed; no payment evidence yet</div>` : ""}`;
}

function paidFrom(r: RecurringExpense): Html {
  if (!r.paid_from_text) return html`<span class="muted">${NOT_CONFIRMED}</span>`;
  if (r.paid_from_kind === "owner_paid") return html`Owner-paid · ${r.paid_from_text}<div class="sub">Personal card, not a business account</div>`;
  return html`${r.paid_from_text}`;
}

function detail(r: RecurringExpense): Html {
  const items: [string, string | Html][] = [
    ["Vendor", r.vendor ?? NOT_CONFIRMED],
    ["Category", r.category ?? NOT_CONFIRMED],
    ["Initiative", r.initiative ?? NOT_CONFIRMED],
    ["Autopay", yesNo(r.autopay)],
    ["Reimbursement needed", yesNo(r.reimbursement_needed)],
    ["Expected charge date", date(r.expected_charge_date)],
    ["Renewal date", date(r.renewal_date)],
    ["Cancel by", date(r.cancel_by_date)],
    ["Last verified", date(r.last_verified_date)],
    ["Verification (as listed)", r.verification_text ?? NOT_CONFIRMED],
    ["Notes", r.notes ?? "None"],
  ];
  const links: [string, string | null][] = [["Billing portal", r.billing_portal_url], ["Invoices", r.invoice_download_url], ["Evidence", r.evidence_url]];
  return html`<details><summary>Details</summary>
<dl style="display:grid;grid-template-columns:minmax(140px,max-content) 1fr;gap:4px 14px;margin:8px 0 0;font-size:13px;">
${items.map(([k, v]) => html`<dt class="lbl" style="padding-top:2px;">${k}</dt><dd style="margin:0;">${v}</dd>`)}
</dl>
${links.some(([, u]) => u) ? html`<div style="margin-top:6px;">${links.filter(([, u]) => u).map(([t, u], i) =>
    html`${i ? " · " : ""}<a class="link" href="${u}" target="_blank" rel="noreferrer noopener">${t}</a>`)}</div>` : ""}
</details>`;
}

export function recurringPage(rows: RecurringExpense[], now = new Date()): string {
  const today = todayCt(now);
  const t = totals(rows);
  const imported = rows[0]?.imported_at ?? null;
  const body = html`
<h1>Recurring Expenses</h1>
<div class="sub">Services billed on a schedule. A charge counts as paid only when a statement line shows it.</div>
${rows.length === 0 ? html`
<div class="warn" style="margin-top:18px;">No recurring expenses are loaded yet. Next step: run the import described in <span class="mono">docs/SETUP.md</span>, after the first OneDrive backup has succeeded.</div>` : html`
<div class="row" style="margin:16px 0;gap:12px;align-items:stretch;">
  <div class="card" style="padding:12px 14px;min-width:220px;flex:1;">
    <div class="lbl">Confirmed monthly total</div>
    <div class="pf num" style="font-size:24px;margin-top:4px;">${t.confirmedMonthlyCents === null ? NOT_AVAILABLE : money(t.confirmedMonthlyCents)}</div>
    <div class="sub">${t.confirmedMonthlyCount} of ${t.monthlyCount} monthly services confirmed</div>
  </div>
  <div class="card" style="padding:12px 14px;min-width:220px;flex:1;">
    <div class="lbl">Listed monthly amounts, not verified</div>
    <div class="pf num" style="font-size:24px;margin-top:4px;">${money(t.listedMonthlyCents)}</div>
    <div class="sub">${t.listedMonthlyMissing ? `Partial: ${t.listedMonthlyMissing} service(s) have no amount. ` : ""}Full bill amounts, before any business-use share</div>
  </div>
  <div class="card" style="padding:12px 14px;min-width:220px;flex:1;">
    <div class="lbl">Annual commitments, not verified</div>
    <div class="pf num" style="font-size:24px;margin-top:4px;">${money(t.listedAnnualCents)}</div>
    <div class="sub">${t.annualCount} annual service(s), kept separate from monthly</div>
  </div>
</div>
<div class="row noprint" style="margin:0 0 12px;justify-content:space-between;">
  <div class="sub">Loaded from ${rows[0]!.source_file} on ${timeCt(imported)}.</div>
  <a class="btn btn-g" href="/recurring-expenses.csv">Export CSV</a>
</div>
<div class="card scroll">
<table class="tbl cards">
  <thead><tr><th>Service</th><th class="r">Amount</th><th>Last charge</th><th>Next due</th><th>Paid from</th><th class="r">Business use</th><th>Status</th></tr></thead>
  <tbody>${rows.map((r) => html`
    <tr>
      <td data-k="Service"><div><strong>${r.title}</strong>${detail(r)}</div></td>
      <td data-k="Amount" class="r num"><div>${money(r.amount_cents)}<div class="sub">${r.billing_frequency ?? NOT_CONFIRMED}</div></div></td>
      <td data-k="Last charge" class="num"><div>${lastObserved(r)}</div></td>
      <td data-k="Next due" class="num"><div>${nextDue(r, today)}</div></td>
      <td data-k="Paid from"><div>${paidFrom(r)}</div></td>
      <td data-k="Business use" class="r num"><div>${percent(r.business_use_percent)}${r.business_use_percent !== null && r.business_use_percent < 100 ? html`<div class="sub">Estimate; confirm with your accountant</div>` : ""}</div></td>
      <td data-k="Status"><div>${chip(r.status)}</div></td>
    </tr>`)}
  </tbody>
</table>
</div>`}
`;
  return page("Recurring Expenses", "recurring", body);
}

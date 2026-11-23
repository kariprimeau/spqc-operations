import type { Account } from "../import/accounts";
import type { RecurringExpense } from "../import/recurring";
import { NOT_ESTABLISHED, date, money, timeCt, todayCt } from "../format";
import { html, page, type Html } from "../html";

export interface HomeState {
  accounts: Account[];
  recurring: RecurringExpense[];
  settings: Record<string, string | null>;
  oneDriveConfigured: boolean;
  flash?: string | null;
}

const DAY = 86_400_000;

export function restoreTestDue(lastOk: string | null, now: Date): boolean {
  if (!lastOk) return true;
  return now.getTime() - new Date(lastOk).getTime() > 31 * DAY;
}

function backupPanel(s: HomeState, now: Date): Html {
  const st = s.settings;
  const connected = !!st["onedrive.connected_at"];
  const lastOk = st["backup.last_ok_at"] ?? null;
  const lastErr = st["backup.last_error"] ?? null;
  const lastAttempt = st["backup.last_attempt_at"] ?? null;
  const failedLast = !!lastErr && (!lastOk || (lastAttempt ?? "") > lastOk);

  let status: Html;
  let action: Html | string = "";
  if (!s.oneDriveConfigured) {
    status = html`<span class="chip c-warn">Not set up</span> The OneDrive app settings are not configured yet.`;
    action = html`<div class="sub">Next step: follow “OneDrive backups” in <span class="mono">docs/SETUP.md</span>.</div>`;
  } else if (!connected) {
    status = html`<span class="chip c-warn">Not connected</span> OneDrive is not connected.`;
    action = html`<a class="btn btn-p" href="/onedrive/connect">Connect OneDrive</a>`;
  } else if (failedLast) {
    status = html`<span class="chip c-fail">Backup failed</span> ${timeCt(lastAttempt)}: ${lastErr}. The last good backup is ${lastOk ? timeCt(lastOk) : "not established"}.`;
    action = html`<form method="post" action="/backup/run"><button class="btn btn-p" type="submit">Retry backup now</button></form>`;
  } else if (lastOk) {
    status = html`<span class="chip c-ok">Saved</span> Last backup ${timeCt(lastOk)} to <span class="mono">${st["backup.last_path"] ?? "OneDrive"}</span>.`;
    action = html`<form method="post" action="/backup/run"><button class="btn btn-g" type="submit">Back up now</button></form>`;
  } else {
    status = html`<span class="chip c-warn">No backup yet</span> Real data cannot be loaded until the first backup succeeds.`;
    action = html`<form method="post" action="/backup/run"><button class="btn btn-p" type="submit">Run first backup</button></form>`;
  }
  const restoreOk = st["restore.last_ok_at"] ?? null;
  return html`
<div class="card" style="padding:14px 16px;">
  <div class="lbl">Nightly backup to OneDrive</div>
  <div style="margin-top:8px;font-size:14px;line-height:1.5;">${status}</div>
  <div style="margin-top:10px;">${action}</div>
  <div class="sub" style="margin-top:10px;">Monthly restore test: ${restoreOk ? `last passed ${timeCt(restoreOk)}` : "not recorded yet"}${restoreTestDue(restoreOk, now) ? html` · <strong style="color:#7A5C00;">due now</strong> (<span class="mono">npm run restore-test</span>)` : ""}</div>
</div>`;
}

export function homePage(s: HomeState, now = new Date()): string {
  const today = todayCt(now);
  const upcoming = s.recurring
    .filter((r) => r.next_due_date && r.next_due_date >= today)
    .sort((a, b) => a.next_due_date!.localeCompare(b.next_due_date!))
    .slice(0, 3);
  const body = html`
<h1>Home</h1>
<div class="sub">${date(today)}</div>
${s.flash ? html`<div class="warn" style="margin-top:14px;" role="status">${s.flash}</div>` : ""}
<h2>Backups</h2>
${backupPanel(s, now)}
<h2>Accounts</h2>
${s.accounts.length ? html`
<div class="card scroll"><table class="tbl cards">
<thead><tr><th>Account</th><th class="r">Latest balance</th><th>Evidence date</th></tr></thead>
<tbody>${s.accounts.map((a) => html`<tr><td data-k="Account"><div>${a.short_name} ••${a.last4}</div></td><td data-k="Latest balance" class="r muted"><div>Not available</div></td><td data-k="Evidence date" class="muted"><div>${NOT_ESTABLISHED}</div></td></tr>`)}</tbody>
</table></div>
<div class="sub" style="margin-top:6px;">Balances arrive with statement imports in build step 2.</div>` : html`<div class="sub">No accounts loaded yet.</div>`}
<h2>Next estimated charges</h2>
${upcoming.length ? html`
<div class="card scroll"><table class="tbl cards">
<thead><tr><th>Service</th><th class="r">Amount</th><th>Estimated date</th><th>Status</th></tr></thead>
<tbody>${upcoming.map((r) => html`<tr><td data-k="Service"><div>${r.title}</div></td><td data-k="Amount" class="r num"><div>${money(r.amount_cents)}</div></td><td data-k="Estimated date" class="num"><div>${date(r.next_due_date)}</div></td><td data-k="Status"><div>${r.status}</div></td></tr>`)}</tbody>
</table></div>
<div class="sub" style="margin-top:6px;"><a class="link" href="/recurring-expenses">All recurring expenses</a></div>` : html`<div class="sub">No estimated charges from today on. ${s.recurring.length ? html`<a class="link" href="/recurring-expenses">See all recurring expenses</a>` : ""}</div>`}
`;
  return page("Home", "home", body);
}

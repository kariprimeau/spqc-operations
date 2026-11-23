import type { Account } from "../import/accounts";
import { NOT_AVAILABLE, NOT_ESTABLISHED, date, timeCt } from "../format";
import { html, page } from "../html";

export function accountLabel(a: Pick<Account, "short_name" | "last4">): string {
  return `${a.short_name} ••${a.last4}`;
}

export function accountsPage(accounts: Account[]): string {
  const links = (a: Account) => {
    const l: [string, string | null][] = [
      ["Overview", a.overview_url], ["Statements", a.statement_url],
      ["Positions", a.positions_url], ["Activity", a.activity_url],
    ];
    const present = l.filter(([, u]) => u);
    if (!present.length) return html`<span class="muted">None recorded</span>`;
    return html`${present.map(([t, u], i) =>
      html`${i ? " · " : ""}<a class="link" href="${u}" rel="noreferrer noopener" target="_blank">${t}</a>`)}`;
  };
  const imported = accounts[0]?.imported_at ?? null;
  const body = html`
<h1>Accounts</h1>
<div class="sub">Business accounts of Sanguine Penguin Quant Capital LLC. Account numbers show the last four characters only.</div>
${accounts.length === 0 ? html`
<div class="warn" style="margin-top:18px;">No accounts are loaded yet. Next step: run the import described in <span class="mono">docs/SETUP.md</span>, after the first OneDrive backup has succeeded.</div>` : html`
<div class="row noprint" style="margin:16px 0 12px;justify-content:space-between;">
  <div class="sub">Loaded from ${accounts[0]!.source_file} on ${timeCt(imported)}. Balances arrive with statements in build step 2.</div>
  <a class="btn btn-g" href="/accounts.csv">Export CSV</a>
</div>
<div class="card scroll">
<table class="tbl cards">
  <thead><tr><th>Account</th><th>Type</th><th>Opened</th><th class="r">Latest balance</th><th>Evidence date</th><th>Links</th></tr></thead>
  <tbody>${accounts.map((a) => html`
    <tr>
      <td data-k="Account"><div><strong>${accountLabel(a)}</strong>${a.short_name !== a.title ? html`<div class="sub">${a.title}</div>` : ""}${a.closed_date ? html`<div class="sub">Closed ${date(a.closed_date)}</div>` : ""}</div></td>
      <td data-k="Type"><div>${a.account_type ?? NOT_ESTABLISHED}</div></td>
      <td data-k="Opened" class="num"><div>${date(a.opened_date)}</div></td>
      <td data-k="Latest balance" class="r num muted"><div>${NOT_AVAILABLE}</div></td>
      <td data-k="Evidence date" class="muted"><div>${NOT_ESTABLISHED}</div></td>
      <td data-k="Links"><div>${links(a)}</div></td>
    </tr>`)}
  </tbody>
</table>
</div>`}
`;
  return page("Accounts", "accounts", body);
}

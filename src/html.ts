// Page shell. Colors, type and component classes are copied from the approved TTS Scorecard
// handoff (Nov 12, SPQC Black & Gold brand kit). Do not restyle.

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Tagged template that escapes every interpolation unless it is already Html. */
export class Html { constructor(readonly s: string) {} toString() { return this.s; } }
export function html(strings: TemplateStringsArray, ...vals: unknown[]): Html {
  let out = strings[0]!;
  vals.forEach((v, i) => {
    if (Array.isArray(v)) out += v.map((x) => (x instanceof Html ? x.s : esc(x))).join("");
    else out += v instanceof Html ? v.s : v === false || v === null || v === undefined ? "" : esc(v);
    out += strings[i + 1]!;
  });
  return new Html(out);
}
export const raw = (s: string) => new Html(s);

const STYLE = `
  html,body{margin:0;padding:0;background:#FDFBF8;}
  body{font-family:Inter,sans-serif;color:#1C1C1E;-webkit-font-smoothing:antialiased;}
  button,select,input,textarea{font-family:inherit;color:inherit;}
  button{cursor:pointer;}
  a{color:#1C1C1E;}
  .num{font-variant-numeric:tabular-nums;}
  .mono{font-family:'JetBrains Mono',monospace;}
  .pf{font-family:'Playfair Display',serif;}
  .lbl{font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#6A6A6E;}
  .card{background:#FFFFFF;border:1px solid #C9C9CC;}
  .btn{min-height:44px;padding:0 16px;border:1px solid #1C1C1E;background:#FFFFFF;color:#1C1C1E;font-size:14px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;text-decoration:none;}
  .btn-p{background:#0B0B0C;color:#EAEAEA;border-color:#0B0B0C;}
  .btn-g{background:#FFFFFF;border-color:#C9C9CC;}
  .btn:disabled{opacity:0.45;cursor:not-allowed;}
  .btn:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #C9A227;outline-offset:2px;}
  .link{border:none;background:none;padding:0;color:#1C1C1E;font-weight:600;text-decoration:underline;text-decoration-color:#D4AF37;text-underline-offset:3px;}
  .chip{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;padding:3px 7px;white-space:nowrap;}
  .c-new{border:1px dashed #6A6A6E;color:#3A3A3E;background:#FFFFFF;}
  .c-rev{background:#FBF6E7;color:#7A5C00;border:1px solid #D4AF37;}
  .c-ok{background:#1C1C1E;color:#FFFFFF;border:1px solid #1C1C1E;}
  .c-warn{background:#FBF6E7;color:#7A5C00;border:1px solid #D4AF37;}
  .c-grey{background:#F5F5F6;color:#3A3A3E;border:1px solid #C9C9CC;}
  .c-fail{background:#FFFFFF;color:#C1121F;border:1px solid #C1121F;}
  .tbl{width:100%;border-collapse:collapse;}
  .tbl th{text-align:left;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#EAEAEA;background:#0B0B0C;padding:8px 10px;}
  .tbl td{padding:8px 10px;border-top:1px solid #E6E6E8;font-size:13px;vertical-align:top;}
  .tbl .r{text-align:right;}
  .warn{background:#FBF6E7;border-left:4px solid #D4AF37;padding:10px 14px;font-size:14px;line-height:1.45;}
  .fail{background:#FFFFFF;border-left:4px solid #C1121F;padding:10px 14px;font-size:14px;line-height:1.45;}
  .muted{color:#6A6A6E;}
  .sub{font-size:12.5px;color:#6A6A6E;margin-top:2px;}
  .site-h{background:#0B0B0C;}
  .site-h .bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 24px;min-height:60px;}
  .site-h nav{display:flex;gap:22px;align-items:stretch;align-self:stretch;}
  .site-h nav a{display:flex;align-items:center;color:#B4B4B6;font-size:14px;font-weight:500;border-bottom:3px solid transparent;padding-top:3px;text-decoration:none;}
  .site-h nav a[aria-current=page]{color:#FFFFFF;font-weight:700;border-bottom-color:#D4AF37;}
  .rule{height:2px;background:#D4AF37;}
  main{padding:24px 24px 40px;max-width:1240px;}
  h1{font-family:'Playfair Display',serif;font-size:30px;font-weight:600;margin:0 0 6px;}
  h2{font-family:'Playfair Display',serif;font-size:20px;font-weight:600;margin:28px 0 10px;}
  .row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;}
  .scroll{overflow-x:auto;}
  details summary{cursor:pointer;font-weight:600;font-size:13px;}
  @media (max-width:760px){
    .site-h .bar{padding:0 16px;flex-wrap:wrap;}
    .site-h nav{width:100%;gap:16px;min-height:44px;overflow-x:auto;}
    .site-h .tag{display:none;}
    main{padding:16px 16px 32px;}
    h1{font-size:24px;}
    .tbl.cards thead{display:none;}
    .tbl.cards tr{display:block;border-top:1px solid #C9C9CC;padding:8px 0;}
    .tbl.cards td{display:grid;grid-template-columns:104px minmax(0,1fr);gap:10px;border:none;padding:4px 10px;}
    .tbl.cards td::before{content:attr(data-k);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#6A6A6E;padding-top:2px;}
    .tbl.cards td.r{text-align:left;}
  }
  @media print{ .noprint{display:none !important;} }
`;

export type NavKey = "home" | "accounts" | "recurring";
const NAV: [NavKey, string, string][] = [
  ["home", "Home", "/"],
  ["accounts", "Accounts", "/accounts"],
  ["recurring", "Recurring Expenses", "/recurring-expenses"],
];

export function page(title: string, active: NavKey, body: Html): string {
  return "<!doctype html>" + html`<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · SPQC Operations</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${raw(STYLE)}</style>
</head><body>
<header class="site-h">
  <div class="bar">
    <div class="row" style="gap:12px;min-width:0;">
      <img src="/assets/logo.png" alt="Sanguine Penguin Quant Capital" style="height:40px;width:auto;">
      <div style="min-width:0;">
        <div class="pf" style="color:#EAEAEA;font-size:17px;font-weight:600;line-height:1.1;">SPQC Operations</div>
        <div class="mono tag" style="color:#D4AF37;font-size:9px;letter-spacing:0.16em;margin-top:3px;">SANGUINE PENGUIN QUANT CAPITAL LLC</div>
      </div>
    </div>
    <nav aria-label="Site">${NAV.map(([k, t, href]) =>
      html`<a href="${href}"${raw(k === active ? ' aria-current="page"' : "")}>${t}</a>`)}</nav>
  </div>
  <div class="rule"></div>
</header>
<main>${body}</main>
</body></html>`.s;
}

export function chip(status: string): Html {
  const cls: Record<string, string> = {
    "Paid": "c-ok", "Upcoming": "c-grey", "Needs verification": "c-warn",
    "Not confirmed": "c-new", "Overdue": "c-warn",
  };
  return html`<span class="chip ${cls[status] ?? "c-grey"}">${status}</span>`;
}

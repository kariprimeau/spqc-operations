import { LOGO_PNG_BASE64 } from "./assets";
import { authorize, sameOrigin } from "./auth";
import { runBackup } from "./backup";
import { b64ToBytes } from "./crypto";
import { toCsv } from "./csv";
import { getSettings, listAccounts, listRecurring, type Env } from "./db";
import { todayCt } from "./format";
import { esc } from "./html";
import { finishConnect, oneDriveConfigured, startConnect } from "./onedrive";
import { accountsPage } from "./pages/accounts";
import { homePage } from "./pages/home";
import { recurringPage } from "./pages/recurring";

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; form-action 'self' https://login.microsoftonline.com; " +
    "frame-ancestors 'none'; base-uri 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

function respond(body: BodyInit, type: string, extra: Record<string, string> = {}, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": type, ...SECURITY_HEADERS, ...extra } });
}
const htmlResponse = (s: string, status = 200) => respond(s, "text/html; charset=utf-8", {}, status);

function csvResponse(name: string, header: string[], rows: unknown[][]): Response {
  return respond(toCsv(header, rows), "text/csv; charset=utf-8", {
    "Content-Disposition": `attachment; filename="${name}-${todayCt()}.csv"`,
  });
}

function redirectHome(flash?: string): Response {
  const u = flash ? `/?flash=${encodeURIComponent(flash)}` : "/";
  return new Response(null, { status: 303, headers: { Location: u, ...SECURITY_HEADERS } });
}

function denied(reason: string): Response {
  return htmlResponse(`<!doctype html><meta charset="utf-8"><title>Not signed in</title>
<body style="font-family:Inter,sans-serif;padding:24px;color:#1C1C1E;background:#FDFBF8">
<h1 style="font-family:'Playfair Display',serif">SPQC Operations</h1>
<p>This site is limited to its owner. Sign-in was not accepted (${esc(reason)}).</p></body>`, 403);
}

const ALLOWED_FLASH = /^(OneDrive|Backup)[\w\s.,:;'’()/@&-]{0,400}$/;

export async function handle(req: Request, env: Env): Promise<Response> {
  const auth = await authorize(req, env);
  if (!auth.ok) return denied(auth.reason);
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "POST") {
    if (!sameOrigin(req)) return respond("Cross-site request refused", "text/plain", {}, 403);
    if (path === "/backup/run") return redirectHome((await runBackup(env)).message);
    return respond("Not found", "text/plain", {}, 404);
  }
  if (req.method !== "GET" && req.method !== "HEAD") return respond("Method not allowed", "text/plain", {}, 405);

  switch (path) {
    case "/": {
      const flash = url.searchParams.get("flash");
      const [accounts, recurring, settings] = await Promise.all([
        listAccounts(env.DB), listRecurring(env.DB), getSettings(env.DB, ""),
      ]);
      return htmlResponse(homePage({
        accounts, recurring, settings, oneDriveConfigured: oneDriveConfigured(env),
        flash: flash && ALLOWED_FLASH.test(flash) ? flash : null,
      }));
    }
    case "/accounts":
      return htmlResponse(accountsPage(await listAccounts(env.DB)));
    case "/recurring-expenses":
      return htmlResponse(recurringPage(await listRecurring(env.DB)));
    case "/accounts.csv": {
      const rows = await listAccounts(env.DB);
      const cols = ["short_name", "last4", "title", "account_type", "opened_date", "closed_date",
        "overview_url", "statement_url", "positions_url", "activity_url", "notes", "source_file", "imported_at"] as const;
      return csvResponse("spqc-accounts", [...cols], rows.map((r) => cols.map((c) => r[c])));
    }
    case "/recurring-expenses.csv": {
      const rows = await listRecurring(env.DB);
      const cols = ["title", "vendor", "category", "billing_frequency", "amount_cents", "next_due_date",
        "paid_from_text", "paid_from_kind", "business_use_percent", "last_observed_charge_text", "status",
        "verification_text", "notes", "source_file", "imported_at"] as const;
      return csvResponse("spqc-recurring-expenses", ["amount", ...cols.filter((c) => c !== "amount_cents")],
        rows.map((r) => [r.amount_cents === null ? "Not available" : (r.amount_cents / 100).toFixed(2),
          ...cols.filter((c) => c !== "amount_cents").map((c) => r[c] ?? "")]));
    }
    case "/onedrive/connect":
      if (!oneDriveConfigured(env)) return redirectHome("OneDrive app settings are not configured yet.");
      return startConnect(req, env);
    case "/onedrive/callback":
      if (!oneDriveConfigured(env)) return redirectHome("OneDrive app settings are not configured yet.");
      return redirectHome(await finishConnect(req, env));
    case "/assets/logo.png":
      return new Response(b64ToBytes(LOGO_PNG_BASE64), {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
      });
    default:
      return respond("Not found", "text/plain", {}, 404);
  }
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runBackup(env).then((r) => { if (!r.ok) console.error(r.message); }));
  },
} satisfies ExportedHandler<Env>;

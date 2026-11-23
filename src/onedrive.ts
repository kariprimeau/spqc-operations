// OneDrive access for backups, through a Microsoft Entra app Kari owns.
// Delegated sign-in (Kari signs in once); the code only ever writes inside BACKUP_FOLDER.

import { b64url, decrypt, encrypt, randomToken } from "./crypto";
import { getSetting, setSettings, type Env } from "./db";

const SCOPE = "offline_access Files.ReadWrite";
const REFRESH_KEY = "secret:onedrive.refresh";

export function oneDriveConfigured(env: Env): boolean {
  return !!(env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET && env.TOKEN_KEY);
}

function tokenUrl(env: Env) {
  return `https://login.microsoftonline.com/${encodeURIComponent(env.MS_TENANT_ID!)}/oauth2/v2.0/token`;
}

export function callbackUrl(req: Request): string {
  return new URL("/onedrive/callback", req.url).toString();
}

/** Step 1 of sign-in: remember a state and PKCE verifier, then send Kari to Microsoft. */
export async function startConnect(req: Request, env: Env): Promise<Response> {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  await setSettings(env.DB, {
    "secret:oauth.state": state,
    "secret:oauth.verifier": await encrypt(verifier, env.TOKEN_KEY!),
    "secret:oauth.started_at": new Date().toISOString(),
  });
  const u = new URL(`https://login.microsoftonline.com/${encodeURIComponent(env.MS_TENANT_ID!)}/oauth2/v2.0/authorize`);
  u.search = new URLSearchParams({
    client_id: env.MS_CLIENT_ID!, response_type: "code", redirect_uri: callbackUrl(req),
    response_mode: "query", scope: SCOPE, state, code_challenge: challenge, code_challenge_method: "S256",
  }).toString();
  return Response.redirect(u.toString(), 302);
}

/** Step 2: Microsoft sends Kari back with a code; exchange it and keep only the encrypted refresh token. */
export async function finishConnect(req: Request, env: Env): Promise<string> {
  const url = new URL(req.url);
  const err = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (err) return `OneDrive was not connected: ${err}`;
  const state = await getSetting(env.DB, "secret:oauth.state");
  const started = await getSetting(env.DB, "secret:oauth.started_at");
  const verifierBlob = await getSetting(env.DB, "secret:oauth.verifier");
  await env.DB.prepare("DELETE FROM settings WHERE key LIKE 'secret:oauth.%'").run();
  if (!state || state !== url.searchParams.get("state") || !verifierBlob || !started ||
      Date.now() - new Date(started).getTime() > 10 * 60_000) {
    return "OneDrive was not connected: the sign-in expired or did not match. Press Connect OneDrive again.";
  }
  const res = await fetch(tokenUrl(env), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID!, client_secret: env.MS_CLIENT_SECRET!, grant_type: "authorization_code",
      code: url.searchParams.get("code") ?? "", redirect_uri: callbackUrl(req),
      code_verifier: await decrypt(verifierBlob, env.TOKEN_KEY!), scope: SCOPE,
    }),
  });
  const body = (await res.json()) as { refresh_token?: string; error_description?: string };
  if (!res.ok || !body.refresh_token) return `OneDrive was not connected: ${body.error_description ?? res.status}`;
  await setSettings(env.DB, {
    [REFRESH_KEY]: await encrypt(body.refresh_token, env.TOKEN_KEY!),
    "onedrive.connected_at": new Date().toISOString(),
  });
  return "OneDrive is connected. Run the first backup below.";
}

export async function accessToken(env: Env): Promise<string> {
  const blob = await getSetting(env.DB, REFRESH_KEY);
  if (!blob) throw new Error("OneDrive is not connected");
  const res = await fetch(tokenUrl(env), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID!, client_secret: env.MS_CLIENT_SECRET!, grant_type: "refresh_token",
      refresh_token: await decrypt(blob, env.TOKEN_KEY!), scope: SCOPE,
    }),
  });
  const body = (await res.json()) as { access_token?: string; refresh_token?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`OneDrive sign-in needs renewing (${(body.error_description ?? String(res.status)).split("\r")[0]}); press Connect OneDrive`);
  }
  if (body.refresh_token) await setSettings(env.DB, { [REFRESH_KEY]: await encrypt(body.refresh_token, env.TOKEN_KEY!) });
  return body.access_token;
}

export function drivePath(...segments: string[]): string {
  return segments.flatMap((s) => s.split("/")).filter(Boolean).map(encodeURIComponent).join("/");
}

/** Simple upload (files under 4 MB). Overwrites a file of the same name. */
export async function upload(token: string, path: string, content: string, contentType: string): Promise<void> {
  const bytes = new TextEncoder().encode(content);
  if (bytes.length > 4 * 1024 * 1024) throw new Error(`${path} is over 4 MB; large backups are not supported yet`);
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`, {
    method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType }, body: bytes,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OneDrive refused ${decodeURIComponent(path)} (${res.status}${t ? ": " + t.slice(0, 160) : ""})`);
  }
}

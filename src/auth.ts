// Sign-in is Cloudflare Access in front of the Worker. The Worker checks the Access token
// itself as well, so a request that skips Access (for example via workers.dev) is refused.
// It fails closed: if the settings are missing, nobody gets in.

import type { Env } from "./db";

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
let cachedKeys: { team: string; at: number; keys: Jwk[] } | null = null;

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function accessKeys(team: string, fetcher: typeof fetch): Promise<Jwk[]> {
  if (cachedKeys && cachedKeys.team === team && Date.now() - cachedKeys.at < 3_600_000) return cachedKeys.keys;
  const res = await fetcher(`${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access keys unavailable (${res.status})`);
  const body = (await res.json()) as { keys: Jwk[] };
  cachedKeys = { team, at: Date.now(), keys: body.keys };
  return body.keys;
}

export type AuthResult = { ok: true; email: string } | { ok: false; reason: string };

export async function verifyAccessJwt(
  token: string, opts: { team: string; aud: string; allowedEmail: string; now?: number; fetcher?: typeof fetch },
): Promise<AuthResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed token" };
  const [h, p, sig] = parts as [string, string, string];
  let header: { alg?: string; kid?: string };
  let payload: { aud?: string | string[]; exp?: number; nbf?: number; iss?: string; email?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  } catch { return { ok: false, reason: "malformed token" }; }
  if (header.alg !== "RS256") return { ok: false, reason: "unexpected algorithm" };
  const keys = await accessKeys(opts.team, opts.fetcher ?? fetch);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: "unknown signing key" };
  const key = await crypto.subtle.importKey(
    "jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
  );
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!valid) return { ok: false, reason: "bad signature" };
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) return { ok: false, reason: "expired" };
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) return { ok: false, reason: "not yet valid" };
  if (payload.iss !== opts.team) return { ok: false, reason: "wrong issuer" };
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(opts.aud)) return { ok: false, reason: "wrong audience" };
  if (!payload.email || payload.email.toLowerCase() !== opts.allowedEmail.toLowerCase()) {
    return { ok: false, reason: "not the allowed user" };
  }
  return { ok: true, email: payload.email };
}

export async function authorize(req: Request, env: Env): Promise<AuthResult> {
  const url = new URL(req.url);
  if (env.DEV_BYPASS_AUTH === "1" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
    return { ok: true, email: "local-dev" };
  }
  const team = env.ACCESS_TEAM_DOMAIN?.replace(/\/+$/, "");
  if (!team || !env.ACCESS_AUD || !env.ALLOWED_EMAIL) return { ok: false, reason: "sign-in is not configured" };
  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok: false, reason: "no Access sign-in" };
  try {
    return await verifyAccessJwt(token, { team, aud: env.ACCESS_AUD, allowedEmail: env.ALLOWED_EMAIL });
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/** Reject cross-site form posts. Access cookies are SameSite=Lax, but check anyway. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("Origin");
  if (!origin) return req.headers.get("Sec-Fetch-Site") === "same-origin";
  return origin === new URL(req.url).origin;
}

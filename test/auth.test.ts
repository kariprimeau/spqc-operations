import { describe, expect, it } from "vitest";
import { verifyAccessJwt } from "../src/auth";
import { b64url } from "../src/crypto";
import { handle } from "../src/index";
import type { Env } from "../src/db";

const TEAM = "https://spqc.cloudflareaccess.com";
const AUD = "aud-123";
const EMAIL = "owner@example.com";

async function setup() {
  const kp = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", kp.publicKey)) as JsonWebKey;
  const fetcher = (async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: "k1" }] }))) as unknown as typeof fetch;
  const sign = async (payload: object, kid = "k1") => {
    const enc = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));
    const data = `${enc({ alg: "RS256", kid })}.${enc(payload)}`;
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(data)));
    return `${data}.${b64url(sig)}`;
  };
  return { fetcher, sign };
}

describe("Access sign-in check", () => {
  const now = Date.parse("2026-11-23T02:00:00Z");
  const exp = Math.floor(now / 1000) + 3600;
  const opts = (fetcher: typeof fetch) => ({ team: TEAM, aud: AUD, allowedEmail: EMAIL, now, fetcher });

  it("accepts only the owner with a valid token", async () => {
    const { fetcher, sign } = await setup();
    const good = await sign({ iss: TEAM, aud: [AUD], email: "Owner@Example.com", exp });
    expect(await verifyAccessJwt(good, opts(fetcher))).toEqual({ ok: true, email: "Owner@Example.com" });
    const cases: [object, string][] = [
      [{ iss: TEAM, aud: [AUD], email: "other@example.com", exp }, "not the allowed user"],
      [{ iss: TEAM, aud: ["other"], email: EMAIL, exp }, "wrong audience"],
      [{ iss: "https://evil.example.com", aud: [AUD], email: EMAIL, exp }, "wrong issuer"],
      [{ iss: TEAM, aud: [AUD], email: EMAIL, exp: Math.floor(now / 1000) - 10 }, "expired"],
    ];
    for (const [p, reason] of cases) {
      expect(await verifyAccessJwt(await sign(p), opts(fetcher))).toEqual({ ok: false, reason });
    }
    const tampered = good.slice(0, -4) + (good.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect((await verifyAccessJwt(tampered, opts(fetcher))).ok).toBe(false);
  });

  it("fails closed when sign-in is not configured", async () => {
    const res = await handle(new Request("https://ops.example.com/accounts"), {} as Env);
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("sign-in is not configured");
  });

  it("ignores the local bypass on a real hostname", async () => {
    const res = await handle(new Request("https://ops.example.com/"), { DEV_BYPASS_AUTH: "1" } as Env);
    expect(res.status).toBe(403);
  });
});

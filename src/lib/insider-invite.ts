/**
 * Signed Insider signup invites (admin-generated). HMAC over AUTH_SECRET.
 * Token format: base64url(payload).base64url(sig)
 * payload = { v:1, plan:"insider", exp: unixSec }
 */

import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/config";

const TTL_SEC = 60 * 60 * 24 * 30; // 30 days

type Payload = { v: 1; plan: "insider"; exp: number };

function secret(): string {
  const s = env.authSecret();
  if (!s) throw new Error("AUTH_SECRET is required for insider invites");
  return s;
}

function signRaw(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

/** Create a single-use-style invite token (reusable until expiry; not one-shot). */
export function createInsiderInviteToken(ttlSec = TTL_SEC): string {
  const payload: Payload = {
    v: 1,
    plan: "insider",
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signRaw(body)}`;
}

export function verifyInsiderInviteToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  if (!body || !sig) return false;
  let expected: string;
  try {
    expected = signRaw(body);
  } catch {
    return false;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Payload;
    if (payload.v !== 1 || payload.plan !== "insider") return false;
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

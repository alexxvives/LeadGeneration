/**
 * Encrypt OAuth refresh/access tokens at rest (ADR 0010).
 * Key material = SHA-256(AUTH_SECRET). Never log plaintext tokens.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "@/lib/config";

function keyBytes(): Buffer {
  return createHash("sha256").update(env.authSecret()).digest();
}

/** Encrypt a secret → base64url(iv || tag || ciphertext). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64url");
  if (buf.length < 28) throw new Error("Invalid ciphertext");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

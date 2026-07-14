import { env } from "@/lib/config";

// Simple in-process rolling-window rate limiter for outbound sends.
// COMPLIANCE: rate limiting protects deliverability AND is part of sending
// responsibly. In a multi-instance deploy, replace this with a shared store
// (e.g. Redis / Supabase) so the limit is enforced globally.

const sendTimestamps: number[] = [];

export interface RateDecision {
  allowed: boolean;
  retryAfterMs: number;
  windowCount: number;
  limit: number;
}

export function checkSendRate(): RateDecision {
  const limit = env.sendRatePerMinute();
  const now = Date.now();
  const windowStart = now - 60_000;
  // Drop timestamps outside the rolling minute.
  while (sendTimestamps.length && sendTimestamps[0] < windowStart) {
    sendTimestamps.shift();
  }
  if (sendTimestamps.length >= limit) {
    const retryAfterMs = sendTimestamps[0] + 60_000 - now;
    return { allowed: false, retryAfterMs, windowCount: sendTimestamps.length, limit };
  }
  return { allowed: true, retryAfterMs: 0, windowCount: sendTimestamps.length, limit };
}

export function recordSend(): void {
  sendTimestamps.push(Date.now());
}

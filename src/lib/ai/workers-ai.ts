/**
 * Workers AI client (HERMES mail's preferred LLM on Cloudflare).
 *
 * Preferred: Cloudflare Workers AI binding (`env.AI`) on the deployed Worker —
 * no API key, same account as D1. Optional REST via CLOUDFLARE_ACCOUNT_ID +
 * CLOUDFLARE_API_TOKEN for local/dev. Missing AI → `aiChat` may try Groq/Gemini;
 * pitch generate never invents heuristic copy (ADR 0013).
 */

import { env } from "@/lib/config";

export const WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

type AiMessage = { role: "system" | "user" | "assistant"; content: string };

type AiBinding = {
  run: (
    model: string,
    input: { messages: AiMessage[] } | { prompt: string },
  ) => Promise<unknown>;
};

function extractText(result: unknown): string | null {
  if (!result) return null;
  if (typeof result === "string") return result.trim() || null;
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.response === "string") return r.response.trim() || null;
    if (typeof r.result === "string") return r.result.trim() || null;
    if (typeof r.text === "string") return r.text.trim() || null;
    if (r.result && typeof r.result === "object") {
      const inner = r.result as Record<string, unknown>;
      if (typeof inner.response === "string") return inner.response.trim() || null;
    }
  }
  return null;
}

async function getAiBinding(): Promise<AiBinding | null> {
  // Binding exists on the Workers / OpenNext runtime (prod or `cf:preview`).
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env: cfEnv } = await getCloudflareContext({ async: true });
    const ai = (cfEnv as unknown as { AI?: AiBinding }).AI;
    return ai ?? null;
  } catch {
    return null;
  }
}

/** True when binding or REST credentials can run inference. */
export async function workersAiAvailable(): Promise<boolean> {
  if (await getAiBinding()) return true;
  return !!(env.cfAccountId() && env.cfApiToken());
}

/**
 * Run a short chat completion. Returns null when AI is unavailable or errors
 * (callers must degrade gracefully).
 */
export async function workersAiChat(
  system: string,
  user: string,
): Promise<string | null> {
  const messages: AiMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  try {
    const binding = await getAiBinding();
    if (binding) {
      const result = await binding.run(WORKERS_AI_MODEL, { messages });
      return extractText(result);
    }

    const accountId = env.cfAccountId();
    const token = env.cfApiToken();
    if (!accountId || !token) return null;

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${WORKERS_AI_MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
      },
    );
    if (!res.ok) {
      console.warn(`[workers-ai] REST ${res.status}: ${(await res.text()).slice(0, 160)}`);
      return null;
    }
    const json = (await res.json()) as { result?: unknown; success?: boolean };
    return extractText(json.result ?? json);
  } catch (err) {
    console.warn("[workers-ai] inference failed:", err);
    return null;
  }
}

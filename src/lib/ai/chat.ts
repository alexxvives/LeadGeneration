/**
 * Unified short chat completion for blurbs/pitch.
 * Order: Workers AI → Groq → Gemini. Returns null when none succeed
 * (callers must surface a real error — never invent copy).
 */

import { workersAiChat, workersAiAvailable } from "@/lib/ai/workers-ai";
import { env } from "@/lib/config";

export type AiProvider = "workers-ai" | "groq" | "gemini";

export async function aiChat(
  system: string,
  user: string,
): Promise<{ text: string; provider: AiProvider } | null> {
  if (await workersAiAvailable()) {
    const text = await workersAiChat(system, user);
    if (text) return { text, provider: "workers-ai" };
  }

  const groq = await groqChat(system, user);
  if (groq) return { text: groq, provider: "groq" };

  const gemini = await geminiChat(system, user);
  if (gemini) return { text: gemini, provider: "gemini" };

  return null;
}

export async function aiAvailable(): Promise<boolean> {
  if (await workersAiAvailable()) return true;
  return !!(env.groqApiKey() || env.geminiApiKey());
}

async function groqChat(system: string, user: string): Promise<string | null> {
  const key = env.groqApiKey();
  if (!key) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[groq] ${res.status}: ${(await res.text()).slice(0, 160)}`);
      return null;
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.warn("[groq] inference failed:", err);
    return null;
  }
}

async function geminiChat(system: string, user: string): Promise<string | null> {
  const key = env.geminiApiKey();
  if (!key) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
    });
    if (!res.ok) {
      console.warn(`[gemini] ${res.status}: ${(await res.text()).slice(0, 160)}`);
      return null;
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    console.warn("[gemini] inference failed:", err);
    return null;
  }
}

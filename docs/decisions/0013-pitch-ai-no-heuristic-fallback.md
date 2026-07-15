# 0013. Pitch generate — real AI only (no heuristic fake pitch)
- Status: accepted
- Date: 2026-07-15

## Context
“Generate from website” fell back to scraping sentences from the page when
Workers AI was unavailable. That silently produced weak/misleading pitches and
hid binding/credential problems.

## Decision
1. Pitch generation uses a real LLM only: **Workers AI** (preferred on CF), then
   optional free-tier **Groq** or **Gemini** if configured.
2. If no provider succeeds, return a clear error — never invent a heuristic pitch.
3. Demo / zero-key mode: user writes the pitch manually (constitution Art. I.2
   still holds — search/draft/send work without AI).

## Alternatives considered
| Option | Why not |
| --- | --- |
| Heuristic page sentences | User rejected — lies that AI worked |
| Hard-require Workers AI only | Breaks local/dev without CF token |

## Consequences
- Document `GROQ_API_KEY` / `GEMINI_API_KEY` in `.env.example` for local/dev.
- Production should keep the wrangler `ai` binding deployed.

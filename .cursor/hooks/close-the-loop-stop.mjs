/**
 * Cursor stop hook: if the agent is about to finish with a dirty git tree,
 * nudge it once to close the loop. Fail open on any error.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

function empty() {
  process.stdout.write("{}\n");
  process.exit(0);
}

let payload = {};
try {
  const raw = readFileSync(0, "utf8").trim();
  if (raw) payload = JSON.parse(raw);
} catch {
  empty();
}

if (payload.status && payload.status !== "completed") empty();
if ((payload.loop_count ?? 0) > 0) empty();

const git = spawnSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
  windowsHide: true,
});
if (git.status !== 0) empty();

const dirty = (git.stdout || "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
if (dirty.length === 0) empty();

const uiTouched = dirty.some((line) =>
  /\.(tsx|jsx|css)$|[/\\]src[/\\](components|app)[/\\]/.test(line),
);

const followup = uiTouched
  ? "Close the loop before you finish. The working tree is still dirty. Run npx tsc --noEmit and npm run lint. This change looks visual: click the changed flow in cursor-ide-browser (http://localhost:3000), not a static screenshot. Update docs/session-handoff.md, then commit and git push. Do not deploy unless asked. See .cursor/rules/close-the-loop.mdc."
  : "Close the loop before you finish. The working tree is still dirty. Run npx tsc --noEmit and npm run lint. Update docs/session-handoff.md if state changed, then commit and git push. Do not deploy unless asked. See .cursor/rules/close-the-loop.mdc.";

process.stdout.write(`${JSON.stringify({ followup_message: followup })}\n`);

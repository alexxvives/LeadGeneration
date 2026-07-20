/**
 * Sanity checks for normalizePitchHtml XSS hardening (audit C2.2).
 * Run: node --experimental-strip-types scripts/test-rich-text.mjs
 */
import { normalizePitchHtml } from "../src/lib/outreach/rich-text.ts";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

const xss = normalizePitchHtml("&lt;img src=x onerror=alert(1)&gt;");
assert(!xss.includes("<img"), `entity XSS must not yield <img> (got: ${JSON.stringify(xss)})`);

const mixed = normalizePitchHtml("<b>hi</b>&lt;img src=x onerror=alert(1)&gt;");
assert(!mixed.includes("<img"), `mixed entity XSS must not yield <img> (got: ${JSON.stringify(mixed)})`);
assert(mixed.includes("<b>hi</b>"), `mixed must keep <b> (got: ${JSON.stringify(mixed)})`);

const legit = normalizePitchHtml("<b>hi</b><br>line");
assert(legit.includes("<b>hi</b>"), `legit <b> must survive (got: ${JSON.stringify(legit)})`);
assert(legit.includes("<br>"), `legit <br> must survive (got: ${JSON.stringify(legit)})`);
assert(legit.includes("line"), `legit text must survive (got: ${JSON.stringify(legit)})`);

if (!process.exitCode) console.log("\nAll rich-text checks passed.");

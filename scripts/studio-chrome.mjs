/**
 * Playwright chrome check for phone (390) + desktop (1920) studio UX.
 * Usage: BASE=http://localhost:3004 node --experimental-strip-types scripts/studio-chrome.mjs
 * (or: npx playwright test is not required — this is a standalone script)
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || process.env.SMOKE_BASE_URL || "http://localhost:3010";

let passed = 0;
let failed = 0;

function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function visible(locator) {
  try {
    return await locator.first().isVisible();
  } catch {
    return false;
  }
}

async function countVisible(locator) {
  const n = await locator.count();
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (await locator.nth(i).isVisible()) v++;
  }
  return v;
}

async function runPhone(page) {
  console.log("\n390×844");
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`${BASE}/app?view=leads`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="leads-filter-menu"]').waitFor({ timeout: 25000 });

  const searchToggle = page.locator('[data-testid="lead-search-toggle"]');
  const alwaysField = page.locator('input[placeholder="Search leads…"]');
  const filterMenu = page.locator('[data-testid="leads-filter-menu"]');
  const exportBtn = page.getByRole("button", { name: /export excel/i });
  const addBtn = page.getByRole("button", { name: /^add lead$/i });
  check("Leads: search is an icon, not a full-width field", await visible(searchToggle));
  check(
    "Leads: no always-visible Search leads input",
    (await countVisible(alwaysField)) === 0,
  );
  check("Leads: filter menu is one control", await visible(filterMenu));
  check("Leads: Export reachable", await visible(exportBtn));
  check("Leads: Add reachable", await visible(addBtn));
  check(
    "Leads: Table/Cards/Map not a full-width row",
    (await countVisible(page.getByRole("button", { name: /^table$/i }))) === 0,
  );

  await searchToggle.click();
  const searchInput = page.locator('[data-testid="lead-search-input"]:visible');
  await searchInput.waitFor({ state: "visible", timeout: 4000 });
  await searchInput.fill("acme");
  check("Leads: search icon expands and accepts type", (await searchInput.inputValue()) === "acme");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await filterMenu.click();
  const cardsOpt = page.getByRole("button", { name: /^cards$/i });
  check("Leads: filter menu lists layout", await visible(cardsOpt));
  await page.keyboard.press("Escape");

  await page.goto(`${BASE}/app?view=pipeline`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="pipeline-stage-tabs"]').waitFor({ timeout: 15000 });

  check(
    "Pipeline: search is an icon (no always-visible field)",
    (await visible(page.locator('[data-testid="lead-search-toggle"]'))) &&
      (await countVisible(page.locator('input[placeholder="Search leads…"]'))) === 0,
  );

  await page.locator('[data-testid="lead-search-toggle"]').click();
  const pipeInput = page.locator('[data-testid="lead-search-input"]:visible');
  await pipeInput.waitFor({ state: "visible", timeout: 4000 });
  await pipeInput.fill("test");
  check("Pipeline: search icon → type works", (await pipeInput.inputValue()) === "test");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="pipeline-stage-tabs"]').waitFor({ timeout: 8000 });

  const tabs = page.locator('[data-testid="pipeline-stage-tabs"] [role="tab"]');
  const tabCount = await tabs.count();
  check("Pipeline: all stage tabs present", tabCount >= 5, `got ${tabCount}`);
  let allFullyVisible = true;
  for (let i = 0; i < tabCount; i++) {
    const box = await tabs.nth(i).boundingBox();
    if (!box || box.x + box.width > 390 + 1 || box.x < -1) allFullyVisible = false;
  }
  check("Pipeline: no clipped stage tab", allFullyVisible);

  const moveHint = page.getByText("move to change stage");
  check("Pipeline: phone move hint", await visible(moveHint));
  check(
    "Pipeline: no full-width Move to… under cards",
    (await page.getByText("Move to…").count()) === 0,
  );

  const anyLead = page.locator('[data-testid="pipeline-lead-card"]').first();
  if (await visible(anyLead)) {
    await anyLead.click();
    const drawer = page.getByRole("dialog").filter({ hasNot: page.locator("#studio-nav-sheet") });
    await drawer.first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
    const send = page.getByRole("button", { name: /^send$/i });
    check("Lead drawer opens from Pipeline", await visible(drawer));
    check("Send is per-lead (drawer, not blast)", (await send.count()) <= 2);
    await page.keyboard.press("Escape");
  } else {
    check("Lead drawer opens from Pipeline", false, "no lead cards");
  }

  await page.goto(`${BASE}/app?view=calendar`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  check(
    "Calendar: search is an icon",
    await visible(page.locator('[data-testid="lead-search-toggle"]')),
  );
  check(
    "Calendar: no always-visible Search leads input",
    (await countVisible(page.locator('input[placeholder="Search leads…"]'))) === 0,
  );

  await page.getByRole("button", { name: /open menu/i }).click();
  const overlay = page.locator("#studio-nav-sheet");
  await overlay.waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
  check("Overlay opens", await visible(overlay));
  const settings = overlay.getByRole("link", { name: /^settings$/i });
  check("Overlay: Settings visible without scrolling past profile", await visible(settings));
  const logout = overlay.getByRole("button", { name: /sign out/i });
  const signIn = overlay.getByRole("button", { name: /sign in/i });
  check(
    "Overlay: profile shows logout or sign-in (not missing)",
    (await visible(logout)) || (await visible(signIn)),
  );
  check(
    "Overlay: no Settings gear on top bar while open",
    (await page.locator("header").getByRole("link", { name: /settings/i }).count()) === 0,
  );
  await page.keyboard.press("Escape");
}

async function runDesktop(page) {
  console.log("\n1920×1080");
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto(`${BASE}/app?view=leads`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^table$/i }).waitFor({ timeout: 20000 });

  check(
    "Desktop Leads: search field visible",
    (await countVisible(page.locator('input[placeholder="Search leads…"]'))) >= 1,
  );
  check(
    "Desktop Leads: Table/Cards/Map row present",
    await visible(page.getByRole("button", { name: /^table$/i })),
  );
  check(
    "Desktop Leads: compact filter menu hidden",
    (await countVisible(page.locator('[data-testid="leads-filter-menu"]'))) === 0,
  );
  check(
    "Desktop Leads: Export labeled (not icon-only)",
    await visible(page.getByRole("button", { name: /export excel/i })),
  );

  await page.goto(`${BASE}/app?view=pipeline`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  check(
    "Desktop Pipeline: search field visible",
    (await countVisible(page.locator('input[placeholder="Search leads…"]'))) >= 1,
  );
  check(
    "Desktop Pipeline: kanban columns (not phone tabs)",
    (await countVisible(page.locator('[data-testid="pipeline-stage-tabs"]'))) === 0,
  );
  const dragHint = page.getByText("drag to change stage");
  check("Desktop Pipeline: drag hint", await visible(dragHint));

  const cols = page.locator("h3").filter({ hasText: /^New$/ });
  check("Desktop Pipeline: New column present", await visible(cols));
}

async function main() {
  console.log(`Studio chrome against ${BASE}`);
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
  });
  const boot = (viewport) =>
    browser.newContext({
      viewport,
      ...viewport,
    }).then(async (context) => {
      await context.addInitScript(() => {
        try {
          localStorage.setItem("hermes_getting_started_v3", "done");
          sessionStorage.setItem("hermes_guest", "1");
        } catch {
          /* ignore */
        }
      });
      return context;
    });

  const phoneCtx = await boot({ width: 390, height: 844 });
  const deskCtx = await boot({ width: 1920, height: 1080 });
  try {
    await runPhone(await phoneCtx.newPage());
    await runDesktop(await deskCtx.newPage());
  } finally {
    await phoneCtx.close();
    await deskCtx.close();
    await browser.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Phase 17 file & project management — real-browser checks (Playwright).
// Run a preview server first: npm run preview -w @chalk/playground
import { chromium } from "@playwright/test";

const BASE = process.env.PG_URL || "http://localhost:5173/";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => ((c ? pass++ : fail++), console.log(`${c ? "✓" : "✗"} ${n}${x ? `  — ${x}` : ""}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const goDashboard = async () => {
  await page.goto(`${BASE}projects`); // the dashboard route
  await page.waitForSelector("#new-project");
  await sleep(300);
};
const cardCount = () => page.locator('li button[aria-label^="Open "]').count();
const newProject = async (name, template) => {
  await page.click("#new-project");
  await page.fill('input[aria-label="Project name"]', name);
  if (template) {
    await page.getByLabel("Template").click();
    await page.getByRole("option", { name: template }).click();
  }
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForSelector(".cm-editor"); // lands in the editor
  await sleep(500);
};
const doc = () => page.evaluate(() => window.__chalkDoc?.() ?? "");

// ── Fresh device lands on the dashboard ────────────────────────────────────
await goDashboard();
ok("a fresh device opens the dashboard", (await page.locator("#new-project").count()) === 1);
ok("dashboard says projects are device-local", /on this device/i.test(await page.locator("main").innerText()));

// ── New blank project → editor ─────────────────────────────────────────────
await newProject("Calculus", null);
ok("creating a blank project opens the editor", (await page.locator(".cm-editor").count()) === 1);
await page.locator(".cm-content").click();
await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
await page.keyboard.type("\n\n## Derivatives\n\nThe slope.\n");
await sleep(1000); // autosave debounce (600ms)
ok("autosave shows a Saved indicator", /Saved/.test(await page.locator("header").innerText()));
const calcDoc = await doc();

// ── New project from an example template ───────────────────────────────────
await page.click("#home");
await goDashboard().catch(() => {});
await page.waitForSelector("#new-project");
await newProject("From Example", /Graphing|Limits|Images|Morph|Surfaces/);
ok("a project from a template has the example's content", (await doc()).length > 40);

// ── Dashboard lists both, with last-edited + thumbnail ─────────────────────
await page.click("#home");
await page.waitForSelector("#new-project");
ok("dashboard lists both projects", (await cardCount()) === 2);
ok("cards show a last-edited time", /Edited/.test(await page.locator("main").innerText()));

// ── Switch between projects: editor loads each correctly ───────────────────
await page.getByRole("button", { name: "Open Calculus" }).click();
await page.waitForSelector(".cm-editor"); await sleep(400);
ok("opening a project restores its exact source (autosave survived)", (await doc()) === calcDoc);

// ── Refresh restores the last-open project (autosave persistence) ──────────
await page.reload();
await page.waitForSelector(".cm-editor"); await sleep(500);
ok("a refresh reopens the last project with its saved source", (await doc()) === calcDoc);

// ── Rename + duplicate ─────────────────────────────────────────────────────
await page.click("#home");
await page.waitForSelector("#new-project");
await page.getByRole("button", { name: "Project actions" }).first().click();
await page.getByRole("menuitem", { name: "Rename" }).click();
await page.fill('input[aria-label="Project name"]', "Calculus I");
await page.getByRole("button", { name: "Save" }).click();
await sleep(400);
ok("rename updates the card", (await page.locator("main").innerText()).includes("Calculus I"));

await page.getByRole("button", { name: "Project actions" }).first().click();
await page.getByRole("menuitem", { name: "Duplicate" }).click();
await sleep(500);
ok("duplicate adds a copy", (await cardCount()) === 3 && /\(copy\)/.test(await page.locator("main").innerText()));

// ── Delete with confirm + undo ─────────────────────────────────────────────
const beforeDelete = await cardCount();
await page.getByRole("button", { name: "Project actions" }).first().click();
await page.getByRole("menuitem", { name: "Delete…" }).click();
await page.getByRole("button", { name: "Delete", exact: true }).click();
await sleep(400);
ok("delete (after confirm) removes a card", (await cardCount()) === beforeDelete - 1);
await page.getByRole("button", { name: "Undo" }).click();
await sleep(500);
ok("undo restores the deleted project", (await cardCount()) === beforeDelete);

// Export → import round-trip integrity is covered by the unit tests
// (test/transfer.test.ts, test/db.test.ts).

// ── Share-URL still opens the editor ephemerally ───────────────────────────
await page.goto(`${BASE}#c=${(await import("lz-string")).default.compressToEncodedURIComponent("## Shared\n\nHi")}`);
await page.waitForSelector(".cm-editor"); await sleep(400);
ok("a shared link opens an ephemeral editor with Save-to-projects", (await page.getByRole("button", { name: "Save to projects" }).count()) === 1);

ok("no page errors during project management", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

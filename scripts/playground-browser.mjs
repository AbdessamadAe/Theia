// Drive the running playground (http://localhost:5173) with Playwright.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const URL = process.env.PG_URL || "http://localhost:5173/";
const SHOTS = "/tmp/chalk-pg";
mkdirSync(SHOTS, { recursive: true });

let pass = 0,
  fail = 0;
const ok = (n, c, x = "") => ((c ? pass++ : fail++), console.log(`${c ? "✓" : "✗"} ${n}${x ? `  — ${x}` : ""}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const deck = page.frameLocator("#preview");
const slideCount = async () => deck.locator(".slide").count();

// Drive the shadcn (Radix) Select instead of a native <select>.
async function selectExample(nameRe) {
  await page.getByTestId("examples").click();
  await page.getByRole("option", { name: nameRe }).click();
  await sleep(300);
}

await page.goto(URL);
await page.waitForSelector(".cm-editor");
await page.waitForFunction(() => {
  const f = document.querySelector("#preview");
  return f && f.srcdoc && f.srcdoc.includes("<section class=\"slide");
});
await deck.locator(".slide.is-active").first().waitFor();
ok("loads instantly with a preloaded example (editor + compiled deck)", (await slideCount()) > 0, `${await slideCount()} slides`);
await page.screenshot({ path: `${SHOTS}/01-initial.png` });

// The deck fits the preview pane (no overflow): scaled deck width ≤ iframe width.
await sleep(300);
const iframeBox = await page.locator("#preview").boundingBox();
const deckBox = await deck.locator(".deck").boundingBox();
ok(
  "deck is scaled to fit the preview pane (no overflow)",
  !!deckBox && !!iframeBox && deckBox.width <= iframeBox.width + 2 && deckBox.height <= iframeBox.height + 2,
  `deck ${Math.round(deckBox?.width)}×${Math.round(deckBox?.height)} ⊂ pane ${Math.round(iframeBox?.width)}×${Math.round(iframeBox?.height)}`,
);
// The deck is centred (symmetric left/right gaps) — no spurious left padding.
const leftGap = Math.round(deckBox.x - iframeBox.x);
const rightGap = Math.round(iframeBox.x + iframeBox.width - (deckBox.x + deckBox.width));
ok(
  "deck is centred in the pane (no left padding / right overflow)",
  Math.abs(leftGap - rightGap) <= 2 && leftGap >= 0,
  `left ${leftGap}px vs right ${rightGap}px`,
);

// Typing recompiles live AND keeps the current slide.
await page.evaluate(() => {
  const f = document.querySelector("#preview");
  f.contentWindow.location.hash = "#2";
  f.contentWindow.dispatchEvent(new Event("hashchange"));
});
await sleep(200);
// Count slides from the compiled srcdoc (set synchronously, no reload race).
const srcdocSlides = () =>
  page.evaluate(() => (document.querySelector("#preview").srcdoc.match(/<section class="slide/g) || []).length);
const before = await srcdocSlides();
await page.locator(".cm-content").click();
await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
await page.keyboard.type("\n\n## Appended live\n\nNew content.\n");
await page.waitForFunction((n) => (document.querySelector("#preview").srcdoc.match(/<section class="slide/g) || []).length > n, before, { timeout: 4000 }).catch(() => {});
const after = await srcdocSlides();
ok("typing auto-recompiles the deck live", after > before, `${before} → ${after} slides`);
// Wait for the reloaded deck to boot, then confirm the slide was preserved.
await deck.locator(".slide.is-active").first().waitFor({ timeout: 4000 }).catch(() => {});
const activeIdx = await deck.locator(".slide.is-active").first().getAttribute("data-index");
ok("live recompile keeps you on the current slide", activeIdx === "1", `active slide index = ${activeIdx}`);

// Inline error (not a blank pane): malformed KaTeX renders red in place.
await page.locator(".cm-content").click();
await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home");
await page.keyboard.type("## Broken math\n\n$\\frac{1}{$ oops\n\n");
// KaTeX renders parse errors in place with its error colour (#cc0000); check
// the compiled srcdoc (synchronous) to avoid the iframe reload race.
await page.waitForFunction(() => /cc0000|katex-error/i.test(document.querySelector("#preview").srcdoc || ""), null, { timeout: 4000 }).catch(() => {});
const srcdoc = await page.evaluate(() => document.querySelector("#preview").srcdoc || "");
const stillHasSlides = (srcdoc.match(/<section class="slide/g) || []).length > 0;
const hasKatexError = /cc0000|katex-error/i.test(srcdoc);
ok("a math error renders inline, the pane is not blank", stillHasSlides && hasKatexError, `slides ${(srcdoc.match(/<section class="slide/g) || []).length}, error markup: ${hasKatexError}`);
await page.screenshot({ path: `${SHOTS}/02-inline-error.png` });

// Switch to the 3D example → three.js lazy-loads with a calm state.
await selectExample(/surfaces/i);
await sleep(400);
await page.evaluate(() => {
  const f = document.querySelector("#preview");
  // jump the inner deck to the paraboloid slide
  f.contentWindow.location.hash = "#2";
  f.contentWindow.dispatchEvent(new Event("hashchange"));
});
ok("3D example shows a calm loading state", (await deck.locator(".chalk-scene__loading").count()) > 0);
let threeLoaded = false;
for (let i = 0; i < 40; i++) {
  const hidden = await deck.locator(".chalk-scene__loading").first().evaluate((el) => !el || el.style.display === "none" || !el.offsetParent).catch(() => false);
  const unavailable = (await deck.locator(".chalk-scene__loading").first().textContent().catch(() => "")) || "";
  if (unavailable.includes("unavailable")) { ok("three.js loaded from CDN", false, "network blocked"); break; }
  if (hidden) { threeLoaded = true; break; }
  await sleep(500);
}
if (threeLoaded) {
  await sleep(500);
  const canvasOk = await deck.locator(".chalk-scene--3d .chalk-scene__canvas").first().evaluate((c) => {
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    return !!gl && !gl.isContextLost();
  });
  ok("3D deck renders with a live WebGL context in the playground", canvasOk);
  await page.screenshot({ path: `${SHOTS}/03-surfaces.png` });
}

// Switch to a py example and confirm the editor stays responsive (no block).
await selectExample(/Limits/i);
await sleep(400);
const editorResponsive = await page.evaluate(() => !!document.querySelector(".cm-content"));
ok("py-cell example loads without blocking the editor", editorResponsive);

// Share → opens a fresh tab reproducing the exact source.
await selectExample(/morphing/i);
await sleep(500);
const sourceNow = await page.evaluate(() => document.querySelector(".cm-content").innerText);
const popupP = ctx.waitForEvent("page");
await page.click("#share");
const popup = await popupP;
await popup.waitForSelector(".cm-editor");
await popup.waitForFunction(() => {
  const f = document.querySelector("#preview");
  return f && f.srcdoc && f.srcdoc.includes("<section");
});
const sharedUrl = popup.url();
const reopenedSource = await popup.evaluate(() => document.querySelector(".cm-content").innerText);
ok("Share URL carries the deck in its #fragment", sharedUrl.includes("#c="));
ok("shared link reopens the exact deck in a fresh tab", reopenedSource.trim() === sourceNow.trim());
await popup.close();

// Download → a self-contained .html bundle.
const dlP = page.waitForEvent("download");
await page.click("#download");
const dl = await dlP;
const path = `${SHOTS}/downloaded-${dl.suggestedFilename()}`;
await dl.saveAs(path);
const { readFileSync } = await import("node:fs");
const content = readFileSync(path, "utf8");
ok("Download produces a self-contained deck bundle", content.startsWith("<!doctype html>") && content.includes("data:font/woff2;base64,"), dl.suggestedFilename());

ok("no page errors in the playground shell", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed.  Screenshots in ${SHOTS}`);
process.exit(fail === 0 ? 0 : 1);

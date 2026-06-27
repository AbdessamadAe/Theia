// Phase 15 media — real-browser checks (Playwright) against the running playground.
// Run a preview server first: npm run preview -w @chalk/playground
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import lzString from "lz-string";
const { compressToEncodedURIComponent } = lzString;

const BASE = process.env.PG_URL || "http://localhost:5173/";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => ((c ? pass++ : fail++), console.log(`${c ? "✓" : "✗"} ${n}${x ? `  — ${x}` : ""}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CARD = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='90'><rect width='160' height='90' fill='%230891b2'/></svg>";
const DOT = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><circle cx='11' cy='11' r='10' fill='%23f59e0b'/></svg>";
const SOURCE = [
  "## Figure",
  "",
  ":::scene",
  "@axes ax x:[-4, 4] y:[-1, 7] grid",
  `@image card on ax of "${CARD}" at (-2, 5) width:2.6 alt:"label card"`,
  ":::",
  "",
  "## Opacity",
  "",
  "@slider a [0, 1] = 0.6",
  "",
  ":::scene",
  "@axes ax x:[-4, 4] y:[-1, 7] grid",
  `@image ghost on ax of "${DOT}" at (2, 4) width:2.4 opacity:a alt:"fading marker"`,
  ":::",
  "",
  "## Prose",
  "",
  `An inline figure ![dot](${DOT}) sits in the text.`,
  "",
  "## Clip",
  "",
  ":::scene",
  "@axes ax x:[-5, 5] y:[-3, 5]",
  '@video clip on ax of "data:video/mp4;base64,AAAAAA==" at (0, 1) width:6',
  "+animate play clip from 0:03 to 0:09",
  "+animate pause clip",
  ":::",
  "",
].join("\n");
const url = `${BASE}#c=${compressToEncodedURIComponent(SOURCE)}`;

// temp image fixtures for ingestion
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
writeFileSync("/tmp/chalk-small.png", PNG_1x1);
writeFileSync("/tmp/chalk-big.png", Buffer.concat([PNG_1x1, Buffer.alloc(300 * 1024, 1)]));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const getDoc = () => page.evaluate(() => window.__chalkDoc?.() ?? "");
const fr = () => page.frames()[1];
const active = () => fr().evaluate(() => document.querySelector(".slide.is-active")?.getAttribute("data-index"));
const nav = async (key) => {
  await fr().evaluate((k) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })), key);
  await sleep(250);
};
async function fresh() {
  await page.goto(url);
  await page.waitForSelector(".cm-content", { state: "attached" });
  await page.waitForFunction(() => typeof window.__chalkDoc === "function" && window.__chalkDoc().length > 0);
  await sleep(900);
}

// ── A positioned scene image renders with alt text ─────────────────────────
await fresh();
const card = fr().locator('.chalk-scene__media[alt="label card"]');
ok("a positioned @image renders in the scene with alt text", (await card.count()) > 0);
const box = await card.first().boundingBox();
ok("the image is sized in scene units (has real layout size)", !!box && box.width > 20 && box.height > 10, box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "none");

// ── Markdown ![]() renders inline in prose ─────────────────────────────────
ok("markdown ![alt](url) renders as an inline image", (await fr().locator("img.chalk-image--inline").count()) > 0);

// ── A slider-bound image property updates live ─────────────────────────────
await nav("ArrowRight"); // → Opacity slide
const ghost = fr().locator('.chalk-scene__media[alt="fading marker"]');
const op1 = await ghost.evaluate((n) => n.style.opacity);
await fr().locator('.chalk-slider[data-slider="a"] input').evaluate((el) => {
  el.value = "1";
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(250);
const op2 = await ghost.evaluate((n) => n.style.opacity);
ok("a slider-bound image opacity updates live", op1 !== op2 && Number(op2) > Number(op1), `${op1} → ${op2}`);

// ── Advance-driven video play / pause / leave ──────────────────────────────
await fresh();
// Jump straight to the Clip slide (slide 4) via the deck's own hash routing,
// so we land with no steps revealed — deterministic for the play advance.
await fr().evaluate(() => {
  location.hash = "#4";
  window.dispatchEvent(new Event("hashchange"));
});
await sleep(300);
ok("reached the Clip slide", (await active()) === "3");
// Spy on media playback in the deck frame.
await fr().evaluate(() => {
  const proto = HTMLMediaElement.prototype;
  window.__m = { plays: 0, pauses: 0, seek: -1 };
  proto.play = function () { window.__m.plays++; return Promise.resolve(); };
  proto.pause = function () { window.__m.pauses++; };
  Object.defineProperty(proto, "currentTime", {
    get() { return this.__ct || 0; },
    set(v) { this.__ct = v; window.__m.seek = v; },
    configurable: true,
  });
});
ok("the scene contains the video element", (await fr().locator(".chalk-scene__media--video").count()) > 0);
await nav("ArrowRight"); // crosses `+animate play clip from 0:03 to 0:09`
let m = await fr().evaluate(() => window.__m);
ok("advancing plays the clip and seeks to 0:03", m.plays === 1 && m.seek === 3, JSON.stringify(m));
await nav("ArrowRight"); // crosses `+animate pause clip`
m = await fr().evaluate(() => window.__m);
ok("the next advance pauses the clip", m.pauses >= 1, JSON.stringify(m));
const pausesBefore = m.pauses;
await nav("ArrowLeft"); // leave the slide
m = await fr().evaluate(() => window.__m);
ok("leaving the slide pauses the clip", m.pauses > pausesBefore, JSON.stringify(m));

// ── Playground ingestion: small image inlines + round-trips ────────────────
await fresh();
await page.locator(".cm-content").click();
await page.setInputFiles('input[type="file"]', "/tmp/chalk-small.png");
await sleep(400);
const docAfter = await getDoc();
ok("dropping a small image inlines it as @image (data URI in source)", /@image \w+ of "data:image\/png;base64,/.test(docAfter));

// ── Playground ingestion: oversized image is refused with a clear warning ──
await fresh();
const before = await getDoc();
await page.setInputFiles('input[type="file"]', "/tmp/chalk-big.png");
await sleep(400);
ok("an oversized image is NOT inlined (source unchanged)", (await getDoc()) === before);
ok("…and the user is warned it can’t go in a shareable link", await page.getByText(/too large to embed/i).isVisible().catch(() => false));

ok("no page errors during media interactions", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

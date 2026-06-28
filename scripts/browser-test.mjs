// Real-browser verification with Playwright (Chromium) of the built decks.
// Run: node scripts/browser-test.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const SHOTS = "/tmp/theia-pw";
mkdirSync(SHOTS, { recursive: true });

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? "✓" : "✗"} ${name}${extra ? `  — ${extra}` : ""}`);
};

const fileUrl = (p) => pathToFileURL(resolve(p)).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return { page, errors };
}

// ───────────────────────── 2D deck (offline) ─────────────────────────
async function test2D() {
  console.log("\n=== limits.html (2D, offline) ===");
  const { page, errors } = await newPage();
  await page.goto(fileUrl("examples/limits.html"));
  await page.waitForSelector(".slide.is-active");

  // Parabola slide: drag slider a → reactive inline math + plot redraw.
  await page.evaluate(() => {
    location.hash = "#3";
    window.dispatchEvent(new Event("hashchange"));
  });
  await sleep(150);
  const reactiveSel = '[data-theia-math][data-theia-vars="a"]';
  const before = await page.locator(reactiveSel).first().textContent();
  const plot = page.locator(".theia-plot canvas").first();
  const plotBefore = await plot.screenshot();

  await page.evaluate(() => {
    const i = document.querySelector('.theia-slider[data-slider="a"] input');
    i.value = "3";
    i.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(250);
  const after = await page.locator(reactiveSel).first().textContent();
  const plotAfter = await plot.screenshot();
  ok("reactive math re-renders on slider drag", before !== after, `"${before?.trim()}" → "${after?.trim()}"`);
  ok("plot canvas redraws on slider drag", !plotBefore.equals(plotAfter));

  // Completing the square (slide index 4 → hash #5): advance → equation morphs.
  await page.evaluate(() => {
    location.hash = "#5";
    window.dispatchEvent(new Event("hashchange"));
  });
  await sleep(150);
  const deriveBefore = await page.locator(".theia-derive__stage").first().textContent();
  // advance twice (two example steps) then once more to reach the morph
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("ArrowRight");
    await sleep(250);
  }
  const deriveAfter = await page.locator(".theia-derive__stage").first().textContent();
  ok("derive equation morphs on advance", deriveBefore !== deriveAfter);

  await page.screenshot({ path: `${SHOTS}/2d-parabola.png` });
  ok("no console/page errors (2D)", errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}

// ───────────────────────── 3D deck (WebGL, CDN) ─────────────────────────
async function test3D() {
  console.log("\n=== surfaces.html (3D, WebGL via three.js CDN) ===");
  const { page, errors } = await newPage();
  await page.goto(fileUrl("examples/surfaces.html"));
  await page.waitForSelector(".slide.is-active");
  // Paraboloid slide.
  await page.evaluate(() => {
    location.hash = "#2";
    window.dispatchEvent(new Event("hashchange"));
  });

  // Wait for three.js to load + the loading state to clear (needs network).
  let loaded = false;
  for (let i = 0; i < 30; i++) {
    const status = await page.evaluate(() => {
      const l = document.querySelector(".theia-scene__loading");
      const text = l ? l.textContent || "" : "";
      const hidden = !l || l.style.display === "none" || !l.offsetParent;
      return { text, hidden };
    });
    if (status.text.includes("unavailable")) {
      ok("three.js loaded from CDN", false, "network blocked: " + status.text);
      await page.close();
      return;
    }
    if (status.hidden) {
      loaded = true;
      break;
    }
    await sleep(500);
  }
  ok("three.js loaded + loading state cleared", loaded);
  if (!loaded) {
    await page.close();
    return;
  }
  await sleep(400);

  const canvas = page.locator(".theia-scene__canvas").first();

  // WebGL context is live (not lost) on the scene canvas.
  const gl = await page.evaluate(() => {
    const c = document.querySelector(".theia-scene--3d .theia-scene__canvas");
    const ctx = c.getContext("webgl2") || c.getContext("webgl");
    return { has: !!ctx, lost: ctx ? ctx.isContextLost() : true };
  });
  ok("WebGL context active on the 3D canvas", gl.has && !gl.lost);

  // Something is actually drawn (canvas not blank).
  const shotA = await canvas.screenshot();
  ok("3D canvas renders non-blank pixels", shotA.length > 2000);
  await page.screenshot({ path: `${SHOTS}/3d-initial.png` });

  // Pinned label exists and has a screen position.
  const labelPos1 = await page.evaluate(() => {
    const el = document.querySelector(".theia-scene--3d .theia-scene__label");
    return el ? { left: el.style.left, top: el.style.top, vis: el.style.display !== "none" } : null;
  });
  ok("MathTex label pinned to a 3D point", !!labelPos1 && labelPos1.vis && !!labelPos1.left);

  // Reactive surface: drag slider a → surface re-shapes (canvas changes).
  const surfBefore = await canvas.screenshot();
  await page.evaluate(() => {
    const i = document.querySelector('.theia-slider[data-slider="a"] input');
    i.value = "1.4";
    i.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(700);
  const surfAfter = await canvas.screenshot();
  ok("paraboloid re-shapes live on slider drag", !surfBefore.equals(surfAfter));
  await page.screenshot({ path: `${SHOTS}/3d-after-slider.png` });

  // Live orbit: click-drag rotates the scene; label tracks its 3D point.
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const orbitBefore = await canvas.screenshot();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 180, cy + 40, { steps: 12 });
  await page.mouse.up();
  await sleep(500);
  const orbitAfter = await canvas.screenshot();
  ok("click-drag orbits the scene", !orbitBefore.equals(orbitAfter));
  const labelPos2 = await page.evaluate(() => {
    const el = document.querySelector(".theia-scene--3d .theia-scene__label");
    return el ? { left: el.style.left, top: el.style.top } : null;
  });
  ok(
    "pinned label follows the point while orbiting",
    !!labelPos2 && (labelPos2.left !== labelPos1.left || labelPos2.top !== labelPos1.top),
    `${labelPos1.left},${labelPos1.top} → ${labelPos2?.left},${labelPos2?.top}`,
  );
  await page.screenshot({ path: `${SHOTS}/3d-after-orbit.png` });

  // Reset view (R) returns the camera; assert it changes from the orbited frame.
  await canvas.focus().catch(() => {});
  await page.keyboard.press("r");
  await sleep(700);
  const afterReset = await canvas.screenshot();
  ok("reset (R) re-frames the view", !afterReset.equals(orbitAfter));

  ok("no fatal console/page errors (3D)", errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}

try {
  await test2D();
  await test3D();
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed.  Screenshots in ${SHOTS}`);
process.exit(fail === 0 ? 0 : 1);

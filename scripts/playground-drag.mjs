// Phase 12 drag-on-preview — real-browser checks (Playwright).
// Run a preview server first: npm run preview -w chalk
import { chromium } from "@playwright/test";
import { parse } from "@chalk/parser";
import lzString from "lz-string";
const { compressToEncodedURIComponent } = lzString;

const BASE = process.env.PG_URL || "http://localhost:5173/";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => ((c ? pass++ : fail++), console.log(`${c ? "✓" : "✗"} ${n}${x ? `  — ${x}` : ""}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOD = process.platform === "darwin" ? "Meta" : "Control";

const SOURCE = [
  "## Graphing",
  "",
  "@slider s [-2.5, 2.5] = 1",
  "@slider k [0, 3] = 1",
  "",
  ":::scene",
  "@axes ax x:[-3, 3] y:[-1, 9] grid",
  "@plot f on ax : k*x^2",
  "@point P on ax at (s, k*s^2)",
  '@label lab on ax at (-1.7, 7.5) "f(x) = k x^2"',
  ":::",
  "",
].join("\n");
const SHARE = (src) => `${BASE}#c=${compressToEncodedURIComponent(src)}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const getDoc = () => page.evaluate(() => window.__chalkDoc?.() ?? "");
async function fresh(src = SOURCE) {
  await page.goto(SHARE(src));
  await page.waitForSelector(".cm-editor");
  await page.waitForFunction(() => typeof window.__chalkDoc === "function" && window.__chalkDoc().length > 0);
  await sleep(500); // let the deck render + position handles
}
const labelCoords = (doc) => {
  const o = parse(doc).children.flatMap((s) => s.children)
    .find((b) => b.type === "scene").objects.find((x) => x.name === "lab");
  return [o.args.x, o.args.y];
};
const pointCoords = (doc) => {
  const o = parse(doc).children.flatMap((s) => s.children)
    .find((b) => b.type === "scene").objects.find((x) => x.name === "P");
  return [o.args.x, o.args.y];
};

const fl = () => page.frameLocator("iframe");
const freeHandle = () => fl().locator(".chalk-scene__handle[data-chalk-free]").first();
const pointHandle = () => fl().locator(".chalk-scene__handle[data-chalk-derived]").first();

// ── Affordances: free label draggable, derived point inert ─────────────────
await fresh();
ok("the free @label exposes a drag handle", (await freeHandle().count()) > 0);
ok("the derived @point is inert (data-chalk-derived)", (await pointHandle().count()) > 0);
const hint = await pointHandle().getAttribute("title");
ok("derived point hints 'drag the slider'", /drag the slider/i.test(hint || ""), hint || "");

// ── Drag the @label → its at(…) numbers update to match ────────────────────
await fresh();
let before = await getDoc();
ok("label starts at (-1.7, 7.5)", labelCoords(before).join() === "-1.7,7.5");
let box = await freeHandle().boundingBox();
const dropX = box.x + 120, dropY = box.y - 60; // move right & up
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(dropX, dropY, { steps: 10 });
await page.mouse.up();
await sleep(600); // commit + debounced recompile + reload
let after = await getDoc();
const [lx, ly] = labelCoords(after);
ok("drag rewrote the label's at(…) literals", lx !== "-1.7" && ly !== "7.5" && Number.isFinite(+lx) && Number.isFinite(+ly), `(${lx}, ${ly})`);
ok("the rewritten coords are still plain numeric literals", /^[+-]?[\d.]+$/.test(lx) && /^[+-]?[\d.]+$/.test(ly));
// The deck reproduces the label at the dropped pixel (toPixel∘fromPixel ≈ id).
const movedBox = await freeHandle().boundingBox();
const near = Math.abs(movedBox.x + movedBox.width / 2 - dropX) < 8 && Math.abs(movedBox.y + movedBox.height / 2 - dropY) < 8;
ok("the label re-renders where the text now says (within 8px)", near, `Δ=(${Math.round(movedBox.x + movedBox.width/2 - dropX)}, ${Math.round(movedBox.y + movedBox.height/2 - dropY)})`);
// Edit is minimal: rewriting the new coords back to the originals restores the source byte-for-byte.
const restored = after.replace(`at (${lx}, ${ly})`, "at (-1.7, 7.5)");
ok("the edit is minimal — only the at(…) numbers changed", restored === before);

// One undo reverts the whole drag.
await page.locator(".cm-content").click();
await page.keyboard.press(`${MOD}+z`);
await sleep(200);
ok("one Cmd/Ctrl-Z reverts the drag as a single step", labelCoords(await getDoc()).join() === "-1.7,7.5");

// ── Derived @point cannot be dragged (source unchanged) ────────────────────
await fresh();
before = await getDoc();
box = await pointHandle().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + 90, box.y + 40, { steps: 8 });
await page.mouse.up();
await sleep(400);
ok("dragging the derived @point does NOT edit the source", pointCoords(await getDoc()).join() === "s,k*s^2");

// ── Slider still moves the point live (no text change) ─────────────────────
await fresh();
before = await getDoc();
const ptLeftBefore = await pointHandle().evaluate((n) => n.style.left);
const slider = fl().locator('.chalk-slider[data-slider="s"] input.chalk-slider__input');
await slider.evaluate((el) => {
  el.value = String(Math.min(+el.max, +el.value + 1.2));
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(300);
const ptLeftAfter = await pointHandle().evaluate((n) => n.style.left);
ok("moving the slider moves the point live", ptLeftBefore !== ptLeftAfter, `${ptLeftBefore} → ${ptLeftAfter}`);
ok("the slider does not touch the source text", (await getDoc()) === before);

// ── Keyboard nudge edits the source identically ────────────────────────────
await fresh();
before = await getDoc();
await freeHandle().focus();
await freeHandle().press("ArrowRight"); // +0.1 in x
await sleep(400);
const [nx, ny] = labelCoords(await getDoc());
ok("arrow-key nudge edits the same at(…) numbers", nx === "-1.6" && ny === "7.5", `(${nx}, ${ny})`);

// ── Shared-URL round-trip reproduces the deck exactly after a drag ─────────
await fresh();
box = await freeHandle().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + 80, box.y - 40, { steps: 8 });
await page.mouse.up();
await sleep(600);
const draggedDoc = await getDoc();
await page.goto(SHARE(draggedDoc)); // reopen the dragged deck from its share URL
await page.waitForFunction(() => typeof window.__chalkDoc === "function" && window.__chalkDoc().length > 0);
ok("share URL round-trips the dragged deck exactly", (await getDoc()) === draggedDoc);

ok("no page errors during drag interactions", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

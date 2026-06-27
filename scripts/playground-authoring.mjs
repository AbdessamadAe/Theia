// Phase 11 authoring assists — real-browser checks (Playwright) against the
// running playground. Run a preview server first (npm run preview -w @chalk/playground).
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
  "## One",
  "",
  ":::scene",
  "@axes ax x:[-3,3] y:[-1,9] grid",
  "@plot f on ax : a*x^2",
  ":::",
  "",
  "## Two",
  "",
  ":::derive",
  "$$ a x^2 $$",
  "+to $$ 2 a x $$",
  ":::",
  "",
].join("\n");
const SHARE = `${BASE}#c=${compressToEncodedURIComponent(SOURCE)}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const getDoc = () => page.evaluate(() => window.__chalkDoc?.() ?? "");
async function fresh() {
  await page.goto(SHARE);
  await page.waitForSelector(".cm-editor");
  await page.waitForFunction(() => typeof window.__chalkDoc === "function" && window.__chalkDoc().length > 0);
  await sleep(200);
}
const contentSlides = (doc) =>
  parse(doc).children.filter((s) => s.kind === "content");
const clickOutline = (text) => page.locator(".cm-editor").first().isVisible().then(() =>
  page.getByText(text, { exact: false }).first());

// ── Slash command opens the palette ───────────────────────────────────────
await fresh();
await page.locator(".cm-content").click();
await page.keyboard.press(`${MOD}+End`);
await page.keyboard.type("\n/");
await sleep(250);
ok("typing '/' opens the insert palette", (await page.locator(".cm-tooltip-autocomplete").count()) > 0);
await page.keyboard.press("Escape");

// ── Insert @plot INSIDE a :::scene via the toolbar palette ─────────────────
await fresh();
await page.locator("#outline-block-0-0, .cm-editor").first().waitFor().catch(() => {});
// Jump caret into the scene by clicking its outline entry.
await page.getByRole("button", { name: ":::scene", exact: false }).first().click();
await sleep(100);
let before = await getDoc();
const beforePlots = parse(before).children[0].children.find((b) => b.type === "scene").objects.filter((o) => o.kind === "plot").length;
await page.click("#insert");
await page.fill('input[aria-label="Search insertable constructs"]', "@plot");
await sleep(120);
await page.keyboard.press("Enter");
await sleep(200);
let after = await getDoc();
const afterScene = parse(after).children[0].children.find((b) => b.type === "scene");
ok("inserting @plot lands INSIDE the scene and parses valid",
  !!afterScene && afterScene.objects.filter((o) => o.kind === "plot").length === beforePlots + 1,
  `plots ${beforePlots} → ${afterScene?.objects.filter((o) => o.kind === "plot").length}`);
const sel = await page.evaluate(() => (window.getSelection && window.getSelection().toString()) || "");
ok("caret/selection lands on the first field after insert", sel.length > 0, `selection: "${sel}"`);

// Undo reverts the palette insert in one step.
await page.locator(".cm-content").click();
await page.keyboard.press(`${MOD}+z`);
await sleep(150);
ok("one Cmd/Ctrl-Z undoes the palette insert", (await getDoc()) === before);

// ── Insert +to INSIDE a :::derive ──────────────────────────────────────────
await fresh();
await page.getByRole("button", { name: ":::derive", exact: false }).first().click();
await sleep(100);
before = await getDoc();
const beforeStates = parse(before).children[1].children.find((b) => b.type === "derive").states.length;
await page.click("#insert");
await page.fill('input[aria-label="Search insertable constructs"]', "+to");
await sleep(120);
await page.keyboard.press("Enter");
await sleep(200);
after = await getDoc();
const afterDerive = parse(after).children[1].children.find((b) => b.type === "derive");
ok("inserting +to lands INSIDE the derive and parses valid",
  !!afterDerive && afterDerive.states.length === beforeStates + 1,
  `states ${beforeStates} → ${afterDerive?.states.length}`);

// ── Outline reflects the deck ──────────────────────────────────────────────
await fresh();
ok("outline lists the deck's slides", (await page.getByRole("button", { name: "One" }).count()) > 0 && (await page.getByRole("button", { name: "Two" }).count()) > 0);

// ── Keyboard reorder: move slide Two up ────────────────────────────────────
await fresh();
before = await getDoc();
ok("initial slide order is [One, Two]", contentSlides(before).map(headingText).join(",") === "One,Two");
await page.getByRole("button", { name: "Move slide 2 up" }).click();
await sleep(200);
after = await getDoc();
ok("keyboard reorder moves the slide (text rewritten)", contentSlides(after).map(headingText).join(",") === "Two,One", contentSlides(after).map(headingText).join(","));
// Undo the reorder in one step.
await page.locator(".cm-content").click();
await page.keyboard.press(`${MOD}+z`);
await sleep(150);
ok("one Cmd/Ctrl-Z undoes the reorder", contentSlides(await getDoc()).map(headingText).join(",") === "One,Two");

// ── Drag a whole :::scene block to the other slide ─────────────────────────
await fresh();
before = await getDoc();
ok("scene starts in slide One", parse(before).children[0].children.some((b) => b.type === "scene"));
const sceneItem = page.getByRole("button", { name: ":::scene", exact: false }).first();
const slideTwo = page.getByRole("button", { name: "Two", exact: true }).first();
await sceneItem.dragTo(slideTwo);
await sleep(250);
after = await getDoc();
const reparsed = parse(after);
const oneHasScene = reparsed.children.find((s) => headingText(s) === "One")?.children.some((b) => b.type === "scene");
const twoHasScene = reparsed.children.find((s) => headingText(s) === "Two")?.children.some((b) => b.type === "scene");
ok("dragging the scene moves its WHOLE block to slide Two", twoHasScene === true && oneHasScene === false, `One:${oneHasScene} Two:${twoHasScene}`);

ok("no page errors during authoring actions", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);

function headingText(slide) {
  return slide.heading.map((n) => (n.type === "text" ? n.value : "")).join("").trim();
}
void clickOutline;

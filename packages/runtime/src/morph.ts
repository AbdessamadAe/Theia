/**
 * `morph(fromEl, toEl)` — the reusable equation-morph primitive.
 *
 * Given two KaTeX-rendered expressions sharing a parent "stage", it glides the
 * glyphs that survive from one to the other (FLIP with CSS transforms, for
 * 60fps), fades out glyphs that disappear, and fades in glyphs that are new.
 * It is the shared building block for advance-driven derivations now and for
 * slider-driven morphs / reactive followers later.
 *
 * Fallbacks, so it never produces a broken jumble:
 *   - prefers-reduced-motion (or no Web Animations API): instant swap.
 *   - low match confidence: a clean cross-fade between the whole expressions.
 *
 * Token matching is delegated to the pure `match.ts`; this module only does DOM
 * measurement and animation.
 */
import { type Atom, matchAtoms, shouldCrossfade } from "./match.js";

export interface MorphOptions {
  /** Tween duration in ms (default 480). */
  duration?: number;
  /** Force the reduced-motion path (otherwise read from the media query). */
  reducedMotion?: boolean;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Leaf glyph spans: KaTeX renders each character as a childless span. */
function extractGlyphs(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>("span").forEach((span) => {
    if (span.childElementCount === 0 && (span.textContent ?? "").trim() !== "") {
      out.push(span);
    }
  });
  return out;
}

/** Nearest ancestor author key (`ck-…` class from a `\htmlClass` hint). */
function keyOf(glyph: HTMLElement, root: HTMLElement): string | null {
  let el: HTMLElement | null = glyph;
  while (el && el !== root.parentElement) {
    for (const cls of el.classList) if (cls.startsWith("ck-")) return cls;
    if (el === root) break;
    el = el.parentElement;
  }
  return null;
}

function atomsOf(glyphs: HTMLElement[], root: HTMLElement): Atom[] {
  return glyphs.map((g) => ({
    content: (g.textContent ?? "").trim(),
    key: keyOf(g, root),
  }));
}

function relRect(el: HTMLElement, origin: DOMRect): Rect {
  const r = el.getBoundingClientRect();
  return {
    left: r.left - origin.left,
    top: r.top - origin.top,
    width: r.width,
    height: r.height,
  };
}

function makeOverlay(stage: HTMLElement): HTMLElement {
  const overlay = document.createElement("div");
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText =
    "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible;";
  stage.appendChild(overlay);
  return overlay;
}

function floatClone(html: string, rect: Rect): HTMLElement {
  const holder = document.createElement("div");
  holder.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;`;
  holder.innerHTML = html;
  return holder;
}

async function settle(animations: Animation[]): Promise<void> {
  await Promise.all(
    animations.map((a) => a.finished.then(() => undefined).catch(() => undefined)),
  );
}

/** Cross-fade the whole "from" appearance out while the new "to" fades in. */
async function crossfade(
  stage: HTMLElement,
  fromClone: HTMLElement,
  toEl: HTMLElement,
  duration: number,
): Promise<void> {
  const overlay = makeOverlay(stage);
  fromClone.style.position = "absolute";
  fromClone.style.left = "0";
  fromClone.style.top = "0";
  overlay.appendChild(fromClone);
  const anims = [
    fromClone.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration,
      easing: EASING,
      fill: "both",
    }),
    toEl.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration,
      easing: EASING,
      fill: "both",
    }),
  ];
  await settle(anims);
  overlay.remove();
}

/**
 * Morph the expression currently shown (`fromEl`, in the stage) into `toEl`.
 * On return, the stage holds `toEl` cleanly. Errors fall back to an instant
 * swap rather than leaving a half-finished animation.
 */
export async function morph(
  fromEl: HTMLElement,
  toEl: HTMLElement,
  options: MorphOptions = {},
): Promise<void> {
  const stage = fromEl.parentElement;
  if (!stage) return;

  const duration = options.duration ?? 480;
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  const canAnimate = typeof (fromEl as HTMLElement).animate === "function";

  // Measure the "from" glyphs and snapshot the whole appearance BEFORE swapping.
  const stageOrigin0 = stage.getBoundingClientRect();
  const fromGlyphs = extractGlyphs(fromEl);
  const fromAtoms = atomsOf(fromGlyphs, fromEl);
  const fromInfo = fromGlyphs.map((g) => ({
    rect: relRect(g, stageOrigin0),
    html: g.outerHTML,
  }));
  const fromClone = fromEl.cloneNode(true) as HTMLElement;

  // Swap in the target (defines the final layout).
  stage.replaceChildren(toEl);

  if (reduced || !canAnimate) return; // instant swap

  if (stage.style.position === "") stage.style.position = "relative";

  const stageOrigin1 = stage.getBoundingClientRect();
  const toGlyphs = extractGlyphs(toEl);
  const toAtoms = atomsOf(toGlyphs, toEl);
  const toRects = toGlyphs.map((g) => relRect(g, stageOrigin1));

  const result = matchAtoms(fromAtoms, toAtoms);

  // Low confidence → clean cross-fade rather than a meaningless scramble.
  if (shouldCrossfade(result)) {
    await crossfade(stage, fromClone, toEl, Math.round(duration * 0.7));
    return;
  }

  const anims: Animation[] = [];
  const matchedTo = new Set<number>();

  // Matched glyphs: glide the target glyph from its old box to its new one.
  for (const { from: fi, to: ti } of result.pairs) {
    matchedTo.add(ti);
    const f = fromInfo[fi]!.rect;
    const t = toRects[ti]!;
    const dx = f.left - t.left;
    const dy = f.top - t.top;
    const sx = t.width ? f.width / t.width : 1;
    const sy = t.height ? f.height / t.height : 1;
    anims.push(
      toGlyphs[ti]!.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
          { transform: "none" },
        ],
        { duration, easing: EASING, fill: "both" },
      ),
    );
  }

  // New glyphs: fade in (slightly delayed so motion reads first).
  for (let j = 0; j < toGlyphs.length; j++) {
    if (matchedTo.has(j)) continue;
    anims.push(
      toGlyphs[j]!.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: Math.round(duration * 0.8),
        delay: Math.round(duration * 0.2),
        easing: EASING,
        fill: "both",
      }),
    );
  }

  // Vanishing glyphs: overlay clones at their old positions, fade out.
  const overlay = makeOverlay(stage);
  for (const fi of result.unmatchedFrom) {
    const clone = floatClone(fromInfo[fi]!.html, fromInfo[fi]!.rect);
    overlay.appendChild(clone);
    anims.push(
      clone.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: Math.round(duration * 0.6),
        easing: EASING,
        fill: "both",
      }),
    );
  }

  await settle(anims);
  overlay.remove();
}

/**
 * Equation morphing — the reusable FLIP primitive.
 *
 * A `MorphController` owns a "stage" element whose single child is the currently
 * shown expression. `morphTo(toEl)` glides the glyphs that survive from the old
 * child to the new one (FLIP via CSS transforms), fades the rest, and leaves
 * `toEl` cleanly in place. It is re-entrant: calling `morphTo` again while a
 * morph is mid-flight measures the glyphs at their *current animated positions*
 * first, then retargets — so continuous slider drags never stack or snap back.
 *
 * Fallbacks: prefers-reduced-motion / no Web Animations API → instant swap; low
 * match confidence → clean cross-fade. Token matching is the pure `match.ts`.
 */
import { type Atom, matchAtoms, shouldCrossfade } from "./match.js";

export interface MorphOptions {
  duration?: number;
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

function extractGlyphs(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>("span").forEach((span) => {
    if (span.childElementCount === 0 && (span.textContent ?? "").trim() !== "") {
      out.push(span);
    }
  });
  return out;
}

function keyOf(glyph: HTMLElement, root: HTMLElement): string | null {
  let el: HTMLElement | null = glyph;
  while (el) {
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

/** Owns a stage and morphs between successive expression states, interruptibly. */
export class MorphController {
  private current: HTMLElement | null;
  private anims: Animation[] = [];
  private overlay: HTMLElement | null = null;

  constructor(private readonly stage: HTMLElement) {
    this.current = stage.firstElementChild as HTMLElement | null;
  }

  /** Swap to `el` with no animation (jumps, reduced-motion). */
  setInstant(el: HTMLElement): void {
    this.teardown();
    this.stage.replaceChildren(el);
    this.current = el;
  }

  /** Cancel the in-flight tween and remove its overlay (visual stays where the
   * DOM currently is — we always measure before calling this). */
  private teardown(): void {
    for (const a of this.anims) {
      try {
        a.cancel();
      } catch {
        /* already gone */
      }
    }
    this.anims = [];
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  /**
   * Morph the current child into `toEl`. Re-entrant: a call mid-flight measures
   * current animated positions, then retargets toward `toEl`.
   */
  morphTo(toEl: HTMLElement, options: MorphOptions = {}): void {
    const fromEl = this.current;
    const reduced = options.reducedMotion ?? prefersReducedMotion();
    const canAnimate = typeof (toEl as HTMLElement).animate === "function";
    if (!fromEl || reduced || !canAnimate) {
      this.setInstant(toEl);
      return;
    }

    // Measure the "from" glyphs at their CURRENT positions (mid-tween aware),
    // and snapshot the appearance, BEFORE tearing down the previous animation.
    const origin0 = this.stage.getBoundingClientRect();
    const fromGlyphs = extractGlyphs(fromEl);
    const fromAtoms = atomsOf(fromGlyphs, fromEl);
    const fromInfo = fromGlyphs.map((g) => ({
      rect: relRect(g, origin0),
      html: g.outerHTML,
    }));
    const fromClone = fromEl.cloneNode(true) as HTMLElement;

    this.teardown();
    this.stage.replaceChildren(toEl);
    this.current = toEl;
    if (this.stage.style.position === "") this.stage.style.position = "relative";

    const origin1 = this.stage.getBoundingClientRect();
    const toGlyphs = extractGlyphs(toEl);
    const toRects = toGlyphs.map((g) => relRect(g, origin1));
    const result = matchAtoms(fromAtoms, atomsOf(toGlyphs, toEl));

    const duration = options.duration ?? 460;

    if (shouldCrossfade(result)) {
      this.crossfade(fromClone, toEl, Math.round(duration * 0.7));
      return;
    }

    // The whole deck is scaled to fit the viewport (`.deck { transform: scale(S) }`,
    // see nav.ts). getBoundingClientRect reports screen px (already ×S), but a
    // glyph's OWN transform is applied in its local space and then scaled by the
    // ancestor again — so translate offsets must be divided by S, or matched
    // glyphs land S× off and the morph only looks right at S≈1. Width *ratios*
    // (sx, sy) are scale-invariant, so they need no correction.
    const scale = this.stage.offsetWidth ? origin1.width / this.stage.offsetWidth : 1;
    const anims: Animation[] = [];
    const matchedTo = new Set<number>();
    for (const { from: fi, to: ti } of result.pairs) {
      matchedTo.add(ti);
      const f = fromInfo[fi]!.rect;
      const t = toRects[ti]!;
      const dx = (f.left - t.left) / scale;
      const dy = (f.top - t.top) / scale;
      const sx = t.width ? f.width / t.width : 1;
      const sy = t.height ? f.height / t.height : 1;
      const g = toGlyphs[ti]!;
      // Pin the origin to the top-left so a glyph that changes size scales about
      // the same corner the translate is measured from (the default center
      // origin makes size-changing glyphs drift).
      g.style.transformOrigin = "0 0";
      anims.push(
        g.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
            { transform: "none" },
          ],
          { duration, easing: EASING, fill: "both" },
        ),
      );
    }
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
    const overlay = makeOverlay(this.stage);
    for (const fi of result.unmatchedFrom) {
      const r = fromInfo[fi]!.rect;
      // Overlay lives inside the scaled deck, so position it in local px too.
      const clone = floatClone(fromInfo[fi]!.html, { ...r, left: r.left / scale, top: r.top / scale });
      overlay.appendChild(clone);
      anims.push(
        clone.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: Math.round(duration * 0.6),
          easing: EASING,
          fill: "both",
        }),
      );
    }

    this.anims = anims;
    this.overlay = overlay;
    void Promise.all(
      anims.map((a) => a.finished.then(() => undefined).catch(() => undefined)),
    ).then(() => {
      if (this.overlay === overlay) {
        overlay.remove();
        this.overlay = null;
        this.anims = [];
      }
    });
  }

  private crossfade(
    fromClone: HTMLElement,
    toEl: HTMLElement,
    duration: number,
  ): void {
    const overlay = makeOverlay(this.stage);
    fromClone.style.position = "absolute";
    fromClone.style.left = "0";
    fromClone.style.top = "0";
    // Span the stage so a centred display equation keeps its centring while it
    // fades (a shrink-to-fit absolute clone would jump to the left edge).
    fromClone.style.width = "100%";
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
    this.anims = anims;
    this.overlay = overlay;
    void Promise.all(
      anims.map((a) => a.finished.then(() => undefined).catch(() => undefined)),
    ).then(() => {
      if (this.overlay === overlay) {
        overlay.remove();
        this.overlay = null;
        this.anims = [];
      }
    });
  }
}

/** One-shot convenience: morph the element currently in its parent to `toEl`. */
export function morph(
  fromEl: HTMLElement,
  toEl: HTMLElement,
  options: MorphOptions = {},
): void {
  const stage = fromEl.parentElement;
  if (!stage) return;
  new MorphController(stage).morphTo(toEl, options);
}

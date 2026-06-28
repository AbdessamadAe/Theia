/**
 * Emphasis effects (Part C) — direct attention to a marked sub-expression.
 *
 * A `\mark{…}` in the tex renders (via a KaTeX macro) to a span with class
 * `ck-mark`; `+emphasize [effect] [target]` fires one of a small set of effects
 * on the matching mark when the advance arrives:
 *   - highlight   — persistent color/underline (a state, kept while shown),
 *   - pulse       — Indicate-style scale bump (transient),
 *   - circumscribe — a transient ring drawn around the term.
 *
 * Reduced motion: transient effects degrade to the persistent highlight (color
 * only, no motion), so attention is still directed without animation.
 */

export type EmphasisEffect = "highlight" | "pulse" | "circumscribe";

export interface EmphasisSpec {
  effect: EmphasisEffect;
  /** Optional sub-expression text to disambiguate among several marks. */
  target?: string;
}

const norm = (s: string): string => s.replace(/\s+/g, "");

/** The `ck-mark` spans within `root` matching `target` (all marks if none). */
export function findMarks(root: HTMLElement, target?: string): HTMLElement[] {
  const marks = Array.from(root.querySelectorAll<HTMLElement>(".ck-mark"));
  if (!target) return marks;
  const want = norm(target);
  const matched = marks.filter((m) => norm(m.textContent ?? "") === want);
  return matched.length > 0 ? matched : marks;
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Add the persistent highlight class (color/underline). */
function highlight(el: HTMLElement): void {
  el.classList.add("theia-emph-highlight");
}

function pulse(el: HTMLElement): void {
  if (typeof el.animate !== "function") return;
  el.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.22)" },
      { transform: "scale(1)" },
    ],
    { duration: 520, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
  );
}

function circumscribe(el: HTMLElement): void {
  const host = el.offsetParent instanceof HTMLElement ? el.offsetParent : null;
  // Draw a ring in the nearest positioned ancestor (the slide body / stage).
  const ring = document.createElement("div");
  ring.className = "theia-emph-ring";
  const r = el.getBoundingClientRect();
  const base = (host ?? document.body).getBoundingClientRect();
  const pad = 4;
  ring.style.cssText = `position:absolute;left:${r.left - base.left - pad}px;top:${
    r.top - base.top - pad
  }px;width:${r.width + 2 * pad}px;height:${r.height + 2 * pad}px;`;
  (host ?? document.body).appendChild(ring);
  if (typeof ring.animate === "function") {
    const anim = ring.animate(
      [
        { opacity: 0, transform: "scale(0.8)" },
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(1.05)" },
      ],
      { duration: 900, easing: "ease-out" },
    );
    anim.finished.then(() => ring.remove()).catch(() => ring.remove());
  } else {
    ring.remove();
  }
}

/**
 * Apply an emphasis effect to every matching mark in `root`. `transient` is
 * true only on forward, single-step advances; on jumps/back we apply just the
 * persistent highlight so the colored term stays correct without replaying.
 */
export function emphasize(
  root: HTMLElement,
  spec: EmphasisSpec,
  transient: boolean,
): void {
  const targets = findMarks(root, spec.target);
  const reduced = reducedMotion();
  for (const el of targets) {
    if (spec.effect === "highlight") {
      highlight(el);
      continue;
    }
    // pulse / circumscribe are motion; degrade to a highlight under reduced
    // motion or when not a forward advance.
    if (reduced) {
      highlight(el);
      continue;
    }
    if (!transient) continue; // don't replay motion on back/jump
    if (spec.effect === "pulse") pulse(el);
    else circumscribe(el);
  }
}

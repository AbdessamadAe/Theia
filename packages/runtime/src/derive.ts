/**
 * `:::derive` blocks: advance-driven equation morphing.
 *
 * Each block carries an ordered list of state tex strings (emitted as JSON by
 * the renderer) and its position in the slide's advance sequence. It listens
 * for the `chalk:advance` event from the navigation controller (the SAME
 * advance flow as `+step` reveal — no parallel controller) and morphs to the
 * state implied by the current reveal count. Going backward reverses the morph.
 *
 * Author match hints ride inside the tex as `\htmlClass{ck-…}{…}`, so KaTeX is
 * rendered here with `trust` enabled.
 */
import { morph } from "./morph.js";

interface KatexLike {
  render(tex: string, el: HTMLElement, opts: Record<string, unknown>): void;
}
function katex(): KatexLike | undefined {
  return (globalThis as unknown as { katex?: KatexLike }).katex;
}

function renderState(tex: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "chalk-derive__state";
  const k = katex();
  if (k) {
    try {
      k.render(tex, span, {
        displayMode: true,
        throwOnError: false,
        trust: true,
        strict: false,
      });
    } catch {
      span.textContent = tex;
    }
  } else {
    span.textContent = tex;
  }
  return span;
}

interface DeriveController {
  block: HTMLElement;
  base: number;
  transitions: number;
}

export function initDerive(): void {
  const blocks = Array.from(
    document.querySelectorAll<HTMLElement>(".chalk-derive"),
  );
  if (blocks.length === 0) return;

  const controllers: DeriveController[] = [];

  for (const block of blocks) {
    const stage = block.querySelector<HTMLElement>(".chalk-derive__stage");
    const statesEl = block.querySelector(".chalk-derive__states");
    if (!stage || !statesEl) continue;

    let texList: string[];
    try {
      texList = JSON.parse(statesEl.textContent ?? "[]") as string[];
    } catch {
      continue;
    }
    if (texList.length === 0) continue;

    const base = parseInt(block.getAttribute("data-advance-base") || "0", 10);
    const transitions = Math.max(0, texList.length - 1);
    let currentState = 0;
    let animating: Promise<void> = Promise.resolve();

    // Re-render the initial state client-side so its glyph structure matches
    // the states we morph to (same KaTeX version + options, incl. trust).
    stage.replaceChildren(renderState(texList[0]!));

    const setState = (target: number, animate: boolean): void => {
      const clamped = Math.max(0, Math.min(transitions, target));
      if (clamped === currentState) return;
      const toEl = renderState(texList[clamped]!);
      const fromEl = stage.firstElementChild as HTMLElement | null;
      const single = Math.abs(clamped - currentState) === 1;
      currentState = clamped;

      if (!animate || !single || !fromEl) {
        stage.replaceChildren(toEl); // jump: instant
        return;
      }
      // Serialize overlapping morphs (rapid advances) to avoid visual races.
      animating = animating
        .then(() => morph(fromEl, toEl))
        .catch(() => {
          try {
            stage.replaceChildren(toEl);
          } catch {
            /* ignore */
          }
        });
    };

    // Expose for the advance listener.
    (block as unknown as { __setState?: typeof setState }).__setState = setState;
    controllers.push({ block, base, transitions });
  }

  document.addEventListener("chalk:advance", (event) => {
    const detail = (event as CustomEvent).detail as {
      slide: HTMLElement;
      revealed: number;
      animate: boolean;
    };
    if (!detail || !detail.slide) return;
    for (const ctrl of controllers) {
      if (!detail.slide.contains(ctrl.block)) continue;
      const target = detail.revealed - ctrl.base;
      const setState = (ctrl.block as unknown as {
        __setState?: (t: number, a: boolean) => void;
      }).__setState;
      setState?.(target, detail.animate);
    }
  });
}

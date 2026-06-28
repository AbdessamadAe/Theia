/**
 * `:::derive` blocks: advance-driven equation morphing + emphasis.
 *
 * Each block carries an ordered list of states (tex + optional emphasis specs)
 * emitted as JSON, and its position in the slide's advance sequence. It listens
 * for the navigation controller's `theia:advance` event — the SAME flow as
 * `+step` reveal and slider updates — and morphs to the implied state, then
 * fires that state's emphasis. Going backward reverses the morph; persistent
 * highlights re-apply, transient pulses/rings do not replay.
 */
import { emphasize, type EmphasisSpec } from "./emphasis.js";
import { MorphController } from "./morph.js";

interface KatexLike {
  render(tex: string, el: HTMLElement, opts: Record<string, unknown>): void;
}
function katex(): KatexLike | undefined {
  return (globalThis as unknown as { katex?: KatexLike }).katex;
}

interface StateSpec {
  tex: string;
  emphasis?: EmphasisSpec[];
}

const MARK_MACRO = { "\\mark": "\\htmlClass{ck-mark}{#1}" };

function renderState(tex: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "theia-derive__state";
  const k = katex();
  if (k) {
    try {
      k.render(tex, span, {
        displayMode: true,
        throwOnError: false,
        trust: true,
        strict: false,
        macros: MARK_MACRO,
      });
    } catch {
      span.textContent = tex;
    }
  } else {
    span.textContent = tex;
  }
  return span;
}

export function initDerive(): void {
  const blocks = Array.from(
    document.querySelectorAll<HTMLElement>(".theia-derive"),
  );
  if (blocks.length === 0) return;

  for (const block of blocks) {
    const stage = block.querySelector<HTMLElement>(".theia-derive__stage");
    const statesEl = block.querySelector(".theia-derive__states");
    if (!stage || !statesEl) continue;

    let states: StateSpec[];
    try {
      states = JSON.parse(statesEl.textContent ?? "[]") as StateSpec[];
    } catch {
      continue;
    }
    if (states.length === 0) continue;

    const base = parseInt(block.getAttribute("data-advance-base") || "0", 10);
    const transitions = Math.max(0, states.length - 1);
    let currentState = 0;

    // Re-render the initial state so its glyph structure matches the states we
    // morph to (same KaTeX options, including trust + the \mark macro).
    stage.replaceChildren(renderState(states[0]!.tex));
    const morpher = new MorphController(stage);

    const fireEmphasis = (stateIndex: number, transient: boolean): void => {
      const specs = states[stateIndex]?.emphasis;
      if (!specs) return;
      const target = stage.firstElementChild as HTMLElement | null;
      if (!target) return;
      for (const spec of specs) emphasize(target, spec, transient);
    };

    const setState = (rawTarget: number, animate: boolean): void => {
      const target = Math.max(0, Math.min(transitions, rawTarget));
      if (target === currentState) return;
      const single = Math.abs(target - currentState) === 1;
      const forward = target > currentState;
      const toEl = renderState(states[target]!.tex);

      if (animate && single) morpher.morphTo(toEl);
      else morpher.setInstant(toEl);

      currentState = target;
      // Pulses/rings only on a forward single-step advance; highlights always.
      fireEmphasis(target, animate && single && forward);
    };

    (block as unknown as { __setState?: typeof setState }).__setState = setState;
    block.setAttribute("data-advance-base", String(base));
  }

  document.addEventListener("theia:advance", (event) => {
    const detail = (event as CustomEvent).detail as {
      slide: HTMLElement;
      revealed: number;
      animate: boolean;
    };
    if (!detail?.slide) return;
    for (const block of blocks) {
      if (!detail.slide.contains(block)) continue;
      const base = parseInt(block.getAttribute("data-advance-base") || "0", 10);
      const setState = (block as unknown as {
        __setState?: (t: number, a: boolean) => void;
      }).__setState;
      setState?.(detail.revealed - base, detail.animate);
    }
  });
}

import type {
  Block,
  CodeCell,
  GeoBlock,
  Inline,
  ListBlock,
  Plot,
  Slide,
  Slider,
  TheoremBlock,
  TheoremKind,
} from "@chalk/ast";
import { formatValue, referencedVars, substituteLatex } from "@chalk/runtime";
import { escapeHtml } from "./escape.js";
import { renderMath } from "./katex-assets.js";

/**
 * Per-slide rendering state.
 *  - `stepCount` gives each `+step` a stable 0-based index the runtime reveals.
 *  - `sliders` maps every slider name declared anywhere on the slide to its
 *    default value, gathered in a pre-pass so that math appearing *before* its
 *    slider (as on the parabola slide) is still detected as reactive.
 */
interface SlideCtx {
  stepCount: number;
  sliders: Map<string, number>;
}

const THEOREM_LABELS: Record<TheoremKind, string> = {
  definition: "Definition",
  theorem: "Theorem",
  lemma: "Lemma",
  proof: "Proof",
  example: "Example",
  remark: "Remark",
};

// --- Pre-pass: collect sliders on a slide ----------------------------------

function collectSliders(blocks: Block[], out: Map<string, number>): void {
  for (const block of blocks) {
    switch (block.type) {
      case "slider":
        out.set(block.name, block.default);
        break;
      case "theorem":
        collectSliders(block.children, out);
        for (const step of block.steps) collectSliders(step.children, out);
        break;
      case "list":
        for (const item of block.items) collectSliders(item, out);
        break;
      default:
        break;
    }
  }
}

// --- Math (static or reactive) ---------------------------------------------

/**
 * Render a math node. If its tex references any slider on the slide, emit a
 * reactive element carrying the *template* tex and its slider dependencies; the
 * runtime re-renders it on change. We still server-render it (with the sliders'
 * default values substituted) so the deck reads correctly before/without JS.
 */
function renderMathNode(tex: string, display: boolean, ctx: SlideCtx): string {
  const vars = referencedVars(tex, ctx.sliders.keys());
  if (vars.length === 0) {
    return display
      ? `<div class="chalk-math-display">${renderMath(tex, true)}</div>`
      : renderMath(tex, false);
  }

  const defaults: Record<string, number> = {};
  for (const v of vars) defaults[v] = ctx.sliders.get(v) ?? 0;
  const initial = renderMath(substituteLatex(tex, defaults), display);
  const attrs =
    `data-chalk-math="${escapeHtml(tex)}"` +
    ` data-chalk-vars="${escapeHtml(vars.join(","))}"` +
    ` data-chalk-display="${display ? "1" : "0"}"`;

  return display
    ? `<div class="chalk-math-display chalk-reactive" ${attrs}>${initial}</div>`
    : `<span class="chalk-reactive" ${attrs}>${initial}</span>`;
}

// --- Inline ----------------------------------------------------------------

function renderInline(nodes: Inline[], ctx: SlideCtx): string {
  return nodes.map((n) => renderInlineNode(n, ctx)).join("");
}

function renderInlineNode(node: Inline, ctx: SlideCtx): string {
  switch (node.type) {
    case "text":
      return escapeHtml(node.value);
    case "inlineMath":
      return renderMathNode(node.tex, false, ctx);
    case "inlineCode":
      return `<code class="chalk-code-inline">${escapeHtml(node.value)}</code>`;
    case "strong":
      return `<strong>${renderInline(node.children, ctx)}</strong>`;
    case "emphasis":
      return `<em>${renderInline(node.children, ctx)}</em>`;
  }
}

// --- Blocks ----------------------------------------------------------------

function renderBlocks(blocks: Block[], ctx: SlideCtx): string {
  return blocks.map((b) => renderBlock(b, ctx)).join("\n");
}

function renderBlock(block: Block, ctx: SlideCtx): string {
  switch (block.type) {
    case "paragraph":
      return `<p class="chalk-p">${renderInline(block.children, ctx)}</p>`;
    case "math":
      return renderMathNode(block.tex, true, ctx);
    case "theorem":
      return renderTheorem(block, ctx);
    case "slider":
      return renderSlider(block);
    case "plot":
      return renderPlot(block);
    case "geo":
      return renderGeo(block);
    case "code":
      return renderCode(block);
    case "list":
      return renderList(block, ctx);
  }
}

function renderTheorem(block: TheoremBlock, ctx: SlideCtx): string {
  const label = THEOREM_LABELS[block.kind];
  const title = block.title
    ? ` <span class="chalk-theorem__title">${escapeHtml(block.title)}</span>`
    : "";
  const body = renderBlocks(block.children, ctx);
  const steps = block.steps
    .map((step) => {
      const index = ctx.stepCount++;
      return `<div class="chalk-step" data-step="${index}">${renderBlocks(
        step.children,
        ctx,
      )}</div>`;
    })
    .join("\n");
  return `<div class="chalk-block chalk-theorem chalk-theorem--${block.kind}">
  <div class="chalk-theorem__label"><span class="chalk-theorem__kind">${label}</span>${title}</div>
  <div class="chalk-theorem__body">${body}${steps}</div>
</div>`;
}

/** A live, interactive range slider wired to the reactive graph at load. */
function renderSlider(block: Slider): string {
  const step = block.step ?? (block.max - block.min) / 100;
  return `<div class="chalk-block chalk-slider chalk-interactive" data-slider="${escapeHtml(
    block.name,
  )}">
  <span class="chalk-tag">slider</span>
  <span class="chalk-slider__name">${escapeHtml(block.name)}</span>
  <input class="chalk-slider__input" type="range" min="${block.min}" max="${block.max}" value="${block.default}" step="${step}" aria-label="${escapeHtml(
    block.name,
  )}" />
  <span class="chalk-slider__value">= ${formatValue(block.default)}</span>
  <span class="chalk-slider__range">[${block.min}, ${block.max}]</span>
</div>`;
}

/** Derive a plot's independent variable from a `f(x) = …` left-hand side. */
function deriveXVar(lhs: string | undefined): string {
  if (!lhs) return "x";
  const m = /\(\s*([A-Za-z_]\w*)\s*\)/.exec(lhs);
  return m ? m[1]! : "x";
}

/** A live canvas plot. The runtime compiles `data-expr`, samples it across
 * [data-xmin, data-xmax], and redraws whenever a `data-vars` slider changes. */
function renderPlot(block: Plot): string {
  const label = block.lhs ? `${block.lhs} = ${block.expr}` : block.expr;
  const deps =
    block.vars.length > 0
      ? `<span class="chalk-plot__deps">reacts to ${block.vars
          .map((v) => `<code>${escapeHtml(v)}</code>`)
          .join(", ")}</span>`
      : `<span class="chalk-plot__deps">static curve</span>`;
  return `<div class="chalk-block chalk-plot chalk-interactive" data-expr="${escapeHtml(
    block.expr,
  )}" data-vars="${escapeHtml(block.vars.join(","))}" data-xvar="${escapeHtml(
    deriveXVar(block.lhs),
  )}" data-xmin="-5" data-xmax="5">
  <div class="chalk-plot__head"><span class="chalk-tag">plot</span><code class="chalk-plot__expr">${escapeHtml(
    label,
  )}</code>${deps}</div>
  <canvas class="chalk-plot__canvas" role="img" aria-label="plot of ${escapeHtml(
    label,
  )}"></canvas>
</div>`;
}

/** A real GeoGebra embed. The applet is injected client-side (needs the
 * geogebra.org CDN); the source commands ride along in `data-geo-src`. */
function renderGeo(block: GeoBlock): string {
  return `<div class="chalk-block chalk-geo chalk-interactive" data-geo-src="${escapeHtml(
    block.source,
  )}">
  <div class="chalk-geo__head"><span class="chalk-tag">geometry</span><span class="chalk-geo__note">GeoGebra (loads from geogebra.org)</span></div>
  <div class="chalk-geo__applet"></div>
</div>`;
}

function renderCode(block: CodeCell): string {
  const langLabel = block.lang === "py" ? "python" : "javascript";
  return `<div class="chalk-block chalk-placeholder chalk-code">
  <div class="chalk-code__head"><span class="chalk-tag">${langLabel} cell</span><span class="chalk-code__note">output — live with the compute layer</span></div>
  <pre class="chalk-code__source"><code>${escapeHtml(block.source)}</code></pre>
</div>`;
}

function renderList(block: ListBlock, ctx: SlideCtx): string {
  const tag = block.ordered ? "ol" : "ul";
  const items = block.items
    .map((item) => `<li>${renderBlocks(item, ctx)}</li>`)
    .join("\n");
  return `<${tag} class="chalk-list">${items}</${tag}>`;
}

// --- Slide -----------------------------------------------------------------

/** Render one slide to its `<section>`, returning the HTML and how many
 * `+step` reveals it contains (used to seed the runtime's per-slide state). */
export function renderSlide(
  slide: Slide,
  index: number,
): { html: string; steps: number } {
  const sliders = new Map<string, number>();
  collectSliders(slide.children, sliders);
  const ctx: SlideCtx = { stepCount: 0, sliders };

  const heading = renderInline(slide.heading, ctx);
  const body = renderBlocks(slide.children, ctx);

  if (slide.kind === "title") {
    const headingHtml = heading
      ? `<h1 class="chalk-title">${heading}</h1>`
      : "";
    return {
      html: `<section class="slide slide--title" data-index="${index}" data-steps="${ctx.stepCount}">
  <div class="slide__inner">
    ${headingHtml}
    <div class="slide__lead">${body}</div>
  </div>
</section>`,
      steps: ctx.stepCount,
    };
  }

  return {
    html: `<section class="slide slide--content" data-index="${index}" data-steps="${ctx.stepCount}">
  <header class="slide__header"><h2 class="chalk-heading">${heading}</h2></header>
  <div class="slide__body">${body}</div>
</section>`,
    steps: ctx.stepCount,
  };
}

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
import { escapeHtml } from "./escape.js";
import { renderMath } from "./katex-assets.js";

/** Per-slide rendering state. `stepCount` is incremented as `+step` items are
 * emitted, giving each a stable 0-based index the runtime reveals in order. */
interface SlideCtx {
  stepCount: number;
}

const THEOREM_LABELS: Record<TheoremKind, string> = {
  definition: "Definition",
  theorem: "Theorem",
  lemma: "Lemma",
  proof: "Proof",
  example: "Example",
  remark: "Remark",
};

// --- Inline ----------------------------------------------------------------

function renderInline(nodes: Inline[]): string {
  return nodes.map(renderInlineNode).join("");
}

function renderInlineNode(node: Inline): string {
  switch (node.type) {
    case "text":
      return escapeHtml(node.value);
    case "inlineMath":
      return renderMath(node.tex, false);
    case "inlineCode":
      return `<code class="chalk-code-inline">${escapeHtml(node.value)}</code>`;
    case "strong":
      return `<strong>${renderInline(node.children)}</strong>`;
    case "emphasis":
      return `<em>${renderInline(node.children)}</em>`;
  }
}

// --- Blocks ----------------------------------------------------------------

function renderBlocks(blocks: Block[], ctx: SlideCtx): string {
  return blocks.map((b) => renderBlock(b, ctx)).join("\n");
}

function renderBlock(block: Block, ctx: SlideCtx): string {
  switch (block.type) {
    case "paragraph":
      return `<p class="chalk-p">${renderInline(block.children)}</p>`;
    case "math":
      return `<div class="chalk-math-display">${renderMath(block.tex, true)}</div>`;
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

function renderSlider(block: Slider): string {
  const step = block.step ?? (block.max - block.min) / 100;
  return `<div class="chalk-block chalk-placeholder chalk-slider" data-slider="${escapeHtml(
    block.name,
  )}">
  <span class="chalk-tag">slider</span>
  <span class="chalk-slider__name">${escapeHtml(block.name)}</span>
  <input class="chalk-slider__input" type="range" min="${block.min}" max="${block.max}" value="${block.default}" step="${step}" disabled aria-disabled="true" />
  <span class="chalk-slider__value">= ${block.default}</span>
  <span class="chalk-slider__range">[${block.min}, ${block.max}]</span>
</div>`;
}

function renderPlot(block: Plot): string {
  const label = block.lhs ? `${block.lhs} = ${block.expr}` : block.expr;
  const deps =
    block.vars.length > 0
      ? `<span class="chalk-plot__deps">reacts to ${block.vars
          .map((v) => `<code>${escapeHtml(v)}</code>`)
          .join(", ")}</span>`
      : `<span class="chalk-plot__deps">static expression</span>`;
  return `<div class="chalk-block chalk-placeholder chalk-plot">
  <div class="chalk-plot__head"><span class="chalk-tag">plot</span><code class="chalk-plot__expr">${escapeHtml(
    label,
  )}</code>${deps}</div>
  <div class="chalk-plot__canvas">interactive plot — live in the runtime</div>
</div>`;
}

function renderGeo(block: GeoBlock): string {
  return `<div class="chalk-block chalk-placeholder chalk-geo">
  <div class="chalk-geo__head"><span class="chalk-tag">geometry</span><span class="chalk-geo__note">GeoGebra embed — live in the runtime</span></div>
  <pre class="chalk-geo__source"><code>${escapeHtml(block.source)}</code></pre>
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
  const ctx: SlideCtx = { stepCount: 0 };
  const heading = renderInline(slide.heading);
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

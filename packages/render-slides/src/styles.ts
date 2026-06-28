/** The deck stylesheet. Fixed-canvas slides, light + dark themes, distinctly
 * styled theorem-family blocks, and clean labeled placeholders for the
 * not-yet-live features (sliders, plots, geometry, code cells). */
export const DECK_CSS = `
:root {
  --canvas-w: 1280px;
  --canvas-h: 720px;

  --bg: #f4f5f7;
  --surface: #ffffff;
  --fg: #1c2024;
  --muted: #6b7280;
  --border: #e2e5ea;
  --accent: #0891b2; /* signature "live" cyan — reactive things */
  --accent-soft: rgba(8, 145, 178, 0.12);
  --code-bg: #f3f4f6;
  --code-fg: #1f2937;
  --tag-bg: #eef2ff;
  --tag-fg: #4338ca;
  --shadow: 0 24px 60px rgba(15, 23, 42, 0.18);

  --thm-definition: #2563eb;
  --thm-theorem: #7c3aed;
  --thm-lemma: #0891b2;
  --thm-proof: #475569;
  --thm-example: #059669;
  --thm-remark: #d97706;
}

[data-theme="dark"] {
  --bg: #0b0e14;
  --surface: #151a23;
  --fg: #e6e9ef;
  --muted: #9aa4b2;
  --border: #283041;
  --accent: #22d3ee; /* chalk cyan, brighter to glow on the board */
  --accent-soft: rgba(34, 211, 238, 0.16);
  --code-bg: #0f141c;
  --code-fg: #d7dde7;
  --tag-bg: #1e2738;
  --tag-fg: #93c5fd;
  --shadow: 0 24px 60px rgba(0, 0, 0, 0.55);

  --thm-definition: #60a5fa;
  --thm-theorem: #c4b5fd;
  --thm-lemma: #67e8f9;
  --thm-proof: #94a3b8;
  --thm-example: #6ee7b7;
  --thm-remark: #fbbf24;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  transition: background 0.2s ease, color 0.2s ease;
}

.stage {
  flex: 1 1 auto;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

/* The deck is absolutely positioned and scaled from its top-left corner; the
 * runtime's fit() translates it to centre the scaled canvas. (Centring an
 * oversized element via grid/flex fails in narrow containers, where the start
 * edge is clamped — so it would drift right with a left gap.) */
.deck {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--canvas-w);
  height: var(--canvas-h);
  transform-origin: top left;
}

.slide {
  position: absolute;
  inset: 0;
  background: var(--surface);
  border-radius: 18px;
  box-shadow: var(--shadow);
  padding: 64px 72px;
  display: none;
  flex-direction: column;
  overflow: hidden;
}

.slide.is-active { display: flex; }

.slide--title { justify-content: center; align-items: flex-start; }
.slide__inner { max-width: 90%; }

.chalk-title {
  font-size: 64px;
  line-height: 1.1;
  margin: 0 0 24px;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.slide__lead { font-size: 26px; color: var(--muted); line-height: 1.5; }
.slide__lead .chalk-p { margin: 0; }

.slide__header { margin-bottom: 18px; border-bottom: 2px solid var(--border); padding-bottom: 14px; }
.chalk-heading { font-size: 40px; margin: 0; font-weight: 700; letter-spacing: -0.01em; }

.slide__body {
  flex: 1 1 auto;
  font-size: 25px;
  line-height: 1.5;
  overflow: auto;
  padding-right: 8px;
}

.chalk-p { margin: 0 0 16px; }
.slide__body > :last-child { margin-bottom: 0; }

.chalk-math-display { margin: 18px 0; overflow-x: auto; }

/* ---- Derivation morphs (:::derive) ---- */
.chalk-derive {
  position: relative;
  margin: 22px 0;
  padding: 12px 16px;
  border-left: 4px solid var(--accent);
  background: color-mix(in srgb, var(--surface) 90%, var(--accent) 10%);
  border-radius: 8px;
  overflow: hidden;
}
.chalk-derive__stage { position: relative; min-height: 1.6em; }
.chalk-derive__state { display: block; }

/* Reactive display math morphs in place too; its state child is the stage. */
.chalk-morph { position: relative; }
.chalk-morph__state { display: inline-block; }

/* Emphasis effects (Part C). */
.chalk-emph-highlight {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border-radius: 4px;
  padding: 0 2px;
}
.chalk-emph-ring {
  pointer-events: none;
  border: 2.5px solid var(--accent);
  border-radius: 8px;
  box-sizing: border-box;
}

/* Follower value label, positioned over the plot canvas by the runtime. */
.chalk-plot__label {
  position: absolute;
  font-size: 0.72em;
  font-variant-numeric: tabular-nums;
  background: var(--surface);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 8px;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: var(--shadow);
}

/* ---- Scenes (Phase 8 graphing) ---- */
.chalk-scene { position: relative; margin: 18px 0; }
.chalk-scene__canvas {
  display: block;
  width: 100%;
  height: 420px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.chalk-scene__overlay { position: absolute; inset: 0; pointer-events: none; }
.chalk-scene--3d .chalk-scene__canvas { height: 440px; cursor: grab; touch-action: none; }
.chalk-scene--3d .chalk-scene__canvas:active { cursor: grabbing; }
.chalk-scene__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--muted);
  font-style: italic;
  font-size: 0.9em;
}
.chalk-scene__loading::before {
  content: "";
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: chalk-spin 0.8s linear infinite;
}
.chalk-scene__hint {
  position: absolute;
  left: 10px;
  bottom: 8px;
  font-size: 0.7em;
  color: var(--muted);
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  padding: 2px 8px;
  border-radius: 6px;
  pointer-events: none;
}
.chalk-scene__label {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 0.8em;
  color: var(--fg);
  background: color-mix(in srgb, var(--surface) 78%, transparent);
  padding: 0 4px;
  border-radius: 4px;
  white-space: nowrap;
}

/* Direct-manipulation handles (editor only). Point handles are a small
   transparent hit area centred on the dot; labels reuse their own box. */
.chalk-scene__handle { position: absolute; transform: translate(-50%, -50%); }
.chalk-scene__handle[data-chalk-point] {
  width: 18px;
  height: 18px;
  border-radius: 50%;
}
.chalk-scene__handle[data-chalk-free] { outline: none; }
.chalk-scene__handle[data-chalk-free]:hover,
.chalk-scene__handle[data-chalk-free]:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
}
.chalk-scene__handle[data-chalk-derived]:hover {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--muted) 45%, transparent);
}

/* Data objects: matrix & table (positioned overlay; crisp text/KaTeX). */
.chalk-scene__matrix, .chalk-scene__table {
  position: absolute;
  transform: translate(-50%, -50%);
  color: var(--fg);
}
.chalk-scene__matrix { font-size: 1.15em; }
.chalk-scene__table table { border-collapse: collapse; font-size: 0.9em; background: var(--surface); }
.chalk-scene__table th, .chalk-scene__table td {
  border: 1px solid var(--border);
  padding: 4px 12px;
  text-align: center;
}
.chalk-scene__table th { font-weight: 700; background: var(--tag-bg); color: var(--tag-fg); }

/* Reactive math: a subtle accent tint marks formulae that move with a slider. */
.chalk-reactive { border-radius: 4px; }
span.chalk-reactive { background: color-mix(in srgb, var(--accent) 9%, transparent); padding: 0 3px; }
.chalk-math-display.chalk-reactive { background: color-mix(in srgb, var(--accent) 7%, transparent); padding: 6px 10px; }
.chalk-code-inline {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--code-bg);
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 0.9em;
}

/* ---- Theorem-family blocks ---- */
.chalk-theorem {
  border: 1px solid var(--border);
  border-left: 5px solid var(--accent);
  background: color-mix(in srgb, var(--surface) 92%, var(--accent) 8%);
  border-radius: 10px;
  padding: 16px 22px;
  margin: 18px 0;
}
.chalk-theorem--definition { border-left-color: var(--thm-definition); }
.chalk-theorem--theorem    { border-left-color: var(--thm-theorem); }
.chalk-theorem--lemma      { border-left-color: var(--thm-lemma); }
.chalk-theorem--proof      { border-left-color: var(--thm-proof); }
.chalk-theorem--example    { border-left-color: var(--thm-example); }
.chalk-theorem--remark     { border-left-color: var(--thm-remark); }

.chalk-theorem__label { margin-bottom: 8px; font-size: 0.92em; }
.chalk-theorem__kind {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.78em;
}
.chalk-theorem--definition .chalk-theorem__kind { color: var(--thm-definition); }
.chalk-theorem--theorem    .chalk-theorem__kind { color: var(--thm-theorem); }
.chalk-theorem--lemma      .chalk-theorem__kind { color: var(--thm-lemma); }
.chalk-theorem--proof      .chalk-theorem__kind { color: var(--thm-proof); }
.chalk-theorem--example    .chalk-theorem__kind { color: var(--thm-example); }
.chalk-theorem--remark     .chalk-theorem__kind { color: var(--thm-remark); }
.chalk-theorem__title { color: var(--muted); font-style: italic; }
.chalk-theorem__body > :last-child { margin-bottom: 0; }

/* ---- Step reveal ---- */
.chalk-step {
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.25s ease, transform 0.25s ease;
  margin: 10px 0;
}
.chalk-step.is-revealed { opacity: 1; transform: none; }

/* ---- Placeholders (sliders / plots / geo / code) ---- */
.chalk-placeholder {
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 16px 18px;
  margin: 18px 0;
  background: var(--code-bg);
}
.chalk-tag {
  display: inline-block;
  font-size: 0.62em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--tag-fg);
  background: var(--tag-bg);
  padding: 3px 9px;
  border-radius: 999px;
  vertical-align: middle;
}

/* ---- Live interactive blocks (slider / plot / geo) ---- */
.chalk-slider, .chalk-plot, .chalk-geo {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 18px;
  margin: 18px 0;
  background: var(--code-bg);
}

/* The slider is the hero of the reactive story: a left accent rail, a live
 * name pill, an accent-tracked range, and a prominent value readout. */
.chalk-slider {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  border-left: 3px solid var(--accent);
  background: linear-gradient(to right, var(--accent-soft), transparent 40%), var(--surface);
}
.chalk-slider__name {
  font-weight: 700; font-style: italic; font-size: 1.05em; color: var(--accent);
  display: inline-flex; align-items: center; gap: 8px;
}
.chalk-slider__name::before {
  content: ""; width: 8px; height: 8px; border-radius: 50%;
  background: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft);
}
.chalk-slider__input {
  flex: 1 1 220px; cursor: pointer; height: 22px;
  -webkit-appearance: none; appearance: none; background: transparent;
}
.chalk-slider__input::-webkit-slider-runnable-track {
  height: 6px; border-radius: 999px;
  background: linear-gradient(var(--border), var(--border));
}
.chalk-slider__input::-moz-range-track { height: 6px; border-radius: 999px; background: var(--border); }
.chalk-slider__input::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 18px; height: 18px; margin-top: -6px; border-radius: 50%;
  background: var(--accent); border: 2px solid var(--surface);
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
  transition: box-shadow 0.15s ease, transform 0.1s ease;
}
.chalk-slider__input::-moz-range-thumb {
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--accent); border: 2px solid var(--surface);
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
}
.chalk-slider__input:hover::-webkit-slider-thumb { box-shadow: 0 0 0 6px var(--accent-soft); }
.chalk-slider__input:active::-webkit-slider-thumb { transform: scale(1.1); }
.chalk-slider__input:focus-visible { outline: none; }
.chalk-slider__input:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 6px var(--accent-soft); }
.chalk-slider__value {
  font-variant-numeric: tabular-nums; color: var(--accent); font-weight: 700;
  min-width: 4ch; font-size: 1.05em;
}
.chalk-slider__range { color: var(--muted); font-size: 0.85em; font-variant-numeric: tabular-nums; }

.chalk-plot__head, .chalk-geo__head, .chalk-code__head {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px;
}
.chalk-plot__expr {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.95em;
}
.chalk-plot__deps, .chalk-geo__note, .chalk-code__note { color: var(--muted); font-size: 0.8em; }
.chalk-plot__deps code { font-family: inherit; }
.chalk-plot__canvas {
  display: block;
  width: 100%;
  height: 280px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

/* ---- Media (images & video) ---- */
.chalk-media { margin: 18px 0; }
.chalk-media--image, .chalk-media--video { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.chalk-image {
  max-width: 100%;
  height: auto;
  object-fit: contain;
  image-rendering: auto;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.chalk-image--inline { display: inline-block; vertical-align: middle; max-height: 1.6em; border: none; border-radius: 4px; margin: 0 2px; }
.chalk-image[data-chalk-noalt] { outline: 2px dashed color-mix(in srgb, var(--thm-remark) 60%, transparent); outline-offset: 2px; }
.chalk-video {
  max-width: 100%;
  height: auto;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: #000;
  outline: none;
}
.chalk-video:focus-visible { box-shadow: 0 0 0 3px var(--accent-soft); }
.chalk-media__caption { color: var(--muted); font-size: 0.85em; font-style: italic; text-align: center; }

/* Scene media: positioned overlay elements (image/video), sized in scene units. */
.chalk-scene__media {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  object-fit: contain;
  max-width: none;
}
.chalk-scene__media--video { background: #000; }

/* ---- Geometry (GeoGebra) embed ---- */
.chalk-geo__applet {
  width: 100%;
  height: 380px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface);
}
.chalk-geo__error {
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--muted);
  padding: 24px;
  font-size: 0.9em;
}

.chalk-geo__source, .chalk-code__source {
  margin: 0;
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
}
.chalk-geo__source code, .chalk-code__source code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.62em;
  line-height: 1.45;
  white-space: pre;
  color: var(--code-fg);
}

.chalk-list { margin: 0 0 16px; padding-left: 1.4em; }
.chalk-list li { margin: 6px 0; }

/* ---- Bottom bar ---- */
.chalk-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 18px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  font-size: 14px;
  color: var(--muted);
}
.chalk-bar__title { font-weight: 600; color: var(--fg); flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chalk-bar__counter { font-variant-numeric: tabular-nums; }
.chalk-bar__progress { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--accent); width: 0; transition: width 0.2s ease; }
.chalk-bar { position: relative; }
.chalk-bar__btn {
  appearance: none;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  border-radius: 7px;
  padding: 5px 11px;
  cursor: pointer;
  font: inherit;
  line-height: 1;
}
.chalk-bar__btn:hover { border-color: var(--accent); color: var(--accent); }

/* ---- Live JS code cells (compute layer) ---- */
.chalk-code.chalk-cell {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  margin: 18px 0;
  background: var(--code-bg);
}
.chalk-cell__output { margin-top: 10px; }
.chalk-cell__output:empty { display: none; }
.chalk-cell__value {
  font-variant-numeric: tabular-nums;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
}
.chalk-cell__tex { margin: 4px 0; }
.chalk-cell__canvas {
  display: block;
  max-width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
/* Captured matplotlib figures (PNG on a white field for legibility in dark). */
.chalk-cell__image {
  display: block;
  max-width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #ffffff;
}
/* Calm loading state while Pyodide initializes (first load only). */
.chalk-cell__loading {
  color: var(--muted);
  font-style: italic;
  font-size: 0.9em;
  display: flex;
  align-items: center;
  gap: 8px;
}
.chalk-cell__loading::before {
  content: "";
  width: 12px;
  height: 12px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: chalk-spin 0.8s linear infinite;
}
@keyframes chalk-spin { to { transform: rotate(360deg); } }
/* The error box already wraps; cap its height so a long traceback scrolls. */
.chalk-cell__error { max-height: 220px; overflow: auto; }
.chalk-cell__error {
  margin-top: 10px;
  border: 1px solid #ef4444;
  border-left: 4px solid #ef4444;
  background: color-mix(in srgb, var(--surface) 88%, #ef4444 12%);
  color: var(--fg);
  border-radius: 8px;
  padding: 10px 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8em;
  white-space: pre-wrap;
}

/* ---- Respect reduced-motion: disable reveal/scale transitions ---- */
@media (prefers-reduced-motion: reduce) {
  body, .chalk-bar__progress { transition: none; }
  .chalk-step { transition: none; transform: none; }
  .chalk-cell__loading::before { animation: none; }
  .chalk-scene__loading::before { animation: none; }
}
`;

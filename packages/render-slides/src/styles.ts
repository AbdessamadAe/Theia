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
  --accent: #2563eb;
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
  --accent: #60a5fa;
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
  display: grid;
  place-items: center;
  overflow: hidden;
  min-height: 0;
}

.deck {
  position: relative;
  width: var(--canvas-w);
  height: var(--canvas-h);
  transform-origin: center center;
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

.chalk-slider { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.chalk-slider__name { font-weight: 700; font-style: italic; font-size: 1.05em; }
.chalk-slider__input { flex: 1 1 220px; accent-color: var(--accent); cursor: pointer; height: 6px; }
.chalk-slider__value { font-variant-numeric: tabular-nums; color: var(--fg); font-weight: 600; min-width: 4ch; }
.chalk-slider__range { color: var(--muted); font-size: 0.85em; }

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
}
`;

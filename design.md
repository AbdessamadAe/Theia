# Chalk — Architecture

*An installable engine that compiles a math-teaching markup language into live, interactive slide decks.*

---

## 1. What Chalk is

Chalk is a tool for presenting mathematics. A professor writes a single source file in the Chalk language (`.chalk`), runs the Chalk engine, and gets an **interactive slide deck** to present in class — live and reactive, not a static PDF. Because the deck compiles to a self-contained web bundle, it is also shareable as a URL: students can open the same interactive slides on their own devices, drag the same sliders, and step through the same derivations.

Chalk sits in the lineage of LaTeX and Manim. LaTeX compiles markup into documents; Manim compiles Python into mathematical animation videos. Chalk compiles a math-teaching language into interactive slides. Like both, it is installed and run from the command line. Unlike both, its output is a *live, reactive* document that runs in a browser — a slider the professor drags during the lecture re-computes and re-renders on the projector in real time.

### What Chalk is not

- It is not a WYSIWYG slide editor. Authoring is text-based, like LaTeX or markdown.
- It is not a general typesetting system. It targets math-teaching slides specifically, not papers or books.
- It is not a geometry engine. Geometric figures are delegated to GeoGebra; Chalk orchestrates rather than reinvents.
- It is not a commercial product. The goal is to be genuinely useful to educators and free to use.

### Scope

This document targets a single output: interactive slides. A notes document and a PDF export are deliberately out of scope for now. The architecture leaves the door open for them — the AST carries the full content of a lecture, so additional renderers can be added later without touching the parser — but the project focuses on doing one thing well first: the best interactive math slide deck that exists.

### The core bet

Math teaching has structure that no general-purpose tool models — theorems, proofs, definitions, stepped derivations, parameter exploration. A slide tool that treats these as first-class, and that makes interactivity live without a server, is worth installing. The audience that values this most — Manim and LaTeX users — installs such tools without hesitation.

---

## 2. Guiding principles

These resolve design decisions when the right answer is unclear.

1. **The source compiles to live, interactive slides.** That is the product. Everything serves the quality of the presented deck.
2. **Markup first, code when needed.** The bulk of a lecture — prose, math, theorems, proofs — is written in readable markup. Computation drops into embedded code cells. That escape hatch into a real programming language is what gives the engine open-ended power.
3. **The AST is the single source of truth.** The renderer reads the parsed tree. The parser is pure and decoupled, and is designed to carry more than the slide renderer currently uses, so future renderers need no parser change.
4. **Interactivity is live, and needs no server.** A slider is a reactive variable in the runtime, not a value baked in at compile time. Reactivity runs client-side.
5. **Delegate what already works.** KaTeX renders math. GeoGebra renders geometry. Chalk builds only the connective tissue and the genuinely missing primitives.
6. **Slides are shareable, so students benefit too.** The compiled deck is a self-contained web bundle. A shared interactive deck — sliders, stepped proofs, live plots — is a far better study artifact than a static PDF of slides.
7. **Step-reveal is a pacing mechanic.** Revealing a derivation one line at a time keeps a class focused on the current step. It is built into the slide model, not a layout afterthought.

---

## 3. The compile pipeline

```
.chalk source
        │
        ▼
   ┌──────────┐
   │  PARSER  │   pure: string → AST, no I/O, no UI
   └──────────┘
        │
        ▼
   ┌────────────────────────────┐
   │            AST             │   the shared contract:
   │  (single source of truth)  │   slides, theorems, steps,
   └────────────────────────────┘   sliders, plots, geo, code
        │
        ▼
   ┌──────────────────┐
   │  COMPUTE ENGINE  │   executes embedded code cells
   └──────────────────┘   (JavaScript, then Python via WASM)
        │
        ▼
   ┌──────────────────────────────┐
   │   SLIDE RENDERER + RUNTIME    │
   └──────────────────────────────┘
        │
        ▼
   ┌──────────────────────────────┐
   │   INTERACTIVE SLIDE BUNDLE    │   present in class;
   │   reactive, self-contained    │   share as a URL
   └──────────────────────────────┘
```

The parser and the AST types are the load-bearing core. The renderer and the runtime depend on them, not on each other.

---

## 4. The Chalk language

Chalk is a markdown-family markup language: familiar to anyone who knows markdown or LaTeX, with a small set of math-teaching constructs and an escape hatch into code.

```chalk
# Limits and Continuity              ← section / title slide

## The intuition behind a limit      ← a new slide

We say $f(x) \to L$ as $x \to a$ when $f$ gets arbitrarily close to $L$.

:::definition Limit
A function $f$ has limit $L$ at $a$ if for every $\varepsilon > 0$
there exists $\delta > 0$ such that $0 < |x-a| < \delta$ implies
$|f(x) - L| < \varepsilon$.
:::

## Watching a parabola change

@slider a [0, 3] = 1

@plot f(x) = a*x^2

As you increase $a$, the parabola $f(x) = ax^2$ grows steeper.

## A first proof

:::proof
We show $\lim_{x\to 2}(3x+1) = 7$.
+step Choose $\delta = \varepsilon / 3$.
+step Then $0 < |x-2| < \delta$ gives $|3x+1-7| = 3|x-2| < 3\delta = \varepsilon$.
+step Therefore the limit holds. $\blacksquare$
:::
```

### Language constructs

| Construct | Meaning |
|---|---|
| `# Title` | A section / title slide |
| `## Heading` | A new slide |
| `$...$` / `$$...$$` | Inline / display math, rendered by KaTeX |
| `:::definition Name … :::` | A theorem-family block. Also `theorem`, `lemma`, `proof`, `example`, `remark`. Styled distinctly on the slide. |
| `+step <line>` | A revealable step inside a block. As the professor advances the slide, steps appear one at a time — pacing the lecture. |
| `@slider name [min,max] = default` | Declares a reactive control. |
| `@plot expr` | Declares a plot. Any slider variable appearing in the expression drives the curve live. |
| `:::geo … :::` | A geometry block, rendered as a GeoGebra embed. |
| A fenced code cell (`js` or `py`) | Its result is woven into the slide; reactive to any slider it reads. |

The language stays readable because the common case (prose, math, structure) is markup, and the powerful case (computation) is contained in cells.

---

## 5. The engine: TypeScript / Node, distributed via npm

The engine is built in TypeScript and distributed through npm.

```
npm install -g chalk

chalk build    lecture.chalk    # → interactive slide bundle
chalk watch    lecture.chalk    # live preview while authoring
chalk present  lecture.chalk    # open the slide deck
```

### Why TypeScript

The output runs in a browser, so the reactive runtime must be JavaScript. Building the engine in TypeScript keeps the parser, the compute orchestration, and the runtime in one language and one ecosystem — KaTeX, the plotting libraries, and the GeoGebra API are all JavaScript-native. Distribution is a single `npm install`. Compile speed at lecture-document scale is a non-issue.

A compiled-binary engine (the route a Rust implementation would take) would be fast and feel "serious," but it would split the codebase from the runtime, which must be JavaScript regardless. If the parser ever becomes a measured bottleneck, porting only that hot path to WebAssembly is a contained, optional future move.

---

## 6. The compute layer

The compute engine executes embedded code cells and weaves their results into the slides. It is built in two stages.

**JavaScript cells first.** They run natively in the reactive runtime with no server. A cell re-runs automatically when an input it depends on changes — the Observable reactive model.

**Python cells via Pyodide.** Pyodide is CPython compiled to WebAssembly, so `numpy`, `sympy`, and `matplotlib` run *inside the browser*. This is the decisive capability: a Python-powered interactive slider needs **no server at all**. Existing tools force a bad trade on interactivity — none in PowerPoint and Beamer; a running R/Python server in Quarto's Shiny model; JavaScript fluency in Observable. Running Python client-side via WebAssembly removes that trade. The educator audience gets the Python they already know, and the deck remains a plain web bundle that can be hosted anywhere or opened offline.

Pyodide loads lazily — only when a `.chalk` file actually contains a Python cell — so JavaScript-only decks stay light.

---

## 7. The reactive runtime

The runtime ships inside the compiled slide bundle and is what makes a Chalk deck feel alive. With slides as the only output, it is the heart of the product.

- A `@slider` is a reactive variable. Dragging it re-runs the cells that read it and re-renders the equations and plots that depend on it — in real time, during the lecture.
- It owns slide navigation, step-reveal on advance, plot interactivity, and GeoGebra embedding.
- It borrows the proven dependency-graph model from Observable rather than inventing reactivity from scratch.

Where Manim pre-renders animation to a fixed video, Chalk emits a live deck the presenter can drive.

---

## 8. Output

One compile produces one artifact.

| Output | Form | Use |
|---|---|---|
| Interactive slide deck | Self-contained web bundle with the reactive runtime | Present in class; share as a URL; open offline |

Because the bundle is self-contained, sharing is just a link, and there is no account or server on either side.

---

## 9. Repository structure

```
chalk/
├── packages/
│   ├── ast/            # shared AST node types — the contract
│   ├── parser/         # .chalk text → AST  (pure, no I/O, fully tested)
│   ├── compute/        # orchestrates JS + Pyodide code cells
│   ├── runtime/        # reactive runtime shipped in the slide bundle
│   ├── render-slides/  # AST → interactive slide bundle
│   └── cli/            # the `chalk` command (build / watch / present)
└── examples/           # real lectures across topics
```

Boundary rules: the parser and AST packages never import the renderer or runtime. The AST is designed up front to carry a full lecture — a stepped block stores its steps as structured children, a slider stores its full range, a plot records which slider variables it references — so adding a future renderer (notes, PDF) never forces a parser change.

---

## 10. Roadmap

### Phase 0 — Syntax spec
Write a complete, realistic `.chalk` calculus lecture (limits and continuity) that exercises every language construct, plus a one-page syntax reference covering how a code cell is written and how it binds to a slider. Freeze it before building. This is the cheapest way to surface design problems, and every later phase implements it.

### Phase 1 — Parser + AST
`packages/ast` and `packages/parser`. Pure string → tree, designed to carry a full lecture. Unit-tested against the Phase 0 file.

### Phase 2 — Slide renderer (static)
`render-slides` and a minimal `chalk build` that emits a presentable slide bundle: fixed-canvas slides, keyboard navigation, step-reveal on advance, KaTeX math, styled theorem blocks. Sliders, plots, and geometry render as static placeholders for now. This proves the AST contract and already gives a usable deck.

### Phase 3 — Reactive runtime
`runtime`. Sliders become reactive variables; plots and equations that depend on them update live. Geometry blocks become real GeoGebra embeds.

### Phase 4 — Compute layer (JavaScript)
`compute` runs JS cells. Cell results are woven into slides and re-run reactively when their inputs change — with no server.

### Phase 5 — Python cells via Pyodide
Client-side `numpy` / `sympy` / `matplotlib`. The headline capability: server-free, Python-driven interactivity inside a slide.

### Phase 6 — First real user test
Put `chalk watch` in front of one real professor. Watch silently. Confirm or revise the syntax before it hardens.

### Phase 7 — Sharing + hosted playground
Shareable hosting of the slide bundle, and a hosted browser playground so a professor can try Chalk before installing the engine.

### Phase 8 — Adoption-readiness
LaTeX/Beamer importer, an example gallery across topics (calculus, linear algebra, discrete math), documentation, and a clear writeup aimed at r/math, r/LaTeX, Hacker News, and Mathstodon.

---

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| A new language is friction over known LaTeX/markdown | High | Make Chalk a near-superset of markdown plus LaTeX math, so it is familiar on first sight. Validate with a real user in Phase 6 before the syntax hardens. |
| The install step deters the least-technical professors | Medium | Accepted trade-off; the target audience installs tools willingly. A hosted browser playground provides zero-install first contact. |
| Pyodide bundle size / load time | Medium | Load Pyodide lazily, only when a Python cell exists; cache aggressively; JS-only decks stay light. |
| Two compute languages double the surface area | Medium | Ship JavaScript first and fully; treat Python as additive, not a parallel obligation. |
| Reactive runtime complexity | Medium | Adopt Observable's dependency-graph model rather than inventing one. |
| Slides-only means students get a sparse deck rather than full notes | Medium | A shared *interactive* deck (live sliders, stepped proofs) is already more useful than a static PDF. Notes remain a clean future renderer because the AST carries full content. |
| Discovery: students only see Chalk if the professor shares it | Medium | The professor is the channel by design; the tool must be easy and useful enough that sharing is the default. |

---

## 12. Success criteria

In order of increasing ambition. None is a revenue or user-count target — the measure is whether Chalk genuinely helps someone teach or learn math better.

1. One `.chalk` file compiles to an interactive slide deck with live math, a working reactive slider, a stepped proof, and a geometry embed.
2. A real professor writes a real lecture in Chalk and presents from it without help.
3. A professor shares the deck with a class and students open it.
4. Someone you have never met writes a lecture in Chalk and says it was better than what they used before.
5. Contributions arrive — a theme, a theorem style, an importer — from people who found it useful.

---

## 13. Immediate next action

Start Phase 0: draft the complete sample `.chalk` calculus lecture and the one-page syntax reference, including code-cell and slider-binding syntax. It is a few hours of work, it is the cheapest way to surface design problems, and every later phase implements it. Build nothing else until that file reads naturally to write and to present from.
# Theia

**Live, interactive math slides from plain text.**

Theia is a language and engine for teaching mathematics. Write a lecture in a `.theia` file — markdown-like prose, LaTeX math, reactive sliders, 2D/3D scenes, and code cells — and compile it into a self-contained, interactive slide deck that runs entirely in the browser. Drag a slider during class and the curve, equation, or plot updates in real time. Share the same deck as a link or offline HTML file.

Free and open source (MIT).

---

## Why Theia?

Presentation tools often mangle equations or freeze them as images. Beamer typesets beautifully but stays static. Notebooks are reactive but awkward to present from. Theia sits in the lineage of LaTeX and Manim: you install a compiler, write source in plain text, and get a polished artifact — except the output is a **live, reactive** deck, not a PDF or a pre-rendered video.

| | Beamer / PowerPoint | Jupyter / Observable | **Theia** |
|---|---|---|---|
| Math quality | Excellent / poor | Good | KaTeX (LaTeX-quality) |
| Live interactivity | None | Yes (with setup) | Yes, client-side |
| Authoring | LaTeX / WYSIWYG | Code cells | Markup + optional cells |
| Present & share | PDF / file | Server or export | One HTML bundle |

---

## Quick example

```theia
# Continuity

@slider a [0.2, 3] = 1.4

:::scene
@axes ax x:[-3, 3] y:[-1, 9] grid
@plot f on ax : a*x^2
:::

Drag **a** — the curve responds live.
```

Compile to a single offline-capable HTML file:

```bash
theia build lecture.theia    # → lecture.html
```

Open `lecture.html` in any modern browser. Arrow keys advance slides; sliders, plots, and code cells run with no server.

More examples live in [`examples/`](examples/) — limits, linear algebra, graphing, 3D surfaces, equation morphing, and media.

---

## Try it

### Playground (zero install)

Run the web app locally — a landing page, in-browser editor, example gallery, and docs that compile `.theia` client-side:

```bash
git clone https://github.com/AbdessamadAe/Theia.git
cd Theia
npm install
npm run dev -w theia
```

Open the URL Vite prints (default `http://localhost:5173`). Edit, preview, present fullscreen, and share — no account required.

When deployed (see [`RELEASE.md`](RELEASE.md)), the same app is available as a static site on Vercel.

### CLI (engine)

The engine ships as an npm package. Because the name `theia` is taken on npm (Eclipse Theia IDE), install **`theialang`**, which provides the `theia` command:

```bash
npm install -g theialang
```

```bash
theia build   lecture.theia [--out lecture.html]   # compile to a slide bundle
theia watch   lecture.theia [--port 4321]          # dev server with live reload
theia present lecture.theia [--out lecture.html]   # build, then open the deck
```

The published CLI bundles KaTeX, the reactive runtime, and all assets — **zero runtime dependencies**, one self-contained `.html` output.

> **Note:** If the package is not yet on npm, build the CLI from source — see [Contributing](CONTRIBUTING.md).

---

## Features

- **LaTeX-quality math** — `$…$` and `$$…$$` rendered by KaTeX
- **Reactive sliders** — bind variables; curves, scenes, and inline math update as you drag
- **Stepped derivations** — `+step` reveal and `:::derive` equation morphing on advance
- **Theorem blocks** — `:::definition`, `:::theorem`, `:::proof`, and related environments
- **2D scenes** — axes, plots, points, areas, tangents, vector fields, graphs, tables, bar charts
- **3D surfaces** — orbitable `z = f(x, y)` with lazy-loaded Three.js
- **Code cells** — JavaScript natively; Python via Pyodide (`numpy`, `sympy`, `matplotlib`) with no server
- **GeoGebra embeds** — geometry blocks delegate to GeoGebra
- **One source, many outputs** — present fullscreen, share by URL, or export offline HTML

---

## The language at a glance

| Construct | Meaning |
|---|---|
| `# Title` | Title slide |
| `## Heading` | New content slide |
| `$…$` / `$$…$$` | Inline / display math (KaTeX) |
| `:::definition Name … :::` | Theorem-family block (`theorem`, `lemma`, `proof`, `example`, …) |
| `+step …` | Revealable step inside a block |
| `@slider name [min, max] = default` | Reactive control |
| `:::scene … :::` | 2D canvas scene (`@axes`, `@plot`, `@point`, …) |
| `:::scene3d … :::` | 3D scene |
| ` ```js` / ` ```py` | Code cell woven into the slide |

Full language reference: run the web app and open **Docs**, or read [`design.md`](design.md) for the architecture and language rationale.

---

## How it works

```
.theia source  →  parser  →  AST  →  compute  →  render-slides + runtime  →  interactive HTML deck
```

The **AST** is the single source of truth. The parser is pure (string → tree, no I/O). The **compute** layer runs JS and Python cells in dependency order. The **runtime** ships inside every deck and handles reactivity, navigation, step-reveal, plots, and 3D. See [`design.md`](design.md) for the full architecture.

### Repository layout

```
packages/
  ast/            shared AST node types
  parser/         .theia text → AST
  compute/        JS + Pyodide code-cell engine
  runtime/        client-side reactive runtime
  render-slides/  AST → self-contained HTML deck
  cli/            the `theia` command (published as theialang)
apps/
  theia/          web app — landing, playground, gallery, docs
examples/         sample lectures
```

---

## Development

Requires **Node.js 20+**.

```bash
npm install          # install workspace dependencies
npm run build        # build all packages + CLI + web app
npm test             # unit + jsdom test suite (vitest)
npm run test:e2e     # browser smoke tests (Playwright)
npm run dev -w theia # start the web app in dev mode
```

See [**Contributing**](CONTRIBUTING.md) for the full guide — where to make changes, testing expectations, and pull request workflow.

---

## License

MIT © [Abdessamad Ait Elmouden](LICENSE)

---

## Links

- [Contributing](CONTRIBUTING.md)
- [Architecture & design](design.md)
- [Release checklist](RELEASE.md)
- [CLI package README](packages/cli/README.md)
- [GitHub Issues](https://github.com/AbdessamadAe/Theia/issues)

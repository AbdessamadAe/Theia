# chalkdeck

Compile **Chalk** — a math-teaching markup language — into a single
self-contained, interactive HTML slide deck. Drag a slider and the curve moves;
math re-renders live; 2D/3D scenes, code cells, and equation morphing all run in
the browser with no server.

The published package is standalone: the KaTeX stylesheet (with embedded fonts),
the KaTeX engine, and the Chalk reactive runtime are all baked in, so a built
deck is one offline-capable `.html` file and the CLI itself has **zero runtime
dependencies**.

## Install

```bash
npm install -g chalkdeck
```

This installs the `chalk` command (and a `chalkdeck` alias).

## Usage

```bash
chalk build   lecture.chalk [--out lecture.html]   # compile to a slide bundle
chalk watch   lecture.chalk [--port 4321]          # serve with live reload
chalk present lecture.chalk [--out lecture.html]   # build, then open the deck
```

A minimal lecture:

```chalk
# Continuity

@slider a [0.2, 3] = 1.4

:::scene
@axes ax x:[-3, 3] y:[-1, 9] grid
@plot f on ax : a*x^2
:::

Drag **a** — the curve responds.
```

```bash
chalk build lecture.chalk   # → lecture.html (open it in any browser)
```

## License

MIT © Abdessamad Ait Elmouden

# theialang

Compile **Theia** — a math-teaching markup language — into a single
self-contained, interactive HTML slide deck. Drag a slider and the curve moves;
math re-renders live; 2D/3D scenes, code cells, and equation morphing all run in
the browser with no server.

The published package is standalone: the KaTeX stylesheet (with embedded fonts),
the KaTeX engine, and the Theia reactive runtime are all baked in, so a built
deck is one offline-capable `.html` file and the CLI itself has **zero runtime
dependencies**.

> The npm name `theia` is taken (the Eclipse Theia IDE), so this package is
> published as **`theialang`**. It installs the `theia` command.

## Install

```bash
npm install -g theialang
```

## Usage

```bash
theia build   lecture.theia [--out lecture.html]   # compile to a slide bundle
theia watch   lecture.theia [--port 4321]          # serve with live reload
theia present lecture.theia [--out lecture.html]   # build, then open the deck
```

A minimal lecture:

```theia
# Continuity

@slider a [0.2, 3] = 1.4

:::scene
@axes ax x:[-3, 3] y:[-1, 9] grid
@plot f on ax : a*x^2
:::

Drag **a** — the curve responds.
```

```bash
theia build lecture.theia   # → lecture.html (open it in any browser)
```

## License

MIT © Abdessamad Ait Elmouden

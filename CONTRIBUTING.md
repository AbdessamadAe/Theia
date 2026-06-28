# Contributing to Theia

Thank you for your interest in Theia. This project aims to give educators and students genuinely useful, free tools for live mathematical presentation — and contributions from people who use it are how it gets there.

Issues, ideas, documentation fixes, example lectures, and pull requests are all welcome.

---

## Before you start

1. **Search [existing issues](https://github.com/AbdessamadAe/Theia/issues)** — someone may already be working on the same thing.
2. **For bugs**, include a minimal `.theia` snippet (or a link to one in `examples/`) that reproduces the problem, plus what you expected vs. what happened.
3. **For features**, open an issue first if the change is large — it helps align on scope before you invest time.

Theia is intentionally focused: interactive math slide decks. Features outside that scope (general document typesetting, WYSIWYG editors, server-backed runtimes) are unlikely to be accepted unless they clearly serve the core product.

---

## Prerequisites

- **Node.js 20+** and npm
- A modern browser (Chromium recommended for e2e tests)
- Git

No other runtime dependencies are required for day-to-day development.

---

## Getting the repo running

```bash
git clone https://github.com/AbdessamadAe/Theia.git
cd Theia
npm install
```

### Common commands

| Command | What it does |
|---|---|
| `npm run dev -w theia` | Start the web app (playground + docs) with Vite |
| `npm run build` | Build all engine packages, the CLI bundle, and the web app |
| `npm test` | Run the vitest suite (unit + jsdom) |
| `npm run test:e2e` | Run Playwright browser smoke tests on built decks |
| `npm run typecheck` | Type-check CLI and web app packages |
| `npm run build:cli` | Build only the publishable `theialang` CLI |
| `npm run build:app` | Build only the web app |

Tests run against **TypeScript source** via vitest aliases — you do not need to rebuild packages before every test run, but CI always runs a full build.

### Try the CLI locally (without npm publish)

```bash
npm run build:cli
node packages/cli/dist/cli.js build examples/limits.theia
# → examples/limits.html — open in a browser
```

Or use watch mode while authoring:

```bash
node packages/cli/dist/cli.js watch examples/limits.theia
```

---

## Repository layout

Theia is an **npm workspaces monorepo**. Packages are wired through `@theia/*` scoped names; only `theialang` (in `packages/cli`) is published to npm.

| Path | Role |
|---|---|
| `packages/ast` | Shared AST node types — the contract between parser and renderers |
| `packages/parser` | Pure `.theia` string → AST parser (no I/O, no DOM) |
| `packages/compute` | Code-cell orchestration (JS + Pyodide Python) |
| `packages/runtime` | Client-side reactive runtime shipped inside every deck |
| `packages/render-slides` | AST → self-contained HTML slide bundle |
| `packages/cli` | The `theia` command (published as **`theialang`**) |
| `apps/theia` | Landing page, playground, gallery, and in-app docs |
| `examples/` | Real `.theia` lectures used in the gallery and tests |
| `scripts/` | Browser tests and playground utilities |

### Boundary rules

These keep the architecture maintainable — please respect them in new code:

- **`packages/ast` and `packages/parser` must not import** the renderer, runtime, or CLI.
- The **AST is the single source of truth** — renderers read the tree; they do not re-parse source text.
- **Parser changes** that affect the language should include tests and, when user-visible, updates to the in-app docs (`apps/theia/src/docs/`).
- **Runtime changes** that affect deck behavior should include jsdom or browser tests under `packages/runtime/test/` or `packages/render-slides/test/`.

For the full design rationale, see [`design.md`](design.md).

---

## Where to make changes

| You want to… | Start here |
|---|---|
| Add or change language syntax | `packages/parser`, `packages/ast`, then `packages/render-slides` / `packages/runtime` |
| Fix slide rendering or CSS | `packages/render-slides/src/` |
| Fix live reactivity, plots, morphing, 3D | `packages/runtime/src/` |
| Fix JS/Python cell execution | `packages/compute/src/` |
| Change CLI commands or bundling | `packages/cli/src/` |
| Change the playground, docs, or landing page | `apps/theia/src/` |
| Add a gallery example | `examples/` + register in the app prebuild manifest |

When you add a documented language feature, add a **compile-checked example** in the docs (`apps/theia/src/docs/examples.ts`) so CI verifies the snippet still builds.

---

## Testing

### Unit and jsdom tests

```bash
npm test
```

Vitest discovers tests in `packages/*/test/**/*.test.ts` and `apps/*/test/**/*.test.ts`. Prefer tests that exercise real compile → render → runtime paths over mocks.

### Browser e2e

```bash
npm run build
npm run test:e2e
```

This uses Playwright to open built HTML decks and verify sliders, morphing, and 3D scenes in a real Chromium instance.

### What CI runs

On every push and pull request to `main`, GitHub Actions:

1. `npm ci`
2. `npm run build` (engine + CLI + web app)
3. `npm run typecheck`
4. `npm test`
5. `npm pack -w theialang --dry-run` (verify the publishable manifest)

Your PR should pass these checks locally before opening.

---

## Pull request guidelines

1. **One logical change per PR** when possible — easier to review and bisect.
2. **Keep diffs focused** — avoid unrelated refactors or formatting sweeps.
3. **Match existing style** — TypeScript strict mode, `NodeNext` modules, minimal comments (explain *why*, not *what*).
4. **Add or update tests** for behavior you change or fix.
5. **Update docs** if the change is user-visible (in-app docs, README, or examples).

Describe in the PR:

- What problem this solves
- How you tested it
- Any breaking changes to the `.theia` language or CLI

---

## Commit messages

Use clear, imperative subject lines. The recent history follows a descriptive style:

```
Fix equation-morph glitches: compensate for the deck fit-scale

Rebrand 3/4: internal identifiers + complete the Chalk → Theia purge
```

Multi-step features are sometimes split across numbered commits (`Rebrand 1/4`, …). That is fine for large changes; for most PRs a single commit or a small logical sequence is enough.

---

## Releases

Only **`theialang`** is published to npm. Engine packages and the web app are private and bundled.

Maintainers use [Changesets](https://github.com/changesets/changesets) for versioning. See [`RELEASE.md`](RELEASE.md) for the full npm and Vercel release checklist.

Contributors do not need to cut releases — opening a PR is enough.

---

## Code of conduct

Be respectful and constructive. Theia exists to help people teach and learn mathematics; keep discussions focused on that goal. Harassment, bad-faith argument, and dismissive behavior are not welcome.

---

## Questions?

- **Bug or feature request:** [GitHub Issues](https://github.com/AbdessamadAe/Theia/issues)
- **Architecture and language design:** [`design.md`](design.md)
- **Using Theia (not hacking on it):** run the web app and open **Docs**, or read [`README.md`](README.md)

Thank you for helping make live math slides better.

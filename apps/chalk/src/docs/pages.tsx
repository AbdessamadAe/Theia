import * as React from "react";
import { Button } from "@/components/ui/button";
import { DASHBOARD_PATH, docsPath, navigate } from "@/lib/router";
import { GITHUB_URL } from "@/lib/site";
import { Callout, Code, DocCode, Example, H2, H3, Lead, P, Ul } from "@/docs/primitives";

export interface DocPage {
  id: string;
  title: string;
  /** Short keywords for the client-side search filter. */
  keywords: string;
  Body: React.FC;
}
export interface DocGroup {
  label: string;
  pages: DocPage[];
}

const Link = ({ to, children }: { to: string; children: React.ReactNode }): React.ReactElement => (
  <button className="text-live font-medium hover:underline" onClick={() => navigate(to)}>{children}</button>
);

// ───────────────────────────── Getting started ────────────────────────────
const Intro: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">What is Chalk?</h1>
    <Lead>Chalk is a small language and engine for live, interactive mathematics slides. You write a plain-text <Code>.chalk</Code> file; Chalk compiles it to a reactive deck that runs entirely in the browser.</Lead>
    <H2>The problem it solves</H2>
    <P>Presentation tools mangle equations or reduce them to images. Beamer typesets beautifully but is static and slow to iterate. Neither lets a class <em>see</em> what happens as a parameter changes — which is often the whole point. Chalk is math-native like Beamer, live like a notebook, and authored in plain text you own.</P>
    <H2>Who it's for</H2>
    <P>Teachers and students who present or study mathematics and want the ideas to move — drag a slider and the curve responds, morph one equation into the next, explore a surface. No server, no account, no install required to start.</P>
    <H2>When to use it — and when not</H2>
    <Ul>
      <li><strong>Great for:</strong> lectures and explainers where interactivity or precise math matters; reusable, version-controlled teaching material.</li>
      <li><strong>Not the right tool for:</strong> heavily designed marketing decks, or documents that must round-trip with PowerPoint/Keynote.</li>
    </Ul>
    <div className="mt-6 flex gap-3">
      <Button variant="live" size="sm" onClick={() => navigate(DASHBOARD_PATH)}>Open the Playground</Button>
      <Button variant="outline" size="sm" onClick={() => navigate(docsPath("quickstart"))}>Your first lecture →</Button>
    </div>
  </>
);

const Quickstart: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">Your first lecture</h1>
    <Lead>From nothing to a presented, reactive slide in about ten minutes. Open the <Link to={DASHBOARD_PATH}>playground</Link> and follow along — each step compiles as-is.</Lead>

    <H2>1. A title</H2>
    <P>A single <Code>#</Code> heading starts a <em>title slide</em>; the prose under it is the subtitle.</P>
    <Example id="qs-title" />

    <H2>2. A content slide</H2>
    <P>Each <Code>##</Code> heading starts a new content slide. Write ordinary prose underneath.</P>
    <Example id="qs-slide" />

    <H2>3. Add some math</H2>
    <P>Inline math goes in <Code>$…$</Code>; display math in <Code>$$…$$</Code>. It's real KaTeX.</P>
    <Example id="qs-math" />

    <H2>4. Make it react</H2>
    <P>Declare a slider, then draw a curve that depends on it inside a <Code>:::scene</Code>. Drag the slider and the plot updates live.</P>
    <Example id="qs-reactive" />

    <H2>5. Present it</H2>
    <P>In the playground, press <strong>Present</strong> for fullscreen; arrow keys advance. To share, use <strong>Share</strong> (a link) or <strong>Download</strong> (a self-contained <Code>.html</Code>). That's a complete, reactive lecture.</P>
    <Callout>Everything you typed is the canonical source — there's no hidden state. The same file presents, shares, and exports.</Callout>
  </>
);

const Install: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">Installation</h1>
    <H2>The playground (zero install)</H2>
    <P>The fastest path: open the <Link to={DASHBOARD_PATH}>playground</Link> in any modern browser. It runs the full engine client-side — edit, preview, present, and share with no install and no account.</P>

    <H2>The engine (command line)</H2>
    <P>Chalk also ships a CLI that compiles a <Code>.chalk</Code> file to a self-contained HTML deck. It needs <strong>Node.js 20+</strong>.</P>
    <Callout tone="planned">A published npm package isn't available yet — the command below is how it will install. For now, build from the repository (see <Link to={docsPath("contributing")}>Contributing</Link>). This note will go once it's on npm.</Callout>
    <DocCode lang="bash" code={`# planned: install the CLI globally\nnpm install -g chalk\n\n# compile a lecture to a self-contained lecture.html\nchalk build lecture.chalk\n\n# live-reload dev server while you write\nchalk watch lecture.chalk\n\n# build, then open the deck\nchalk present lecture.chalk`} />
    <P>See the <Link to={docsPath("cli")}>CLI reference</Link> for every command and flag.</P>
  </>
);

// ───────────────────────────── Language ───────────────────────────────────
const Structure: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">Structure &amp; math</h1>
    <Lead>A <Code>.chalk</Code> file is markdown-like text. Headings split it into slides; everything else is content.</Lead>

    <H2>Slides</H2>
    <P><Code># Title</Code> begins a <strong>title slide</strong> (used once, up top). <Code>## Heading</Code> begins a <strong>content slide</strong>. A slide runs until the next heading.</P>
    <Example id="structure" live={false} />

    <H2>Prose</H2>
    <P>Within a slide you can use <Code>**bold**</Code>, <Code>*italic*</Code>, inline <Code>`code`</Code>, and <Code>- </Code> bullet lists.</P>

    <H2>Math</H2>
    <P>Inline math is <Code>$…$</Code>; display math is <Code>$$…$$</Code>. Bodies are passed verbatim to KaTeX, so LaTeX like <Code>{"\\frac{a}{b}"}</Code> works untouched.</P>
    <Example id="math" live={false} />
    <Callout>If KaTeX can't parse an expression it renders the error in place (in red) — the rest of the slide is unaffected, so you're never staring at a blank pane.</Callout>
  </>
);

const Theorems: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">Theorems &amp; derivations</h1>

    <H2>Theorem-family blocks</H2>
    <P>Six visually-distinct blocks: <Code>:::definition</Code>, <Code>:::theorem</Code>, <Code>:::lemma</Code>, <Code>:::proof</Code>, <Code>:::example</Code>, <Code>:::remark</Code>. Each takes an optional title on the opening line and is closed by <Code>:::</Code>.</P>
    <Example id="theorem" live={false} />

    <H2>Revealing steps</H2>
    <P>Inside a block, a <Code>+step</Code> line is revealed on advance — one stop at a time — so a proof unfolds as you present.</P>
    <Example id="proof-steps" live={false} />

    <H2>Equation morphing (<Code>:::derive</Code>)</H2>
    <P>A <Code>:::derive</Code> block holds a sequence of display-math states. The first is shown; each <Code>+to</Code> morphs the previous equation into the next on advance — matching terms slide into place.</P>
    <Example id="derive" />

    <H3>Emphasis</H3>
    <P>Add <Code>+emphasize &lt;effect&gt; &lt;term&gt;</Code> to call attention to part of a state. Effects: <Code>highlight</Code>, <Code>pulse</Code>, <Code>circumscribe</Code>. (You can also wrap a term with <Code>{"\\mark{…}"}</Code> in the tex to tag it.)</P>
    <Example id="derive-emphasis" live={false} />
  </>
);

const Reactivity: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">Reactivity &amp; sliders</h1>
    <Lead>A slider is the heart of the live story: declare one, and anything that references it updates as you drag.</Lead>

    <H2><Code>@slider</Code></H2>
    <P>Syntax: <Code>@slider name [min, max] = default</Code>, with an optional <Code>step</Code>.</P>
    <Example id="slider" live={false} />
    <P>Form: <Code>@slider &lt;name&gt; [&lt;min&gt;, &lt;max&gt;] = &lt;default&gt; [step &lt;s&gt;]</Code>. The name becomes a reactive variable.</P>

    <H2>What reacts</H2>
    <Ul>
      <li>Display/inline math whose LaTeX references the slider value.</li>
      <li>Scene expressions — a <Code>@plot</Code>, <Code>@point</Code>, <Code>@area</Code>, etc. whose formula uses the variable.</li>
      <li>Code cells that read it via <Code>chalk.slider("name")</Code>.</li>
    </Ul>
    <Example id="guide-slider" />
  </>
);

const Scenes: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">2D scenes</h1>
    <Lead>A <Code>:::scene</Code> is a canvas with a coordinate system and named objects placed on it. Objects whose formulas reference a slider redraw live.</Lead>

    <H2>Coordinate systems</H2>
    <P><Code>@axes &lt;name&gt; x:[lo, hi] y:[lo, hi]</Code> — add <Code>grid</Code>, <Code>xlabel:"…"</Code>, <Code>ylabel:"…"</Code>. A 1-D <Code>@numberline &lt;name&gt; range:[lo, hi]</Code> is also available. Other objects sit on one via <Code>on &lt;name&gt;</Code>.</P>
    <Example id="scene-numberline" live={false} />

    <H2>The object library</H2>
    <Ul>
      <li><Code>@plot f on ax : &lt;expr&gt;</Code> — a function curve.</li>
      <li><Code>@point P on ax at (x, y)</Code> — a dot at a coordinate (the coords can be expressions).</li>
      <li><Code>@label L on ax at (x, y) "text"</Code> — a text label.</li>
      <li><Code>@area A on ax under f from &lt;a&gt; to &lt;b&gt; rects &lt;n&gt;</Code> — Riemann rectangles under a curve.</li>
      <li><Code>@tangent T on ax to f at P</Code> — the tangent to curve <Code>f</Code> at point <Code>P</Code>.</li>
    </Ul>
    <Example id="scene-tangent" />

    <H3>Riemann area</H3>
    <Example id="scene-area" />

    <H2>Positioning</H2>
    <P>Objects are placed with literal or expression coordinates in <Code>at (x, y)</Code>, on the system named by <Code>on</Code>. In the playground, an object whose coordinates are plain numbers can be <strong>dragged</strong> to edit them; objects whose position is computed from a slider move when you drag the slider instead.</P>
    <Callout tone="planned">Relative placement helpers (<Code>next_to</Code>, <Code>shift</Code>), tables/matrices, bar charts, graphs/networks, and 2-D vector fields are <strong>not implemented</strong>. Don't use them yet.</Callout>

    <H2>Animation verbs</H2>
    <P>Inside a scene, <Code>+animate &lt;verb&gt; &lt;target&gt;</Code> lines each occupy one advance stop and play in order. Creation verbs: <Code>create</Code>, <Code>write</Code>, <Code>grow</Code>, <Code>fade-in</Code>, <Code>draw-border-then-fill</Code>. Also <Code>indicate</Code> (a brief pulse). Objects without a creation verb are visible from the start.</P>
    <Example id="scene-animate" />
  </>
);

const ThreeD: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">3D scenes</h1>
    <Lead>A <Code>:::scene3d</Code> renders with three.js (loaded lazily, only when a deck uses 3D). Drag to orbit, scroll to zoom, double-click to reset.</Lead>

    <H2>Axes &amp; camera</H2>
    <P><Code>@axes3d &lt;name&gt; x:[…] y:[…] z:[…]</Code> sets the box. <Code>@camera cam phi:&lt;deg&gt; theta:&lt;deg&gt; distance:&lt;d&gt;</Code> frames it; add <Code>autorotate</Code> for a slow spin (suppressed under reduced motion).</P>

    <H2>Surfaces</H2>
    <P><Code>@surface s on ax : &lt;expr in x,y&gt;</Code> — add <Code>colorscale:height</Code>. <Code>@psurface</Code> draws a parametric surface.</P>
    <Example id="scene3d-surface" live={false} />

    <H2>Solids &amp; primitives</H2>
    <P>Placed with <Code>at (x, y, z)</Code>: <Code>@sphere</Code> (<Code>r:</Code>), <Code>@cube</Code>/<Code>@box</Code> (<Code>size:</Code>), <Code>@cone</Code>, <Code>@cylinder</Code>, <Code>@torus</Code>, and the regular polyhedra <Code>@tetrahedron</Code>, <Code>@octahedron</Code>, <Code>@dodecahedron</Code>, <Code>@icosahedron</Code>. A point marker is <Code>@dot3d</Code>.</P>
    <Example id="scene3d-solids" live={false} />

    <H2>Vectors, lines &amp; curves</H2>
    <P><Code>@vector3d</Code>/<Code>@arrow3d</Code>/<Code>@line3d v on ax from (x,y,z) to (x,y,z)</Code>, and <Code>@curve3d</Code> for parametric curves. <Code>@label</Code> pins text in the scene.</P>
    <Example id="scene3d-vector" live={false} />
    <P>Camera animation verbs: <Code>+animate rotate cam</Code> / <Code>spin cam</Code> / <Code>rotate-camera cam</Code>.</P>
  </>
);

const CodeCells: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">Code cells</h1>
    <Lead>Fenced <Code>```js</Code> and <Code>```py</Code> cells run live in the browser and can read sliders and emit math or text. Python runs via Pyodide (loaded lazily, only if a deck has a py cell).</Lead>

    <H2>The <Code>chalk</Code> API</H2>
    <P>Each cell receives a <Code>chalk</Code> object:</P>
    <Ul>
      <li><Code>chalk.slider(name)</Code> → the current value of a slider (number).</li>
      <li><Code>chalk.sliders</Code> → all slider values; <Code>chalk.imports</Code> → values exposed by other cells.</li>
      <li><Code>chalk.expose(name, value)</Code> → publish a value for other cells to import.</li>
      <li><Code>chalk.imported(name)</Code> → read another cell's exposed value (also <Code>chalk.imports.name</Code>).</li>
      <li><Code>chalk.tex(latex)</Code> → render a LaTeX string as the cell's output.</li>
      <li><Code>chalk.text(value)</Code> → render plain text output.</li>
      <li><Code>chalk.canvas(w, h)</Code> → a drawing canvas (JS cells).</li>
    </Ul>

    <H2>JavaScript</H2>
    <P>JS cells re-run on every frame, so reading a slider and emitting <Code>tex</Code> updates live as you drag.</P>
    <Example id="code-js" live={false} />

    <H2>Python (Pyodide)</H2>
    <P>Use <Code>sympy</Code> for symbolic math and <Code>matplotlib</Code> for plots — a produced figure is shown automatically. Py cells re-run on a short debounce after a slider changes (Python eval is heavier than JS).</P>
    <Example id="code-py" live={false} />
    <Callout>The first py cell triggers a one-time Pyodide download (tens of MB) — expect a brief "loading" state. JS cells have no such cost.</Callout>
  </>
);

const Media: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">Media &amp; geometry</h1>

    <H2>Images</H2>
    <P><Code>@image &lt;name&gt; of "&lt;url-or-path&gt;" width:&lt;n&gt; alt:"…"</Code> — standalone, or inside a scene with <Code>on ax at (x, y)</Code> to position it. Alt text is required for accessibility.</P>
    <Example id="media-image" live={false} />
    <P>Markdown image syntax works in prose too:</P>
    <Example id="media-markdown" live={false} />

    <H2>Video</H2>
    <P><Code>@video &lt;name&gt; of "&lt;url&gt;" width:&lt;n&gt; poster:"…"</Code> with flags <Code>loop</Code>, <Code>muted</Code>, <Code>autoplay</Code> (muted only), <Code>controls</Code>. Inside a scene, <Code>+animate play clip from 0:03 to 0:09</Code> plays a segment on advance and pauses it on the next; leaving the slide stops it.</P>
    <Example id="media-video" live={false} />

    <H3>Sourcing</H3>
    <Ul>
      <li><strong>Remote https URL</strong> — used directly (needs a network connection).</li>
      <li><strong>Local path (CLI build)</strong> — embedded into the output: small files as data URIs, larger ones copied alongside, so the deck stays offline-capable.</li>
      <li><strong>Pasted in the playground</strong> — small images inline into the source (and so survive a share link); large images and all video must use a remote URL.</li>
    </Ul>

    <H2>GeoGebra (<Code>:::geo</Code>)</H2>
    <P>A <Code>:::geo</Code> block embeds a live GeoGebra applet; its commands ride along in the block. The applet loads from geogebra.org (needs a network connection).</P>
    <Example id="geo" live={false} />
  </>
);

// ───────────────────────────── Guides ─────────────────────────────────────
const Guides: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">Guides</h1>
    <Lead>Short, task-oriented recipes. Each opens in the playground so you can run it.</Lead>

    <H2>Make an equation come alive with a slider</H2>
    <P>Bind a coefficient to a slider and plot a curve that depends on it.</P>
    <Example id="guide-slider" />

    <H2>Animate a derivation</H2>
    <P>Use <Code>:::derive</Code> with <Code>+to</Code> to morph one equation into the next, advancing through the algebra.</P>
    <Example id="derive" />

    <H2>Plot and explore a function</H2>
    <P>Combine a curve, a point, a tangent, and a Riemann area in one scene.</P>
    <Example id="scene-tangent" />

    <H2>Use Python in a slide</H2>
    <P>Differentiate symbolically with sympy and render the result. Runs in the browser via Pyodide.</P>
    <Example id="code-py" live={false} />

    <H2>Present in class &amp; share with students</H2>
    <P>In the playground: <strong>Present</strong> for distraction-free fullscreen (arrow keys to advance); <strong>Share</strong> copies a link that carries the whole deck in its URL (ephemeral, one file); <strong>Download</strong> saves a standalone <Code>.html</Code> you can host or open offline. For durable, named work, save it as a project and <strong>Export</strong> it.</P>
    <Example id="guide-present" live={false} />
  </>
);

// ───────────────────────────── Reference ──────────────────────────────────
const Cli: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">CLI reference</h1>
    <Lead>The <Code>chalk</Code> command compiles a <Code>.chalk</Code> file into a self-contained HTML deck. Requires Node.js 20+.</Lead>

    <H2>Commands</H2>
    <DocCode lang="bash" code={`chalk build   <file.chalk> [--out <file.html>]   # compile to a slide bundle\nchalk watch   <file.chalk> [--port <n>]          # serve with live reload\nchalk present <file.chalk> [--out <file.html>]   # build, then open the deck`} />

    <H3>Options</H3>
    <Ul>
      <li><Code>--out &lt;path&gt;</Code> — output HTML path (default: alongside the source, <Code>lecture.chalk → lecture.html</Code>).</li>
      <li><Code>--port &lt;n&gt;</Code> — dev-server port for <Code>watch</Code> (default: 4321).</li>
      <li><Code>-h</Code>, <Code>--help</Code> — show usage.</li>
      <li><Code>-v</Code>, <Code>--version</Code> — show the version.</li>
    </Ul>

    <H2>Build output</H2>
    <P><Code>build</Code> writes one self-contained <Code>.html</Code> — KaTeX, the runtime, and fonts are all inlined, so it opens offline with no dependencies. Local media is embedded (small files inline; larger ones copied into <Code>&lt;out&gt;.assets/</Code> and referenced relatively). Missing <Code>alt</Code> text and unresolved local media are reported as warnings.</P>
    <DocCode lang="bash" code={`$ chalk build lecture.chalk\n✓ lecture.chalk → lecture.html  (8 slides, 712.0 KB)`} />
  </>
);

const Faq: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">FAQ &amp; troubleshooting</h1>

    <H2>My content overflows the slide</H2>
    <P>Slides are a fixed canvas scaled to fit, so an overfull slide shrinks rather than clipping. Split dense material across more <Code>##</Code> slides, or use <Code>+step</Code> / a <Code>:::derive</Code> to reveal it progressively instead of all at once.</P>

    <H2>Python is slow to load</H2>
    <P>The first <Code>```py</Code> cell downloads Pyodide (the Python runtime) — tens of megabytes, fetched once and cached. Decks with no py cell never pay this. If you only need arithmetic that reacts to a slider, a <Code>```js</Code> cell is instant.</P>

    <H2>My shared link's media won't load</H2>
    <P>A share link carries the deck text in the URL. Small images can be inlined and travel with it; large images and <strong>all video must be a remote https URL</strong> (the playground warns when an asset is too large to embed). For media that isn't online, use <strong>Download</strong> or <strong>Export</strong> instead of a link.</P>

    <H2>Does it work offline?</H2>
    <P>A downloaded deck is fully self-contained and opens offline — except assets you referenced by remote URL (and GeoGebra / Pyodide, which fetch from the network on first use).</P>

    <H2>Is my data stored anywhere?</H2>
    <P>It's local-first: projects live in your browser (IndexedDB) on this device. There's no backend and no account — nothing is uploaded. Use <strong>Export</strong> for backup or to move work to another device.</P>

    <H2>An equation shows a red error</H2>
    <P>That's KaTeX reporting a parse error in place. Check for an unbalanced brace or an unsupported command; the rest of the slide keeps working.</P>
  </>
);

const Contributing: React.FC = () => (
  <>
    <h1 className="text-3xl font-semibold tracking-tight">Contributing</h1>
    <Lead>Chalk is free and open source. Issues, ideas, and pull requests are welcome.</Lead>

    <H2>Repository layout</H2>
    <P>An npm-workspaces monorepo:</P>
    <Ul>
      <li><Code>packages/ast</Code> — the node types.</li>
      <li><Code>packages/parser</Code> — <Code>.chalk</Code> text → AST (pure, lenient).</li>
      <li><Code>packages/compute</Code> — the js/py code-cell engine.</li>
      <li><Code>packages/runtime</Code> — the client runtime (reactivity, scenes, 3D, morphing).</li>
      <li><Code>packages/render-slides</Code> — AST → a self-contained HTML deck.</li>
      <li><Code>packages/cli</Code> — the <Code>chalk</Code> command.</li>
      <li><Code>apps/chalk</Code> — this web app (landing, playground, gallery, docs).</li>
    </Ul>

    <H2>Run it locally</H2>
    <DocCode lang="bash" code={`npm install            # install workspace deps\nnpm run dev -w chalk   # start the web app (playground + docs)\nnpm test               # run the unit suites`} />

    <H2>Filing issues</H2>
    <P>Report bugs and request features on <a className="text-live font-medium hover:underline" href={`${GITHUB_URL}/issues`} target="_blank" rel="noreferrer">GitHub Issues</a>. A minimal <Code>.chalk</Code> snippet that reproduces the problem helps a lot.</P>
    <Callout tone="planned">The repository URL is a placeholder until the project is published — see the link in the footer.</Callout>
  </>
);

export const DOC_GROUPS: DocGroup[] = [
  {
    label: "Getting started",
    pages: [
      { id: "intro", title: "What is Chalk?", keywords: "introduction overview problem who", Body: Intro },
      { id: "quickstart", title: "Your first lecture", keywords: "quickstart tutorial start begin", Body: Quickstart },
      { id: "install", title: "Installation", keywords: "install cli npm node setup", Body: Install },
    ],
  },
  {
    label: "The Chalk language",
    pages: [
      { id: "structure", title: "Structure & math", keywords: "slide title heading prose markdown math katex latex", Body: Structure },
      { id: "theorems", title: "Theorems & derivations", keywords: "theorem definition lemma proof step derive morph emphasize", Body: Theorems },
      { id: "reactivity", title: "Reactivity & sliders", keywords: "slider reactive variable bind", Body: Reactivity },
      { id: "scenes", title: "2D scenes", keywords: "scene axes plot point area tangent label numberline animate", Body: Scenes },
      { id: "scene3d", title: "3D scenes", keywords: "3d surface solid sphere cube vector camera orbit three", Body: ThreeD },
      { id: "code", title: "Code cells", keywords: "javascript python pyodide sympy matplotlib cell chalk api", Body: CodeCells },
      { id: "media", title: "Media & geometry", keywords: "image video geogebra geo media markdown", Body: Media },
    ],
  },
  {
    label: "Guides",
    pages: [{ id: "guides", title: "Guides", keywords: "guide recipe how to slider derive plot python present share", Body: Guides }],
  },
  {
    label: "Reference",
    pages: [
      { id: "cli", title: "CLI reference", keywords: "cli build watch present command flag out port", Body: Cli },
      { id: "faq", title: "FAQ & troubleshooting", keywords: "faq overflow offline data storage error python slow", Body: Faq },
      { id: "contributing", title: "Contributing", keywords: "contribute open source repo packages monorepo issues", Body: Contributing },
    ],
  },
];

export const ALL_PAGES: DocPage[] = DOC_GROUPS.flatMap((g) => g.pages);
export const DEFAULT_PAGE = "intro";

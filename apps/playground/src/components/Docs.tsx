import * as React from "react";
import { CodeBlock } from "@/components/site/CodeBlock";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Button } from "@/components/ui/button";
import { DASHBOARD_PATH, docsPath, navigate } from "@/lib/router";
import type { Theme } from "@/lib/theme";

const PAGES = [
  { id: "intro", label: "Introduction" },
  { id: "quickstart", label: "Your first lecture" },
  { id: "syntax", label: ".chalk syntax reference" },
  { id: "cli", label: "CLI usage" },
] as const;

/** A clearly-marked "to be expanded" note so gaps are obvious. */
function Stub({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="border-live/40 bg-live/10 text-foreground/80 my-4 rounded-md border-l-2 px-3 py-2 text-sm">
      <strong className="text-live">Stub —</strong> {children}
    </div>
  );
}

const P = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <p className="text-muted-foreground my-3 leading-relaxed">{children}</p>
);
const H2 = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <h2 className="mt-8 text-lg font-semibold">{children}</h2>
);
const Code = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[13px]">{children}</code>
);

function Intro(): React.ReactElement {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Introduction</h1>
      <P>
        Chalk is a markup language and engine for <em>live, interactive math slides</em>. You write a
        plain-text <Code>.chalk</Code> file; Chalk compiles it to a self-contained, reactive slide
        deck that runs entirely in the browser — no server, no account.
      </P>
      <P>
        The <Code>.chalk</Code> text is the single source of truth. The same file presents
        fullscreen, shares by link, exports to a standalone <Code>.html</Code>, and is yours to keep
        under version control.
      </P>
      <H2>How it runs</H2>
      <P>
        Math is typeset with KaTeX; 2D scenes draw on a canvas; 3D surfaces (three.js) and Python
        cells (Pyodide) load lazily, only when a deck actually uses them. Nothing leaves your device.
      </P>
      <div className="mt-6 flex gap-3">
        <Button variant="live" size="sm" onClick={() => navigate(DASHBOARD_PATH)}>Open the Playground</Button>
        <Button variant="outline" size="sm" onClick={() => navigate(docsPath("quickstart"))}>Your first lecture →</Button>
      </div>
    </>
  );
}

function Quickstart(): React.ReactElement {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Your first lecture</h1>
      <P>A complete, reactive slide in a few lines. Paste this into the playground:</P>
      <CodeBlock
        label="first.chalk"
        code={`# Derivatives

A parabola and the slope at a point.

## Explore  $f(x) = a x^2$

@slider a [0.5, 3] = 1.5

:::scene
@axes ax x:[-3, 3] y:[-1, 9] grid
@plot f on ax : a*x^2
@point P on ax at (1, a)
:::

Drag **a** — the curve and the point move together.`}
      />
      <P>Then either:</P>
      <ul className="text-muted-foreground my-3 list-disc space-y-1 pl-6 text-sm">
        <li>open it in the <button className="text-live underline" onClick={() => navigate(DASHBOARD_PATH)}>playground</button> and drag the slider, or</li>
        <li>build it from the command line (see <button className="text-live underline" onClick={() => navigate(docsPath("cli"))}>CLI usage</button>).</li>
      </ul>
    </>
  );
}

function Syntax(): React.ReactElement {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">.chalk syntax reference</h1>
      <P>A <Code>.chalk</Code> file is markdown-like text. Each <Code>#</Code>/<Code>##</Code> heading starts a slide.</P>

      <H2>Math</H2>
      <P>Inline <Code>$…$</Code> and display <Code>$$…$$</Code>, typeset with KaTeX.</P>
      <CodeBlock code={`The limit $\\lim_{x\\to a} f(x)$ and

$$ f'(x) = 2ax $$`} />

      <H2>Sliders &amp; reactivity</H2>
      <P>Declare a slider; any expression that references it updates live.</P>
      <CodeBlock code={`@slider a [0, 3] = 1   step 0.1`} />

      <H2>Scenes (2D)</H2>
      <P>A <Code>:::scene</Code> holds named objects on a coordinate system. <Code>+animate</Code> verbs play on slide advance.</P>
      <CodeBlock code={`:::scene
@axes ax x:[-3,3] y:[-1,9] grid
@plot f on ax : a*x^2
@point P on ax at (1, a)
@area ar on ax under f from 0 to 2 rects 12
@tangent t on ax to f at P
@label lab on ax at (-1.7, 7.5) "f(x)"
+animate write f
:::`} />

      <H2>Equation morphing</H2>
      <P>A <Code>:::derive</Code> morphs one equation into the next on advance.</P>
      <CodeBlock code={`:::derive
$$ a x^2 + b x + c $$
+to $$ a\\left(x + \\tfrac{b}{2a}\\right)^2 + c - \\tfrac{b^2}{4a} $$
:::`} />

      <H2>Theorem family</H2>
      <CodeBlock code={`:::theorem Pythagoras
$$ a^2 + b^2 = c^2 $$
:::

:::proof
+step Drop a perpendicular…
+step Therefore the areas sum. $\\blacksquare$
:::`} />

      <H2>Code cells</H2>
      <P>JavaScript runs live; Python runs in-browser via Pyodide.</P>
      <CodeBlock code={"```py\nimport sympy as sp\nx = sp.Symbol('x')\nchalk.tex(sp.latex(sp.diff(x**3, x)))\n```"} />

      <H2>Media</H2>
      <P>Images and video are first-class — standalone or inside a scene; markdown <Code>![alt](url)</Code> works too.</P>
      <CodeBlock code={`@image fig of "diagram.png" width:6 alt:"A diagram"
@video clip of "https://…/clip.mp4" width:7`} />

      <H2>3D &amp; geometry</H2>
      <CodeBlock code={`:::scene3d
@axes3d ax x:[-3,3] y:[-3,3] z:[0,9]
@surface s on ax : a*(x^2 + y^2) colorscale:height
@camera cam phi:62 theta:-35 distance:9 autorotate
:::`} />
      <Stub>
        A full, exhaustive grammar (every object kind, argument, and animation verb) is still being
        written. The constructs above are accurate; treat this page as a working subset to flesh out.
      </Stub>
    </>
  );
}

function Cli(): React.ReactElement {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">CLI usage</h1>
      <P>The <Code>chalk</Code> command compiles a <Code>.chalk</Code> file to a self-contained HTML deck.</P>
      <CodeBlock
        code={`# compile to lecture.html (alongside the source)
chalk build lecture.chalk
chalk build lecture.chalk --out slides.html

# live-reload dev server while you write
chalk watch lecture.chalk --port 4321

# build, then open the deck
chalk present lecture.chalk`}
      />
      <H2>Local media</H2>
      <P>
        Local images/video referenced by relative path are embedded into the output: small files
        inline as data URIs, larger ones are copied alongside into <Code>&lt;out&gt;.assets/</Code>,
        so the bundle stays offline-capable.
      </P>
      <Stub>
        Installation is not yet published to npm — <Code>npm install -g chalk</Code> is illustrative.
        Until then, build from the repository (see GitHub). Replace this note once published.
      </Stub>
    </>
  );
}

const RENDER: Record<string, () => React.ReactElement> = {
  intro: Intro,
  quickstart: Quickstart,
  syntax: Syntax,
  cli: Cli,
};

export function Docs({ theme, setTheme, page }: { theme: Theme; setTheme: (t: Theme) => void; page: string }): React.ReactElement {
  const Active = RENDER[page] ?? Intro;
  return (
    <div className="bg-background min-h-full">
      <SiteHeader theme={theme} setTheme={setTheme} />
      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8 sm:px-6">
        <aside className="hidden w-48 shrink-0 sm:block">
          <nav aria-label="Docs" className="sticky top-20 space-y-1">
            {PAGES.map((p) => {
              const active = (RENDER[page] ? page : "intro") === p.id;
              return (
                <a
                  key={p.id}
                  href={docsPath(p.id)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey) return;
                    e.preventDefault();
                    navigate(docsPath(p.id));
                  }}
                  className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </a>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 max-w-2xl flex-1">
          <Active />
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}

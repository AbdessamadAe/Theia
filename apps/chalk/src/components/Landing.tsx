import {
  Box,
  Code2,
  GitFork,
  Share2,
  Shapes,
  Sigma,
  SlidersHorizontal,
} from "lucide-react";
import * as React from "react";
import { ArrowRightIcon, GithubIcon } from "@/components/icons";
import { ProjectThumb } from "@/components/ProjectThumb";
import { CodeBlock } from "@/components/site/CodeBlock";
import { HeroDemo } from "@/components/site/HeroDemo";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Button } from "@/components/ui/button";
import { EXAMPLES } from "@/generated/examples";
import { DASHBOARD_PATH, DOCS_PATH, GALLERY_PATH, navigate, projectShareHref } from "@/lib/router";
import { GITHUB_URL, TAGLINE } from "@/lib/site";
import type { Theme } from "@/lib/theme";

const FEATURES = [
  { icon: Sigma, title: "LaTeX-quality math", body: "Real KaTeX typesetting — write $…$ and $$…$$, get crisp, correct equations every time." },
  { icon: SlidersHorizontal, title: "Reactive sliders", body: "Bind a variable to a slider; curves, points, and formulas update live as you drag." },
  { icon: ArrowRightIcon, title: "Equation morphing", body: ":::derive transitions one equation into the next, step by step, on advance." },
  { icon: Shapes, title: "Plots & geometry", body: "Axes, functions, areas, tangents, labels — a 2D scene library that animates." },
  { icon: Box, title: "3D surfaces", body: "Orbitable z = f(x, y) surfaces with height colour, loaded only when a deck needs them." },
  { icon: Code2, title: "Python in the browser", body: "Run sympy / matplotlib in a py cell via Pyodide — no server, all client-side." },
  { icon: Share2, title: "One source → present & share", body: "The same plain-text .theia presents fullscreen, shares by link, and exports offline." },
  { icon: GitFork, title: "Plain text, version-controllable", body: "Your lecture is a file you own — diff it, commit it, reuse it." },
];

function Section({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }): React.ReactElement {
  return (
    <section id={id} className={`mx-auto max-w-6xl px-4 sm:px-6 ${className}`}>
      {children}
    </section>
  );
}

const SHOW_SOURCE = `## The chain rule

@slider a [0.5, 3] = 1.5

:::scene
@axes ax x:[-3,3] y:[-1,9] grid
@plot f on ax : a*x^2
@point P on ax at (1, a)
:::

The curve reacts to **a** as you drag.`;

export function Landing({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }): React.ReactElement {
  const go = (p: string) => () => navigate(p);
  return (
    <div className="bg-background min-h-full">
      <SiteHeader theme={theme} setTheme={setTheme} />
      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <Section className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2">
          <div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              {TAGLINE}
            </h1>
            <p className="text-muted-foreground mt-4 max-w-xl text-base sm:text-lg">
              Theia turns plain text into math-native slides that are actually interactive — drag a
              slider and the curve moves, morph an equation, present from the front of the room or
              share a link. No mangled equations, no static PDFs.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button variant="live" size="default" onClick={go(DASHBOARD_PATH)}>
                Open the Playground <ArrowRightIcon className="size-4" />
              </Button>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                <Button variant="outline" size="default">
                  <GithubIcon className="size-4" /> View on GitHub
                </Button>
              </a>
            </div>
            <p className="text-muted-foreground mt-3 text-xs">Free &amp; open source · runs in your browser · no account.</p>
          </div>
          <HeroDemo />
        </Section>

        {/* ── Problem / why ────────────────────────────────────────────── */}
        <div className="bg-card/40 border-y">
          <Section className="py-14">
            <h2 className="text-xl font-semibold sm:text-2xl">Presenting mathematics is broken</h2>
            <div className="text-muted-foreground mt-4 grid gap-6 text-sm sm:grid-cols-3 sm:text-base">
              <p>Slide tools mangle equations — you fight an equation editor, or paste images that can’t be edited or searched.</p>
              <p>Beamer gives beautiful math but it’s static and slow: a long compile for a PDF that can’t respond to a single question from the room.</p>
              <p>Neither lets a student <em>see</em> what happens as a parameter changes. The most important idea — that math moves — is exactly what gets lost.</p>
            </div>
            <p className="mt-6 max-w-3xl text-sm sm:text-base">
              Theia fills that gap: math-native like Beamer, live like a notebook, authored in plain
              text you own — and it runs entirely in the browser.
            </p>
          </Section>
        </div>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <Section className="py-14">
          <h2 className="text-xl font-semibold sm:text-2xl">What you can build</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="bg-card rounded-xl border p-4 shadow-1">
                <f.icon className="text-live size-5" aria-hidden="true" />
                <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{f.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Show it ──────────────────────────────────────────────────── */}
        <div className="bg-card/40 border-y">
          <Section className="py-14">
            <h2 className="text-xl font-semibold sm:text-2xl">Write text on the left. Watch it come alive.</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm sm:text-base">
              A few lines of <code className="font-mono text-[13px]">.theia</code> become a reactive slide. The same source presents and shares.
            </p>
            <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-2">
              <CodeBlock label="lecture.theia" code={SHOW_SOURCE} />
              <div className="bg-card flex flex-col justify-center gap-3 rounded-xl border p-6 shadow-1">
                <ProjectThumb source={SHOW_SOURCE} />
                <Button variant="live" size="sm" className="self-start" onClick={go(DASHBOARD_PATH)}>
                  Try it live <ArrowRightIcon className="size-4" />
                </Button>
              </div>
            </div>
          </Section>
        </div>

        {/* ── Gallery teaser ───────────────────────────────────────────── */}
        <Section className="py-14">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-semibold sm:text-2xl">Real lectures, not feature demos</h2>
            <a className="text-live hidden text-sm font-medium sm:inline" href={GALLERY_PATH} onClick={(e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate(GALLERY_PATH); } }}>
              Browse the gallery →
            </a>
          </div>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EXAMPLES.slice(0, 3).map((ex) => (
              <li key={ex.id} className="bg-card rounded-xl border p-3 shadow-1">
                <a href={projectShareHref(ex.source)} onClick={(e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate(projectShareHref(ex.source)); } }} className="block">
                  <ProjectThumb source={ex.source} />
                  <div className="mt-2 text-sm font-medium">{ex.label}</div>
                </a>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Get started ──────────────────────────────────────────────── */}
        <div className="bg-card/40 border-y">
          <Section className="py-14">
            <h2 className="text-xl font-semibold sm:text-2xl">Get started</h2>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="bg-card rounded-xl border p-6 shadow-1">
                <h3 className="font-semibold">Try instantly</h3>
                <p className="text-muted-foreground mt-1 text-sm">No install. Open the playground and start typing — it runs in your browser.</p>
                <Button variant="live" size="sm" className="mt-4" onClick={go(DASHBOARD_PATH)}>
                  Open the Playground <ArrowRightIcon className="size-4" />
                </Button>
              </div>
              <div className="bg-card rounded-xl border p-6 shadow-1">
                <h3 className="font-semibold">Install the engine</h3>
                <p className="text-muted-foreground mt-1 mb-3 text-sm">Build decks from the command line.</p>
                <CodeBlock code={"# install the CLI (coming soon to npm)\nnpm install -g chalk\n\n# compile a lecture to a self-contained .html\nchalk build lecture.theia\n\n# live-reload while you write\nchalk watch lecture.theia"} />
                <a className="text-live mt-3 inline-block text-sm font-medium" href={DOCS_PATH} onClick={(e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate(DOCS_PATH); } }}>
                  Read the docs →
                </a>
              </div>
            </div>
          </Section>
        </div>

        {/* ── Open source ──────────────────────────────────────────────── */}
        <Section className="py-14 text-center">
          <h2 className="text-xl font-semibold sm:text-2xl">Free, and open source</h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-2xl text-sm sm:text-base">
            Theia exists because the tools teachers reach for weren’t built for live mathematics.
            It’s free to use and open to contributions — issues, ideas, and pull requests welcome.
          </p>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="mt-5 inline-block">
            <Button variant="outline"><GithubIcon className="size-4" /> View on GitHub</Button>
          </a>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}

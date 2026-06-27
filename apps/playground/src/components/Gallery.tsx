import * as React from "react";
import { ArrowRightIcon } from "@/components/icons";
import { ProjectThumb } from "@/components/ProjectThumb";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Button } from "@/components/ui/button";
import { EXAMPLES } from "@/generated/examples";
import { navigate, projectShareHref } from "@/lib/router";
import type { Theme } from "@/lib/theme";

const BLURB: Record<string, string> = {
  limits: "Limits, derivatives, and the tangent line — a reactive secant→tangent, Riemann areas, and a power-rule derivation.",
  graphing: "A reactive parabola: drag the coefficient and watch the curve, area, and labels respond.",
  morphing: "Equation morphing — completing the square, one transition at a time.",
  surfaces: "A 3D paraboloid you can orbit, with height colour and a tracked point.",
  media: "Images and video as first-class objects — positioned, reactive, and advance-driven.",
};

export function Gallery({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }): React.ReactElement {
  return (
    <div className="bg-background min-h-full">
      <SiteHeader theme={theme} setTheme={setTheme} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Gallery</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm sm:text-base">
          Complete example lectures. Open one in the playground to read the source and play with it —
          every feature shown here is real, running in your browser.
        </p>
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {EXAMPLES.map((ex) => (
            <li key={ex.id} className="bg-card group flex flex-col rounded-xl border p-4 shadow-1">
              <a
                href={projectShareHref(ex.source)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  navigate(projectShareHref(ex.source));
                }}
                aria-label={`Open ${ex.label} in the playground`}
              >
                <ProjectThumb source={ex.source} />
              </a>
              <h2 className="mt-3 text-sm font-semibold">{ex.label}</h2>
              <p className="text-muted-foreground mt-1 flex-1 text-sm">{BLURB[ex.id] ?? "An example Chalk lecture."}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3 self-start"
                onClick={() => navigate(projectShareHref(ex.source))}
              >
                Open in playground <ArrowRightIcon className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}

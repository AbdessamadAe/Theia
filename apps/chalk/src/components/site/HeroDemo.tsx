import { compileChalk } from "@theia/render-slides/core";
import * as React from "react";
import { ASSETS } from "@/generated/assets";

// A deliberately light demo: a slider driving a 2D plot. No Python/3D, so
// interacting never pulls Pyodide or three.js — it stays fast and client-side.
const DEMO_SOURCE = [
  "# f(x) = a · x²",
  "",
  "@slider a [0.2, 3] = 1.4",
  "",
  ":::scene",
  "@axes ax x:[-3, 3] y:[-1, 9] grid",
  "@plot f on ax : a*x^2",
  '@label tip on ax at (-1.85, 7.6) "drag a →"',
  ":::",
  "",
].join("\n");

/**
 * The hero's live mini-deck — the real engine, compiled client-side and shown in
 * an isolated iframe. To keep first paint fast it mounts AFTER paint (an effect):
 * a static poster shows immediately, then swaps to the live, draggable deck.
 */
export function HeroDemo(): React.ReactElement {
  const [html, setHtml] = React.useState<string | null>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    const mount = (): void => setHtml(compileChalk(DEMO_SOURCE, { assets: ASSETS }).html);
    // Defer compile/iframe to idle so it never blocks first paint.
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    const id = ric ? ric(mount) : window.setTimeout(mount, 200);
    return () => {
      if (!ric) window.clearTimeout(id);
    };
  }, []);

  React.useEffect(() => {
    if (html && iframeRef.current) iframeRef.current.srcdoc = html;
  }, [html]);

  return (
    <div className="bg-card ring-border relative aspect-[16/10] w-full overflow-hidden rounded-xl shadow-3 ring-1">
      {/* Static poster until the live deck mounts (keeps first paint instant). */}
      {!html && (
        <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2">
          <svg viewBox="0 0 200 120" className="text-live/70 h-20 w-auto" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M16 100h168M40 108V40" opacity="0.4" />
            <path d="M28 44c24 56 40 56 64 56s40-44 64-72" />
          </svg>
          <span className="text-xs">Loading live demo…</span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Live Theia demo: a slider driving a parabola"
        className={`h-full w-full border-0 transition-opacity duration-500 ${html ? "opacity-100" : "opacity-0"}`}
        loading="lazy"
      />
    </div>
  );
}

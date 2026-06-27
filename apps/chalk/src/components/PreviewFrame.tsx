import * as React from "react";
import { BoardIcon, EASEL_MOUNT, EaselFrame, EmptyBoardSketch } from "@/components/chalk-art";
import { Preview } from "@/components/Preview";
import { Hint } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/lib/use-media-query";

interface PreviewFrameProps {
  html: string;
  freshKey: number;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  slides: number;
  currentSlide: number;
}

/**
 * Presents the live deck as a framed artifact. Two framings, toggleable:
 *  - "plain": an elevated bordered screen (the design-phase preview), and
 *  - "easel": the same live preview MOUNTED on a static chalkboard-easel
 *    illustration.
 * The easel is purely decorative (aria-hidden) and never repaints on a slider
 * drag — it's a memoized static SVG, and a drag mutates only the iframe's
 * internals (no React render here). The deck renders EXACTLY as today inside the
 * mount; we never tint/texture or re-render the slide. Easel applies only on
 * wide viewports (preview size wins on narrow); present mode fullscreens the
 * iframe itself, so the easel never appears there.
 */
export function PreviewFrame({
  html,
  freshKey,
  iframeRef,
  slides,
  currentSlide,
}: PreviewFrameProps): React.ReactElement {
  const wide = useMediaQuery("(min-width: 1024px)");
  const [easelOn, setEaselOn] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem("chalk-easel") === "on"; // default OFF
    } catch {
      return false;
    }
  });
  const showEasel = wide && easelOn;

  const toggleEasel = (): void =>
    setEaselOn((v) => {
      const next = !v;
      try {
        localStorage.setItem("chalk-easel", next ? "on" : "off");
      } catch {
        /* storage unavailable */
      }
      return next;
    });

  const navigate = (dir: 1 | -1): void => {
    try {
      const doc = iframeRef.current?.contentWindow?.document;
      doc?.dispatchEvent(
        new KeyboardEvent("keydown", { key: dir > 0 ? "ArrowRight" : "ArrowLeft", bubbles: true }),
      );
    } catch {
      /* opaque-origin guard */
    }
  };

  // The live preview (unchanged) or a friendly empty state.
  const deckOrEmpty =
    html && slides > 0 ? (
      <Preview html={html} freshKey={freshKey} currentSlide={currentSlide} iframeRef={iframeRef} />
    ) : (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <EmptyBoardSketch className="text-foreground/70 h-32 w-auto max-w-[70%]" />
        <div className="space-y-1">
          <p className="chalk-display text-foreground text-lg font-medium">Nothing on the board yet</p>
          <p className="text-sm">Start typing, or drop in an image.</p>
        </div>
      </div>
    );

  // Auto-hiding prev/next + position indicator (anchors to nearest positioned
  // ancestor: the card in plain mode, the mount in easel mode).
  const controls = (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex items-center justify-center opacity-0 transition-opacity duration-base ease-chalk group-hover/preview:opacity-100 focus-within:opacity-100"
      aria-hidden={slides <= 1}
    >
      <div className="bg-popover/90 text-popover-foreground pointer-events-auto flex items-center gap-1 rounded-full border px-1.5 py-1 shadow-3 backdrop-blur">
        <Hint label="Previous slide (←)">
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => navigate(-1)}
            className="hover:bg-accent focus-visible:ring-ring flex size-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </Hint>
        <span className="text-muted-foreground min-w-[3.5ch] text-center font-mono text-xs tabular-nums">
          {slides ? `${Math.min(currentSlide + 1, slides)} / ${slides}` : "—"}
        </span>
        <Hint label="Next slide (→)">
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => navigate(1)}
            className="hover:bg-accent focus-visible:ring-ring flex size-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </Hint>
      </div>
    </div>
  );

  const toggle = wide ? (
    <Hint label={easelOn ? "Use the plain preview" : "Frame on a chalkboard easel"}>
      <button
        type="button"
        aria-pressed={easelOn}
        aria-label="Toggle chalkboard easel framing"
        onClick={toggleEasel}
        className={`absolute right-3 top-3 z-20 flex size-8 items-center justify-center rounded-md border shadow-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          easelOn
            ? "bg-card text-foreground"
            : "bg-card/70 text-muted-foreground hover:text-foreground"
        }`}
      >
        <BoardIcon className="size-4" />
      </button>
    </Hint>
  ) : null;

  if (showEasel) {
    return (
      <div className="bg-muted/40 group/preview relative flex h-full items-center justify-center p-4">
        <div
          className="motion-safe:animate-in motion-safe:fade-in-0 relative max-h-full w-full max-w-[660px]"
          style={{ aspectRatio: "400 / 360" }}
        >
          <EaselFrame className="absolute inset-0 h-full w-full" />
          <div
            className="bg-background absolute overflow-hidden rounded-md shadow-lg ring-1 ring-black/20"
            style={EASEL_MOUNT}
          >
            {deckOrEmpty}
            {controls}
          </div>
        </div>
        {toggle}
      </div>
    );
  }

  // Plain framing (design-phase preview).
  return (
    <div className="bg-muted/40 group/preview relative flex h-full flex-col items-stretch p-3 sm:p-4">
      <div className="bg-background ring-border relative flex-1 overflow-hidden rounded-xl shadow-2 ring-1">
        {deckOrEmpty}
        {controls}
      </div>
      {toggle}
    </div>
  );
}

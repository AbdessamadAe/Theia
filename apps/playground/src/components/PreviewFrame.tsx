import * as React from "react";
import { EmptyBoardSketch } from "@/components/chalk-art";
import { Preview } from "@/components/Preview";
import { Hint } from "@/components/ui/tooltip";

interface PreviewFrameProps {
  html: string;
  freshKey: number;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  slides: number;
  currentSlide: number;
}

/**
 * Presents the live deck as a framed artifact: an elevated, bordered "screen"
 * on a calm pane, with auto-hiding prev/next controls and a slide-position
 * indicator. Navigation drives the deck by dispatching arrow keys into the
 * same-origin iframe (the deck's own nav handles them) — no behaviour change.
 */
export function PreviewFrame({
  html,
  freshKey,
  iframeRef,
  slides,
  currentSlide,
}: PreviewFrameProps): React.ReactElement {
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

  return (
    <div className="bg-muted/40 group/preview relative flex h-full flex-col items-stretch p-3 sm:p-4">
      <div className="bg-background ring-border relative flex-1 overflow-hidden rounded-xl shadow-2 ring-1">
        {html && slides > 0 ? (
          <Preview html={html} freshKey={freshKey} currentSlide={currentSlide} iframeRef={iframeRef} />
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <EmptyBoardSketch className="text-foreground/70 h-40 w-auto max-w-[70%]" />
            <div className="space-y-1">
              <p className="chalk-display text-foreground text-lg font-medium">
                Nothing on the board yet
              </p>
              <p className="text-sm">Start typing, pick an example, or drop in an image.</p>
            </div>
          </div>
        )}
      </div>

      {/* Auto-hiding deck controls */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex items-center justify-center opacity-0 transition-opacity duration-base ease-chalk group-hover/preview:opacity-100 focus-within:opacity-100"
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
    </div>
  );
}

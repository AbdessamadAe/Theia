/**
 * Standalone media behaviour (block-level `@image`/`@video` and markdown
 * images). Scene media is handled inside scene.ts (positioning + advance-driven
 * playback); this covers the document-flow figures:
 *
 *  - Offscreen discipline: pause any <video> not on the active slide whenever
 *    the slide changes, so a clip never keeps playing/decoding after you move
 *    on (and present mode stops audio on slide change).
 *  - Reduced motion: only autoplay `data-chalk-autoplay` videos when the user
 *    has NOT requested reduced motion; otherwise the poster + controls remain.
 */
/** Parse a timecode: `m:ss`, `h:mm:ss`, or bare seconds → seconds (NaN if bad). */
export function parseMediaTime(s: string): number {
  const parts = s.split(":").map(Number);
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** Parse `… from <t> to <t> …` out of a `+animate play` verb's args. */
export function parseMediaSegment(args: string[]): { start?: number; end?: number } {
  const seg: { start?: number; end?: number } = {};
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === "from") {
      const t = parseMediaTime(args[i + 1]!);
      if (Number.isFinite(t)) seg.start = t;
    } else if (args[i] === "to") {
      const t = parseMediaTime(args[i + 1]!);
      if (Number.isFinite(t)) seg.end = t;
    }
  }
  return seg;
}

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function initMedia(): void {
  if (typeof document === "undefined") return;

  const pauseOffscreen = (): void => {
    document.querySelectorAll<HTMLVideoElement>("video").forEach((v) => {
      const slide = v.closest(".slide");
      if (slide && !slide.classList.contains("is-active")) {
        try {
          v.pause();
        } catch {
          /* ignore */
        }
      }
    });
  };
  // nav toggles `.is-active` before dispatching chalk:advance, so the active
  // slide is current by the time we run.
  document.addEventListener("chalk:advance", pauseOffscreen);

  if (prefersReduced()) return; // honour reduced motion: no autoplay
  document.querySelectorAll<HTMLVideoElement>("video[data-chalk-autoplay]").forEach((v) => {
    v.muted = true; // browsers only allow muted autoplay
    void v.play?.().catch(() => {
      /* gesture policy — leave on poster */
    });
  });
}

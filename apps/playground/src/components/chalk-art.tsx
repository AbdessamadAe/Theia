import * as React from "react";

/**
 * Chalk-style inline SVG garnish for the Chalkboard theme. All decorative,
 * hand-drawn-feel line art (round caps/joins, slightly irregular paths) drawn
 * in `currentColor` so it takes the chalk-white / accent tones. These are
 * GARNISH — used on the switcher icon, the wordmark flourish, and empty states;
 * never over math, code, or the live preview.
 */

type SVG = React.SVGProps<SVGSVGElement>;

/** Theme-switcher icon: a little chalkboard on an easel. */
export function BoardIcon(props: SVG): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="3" y="3.5" width="18" height="13" rx="1.5" />
      <path d="M7 8.5c2-1.2 3.8-1.2 5 0s3 1.2 5 0" />
      <path d="M9 16.5 7.5 21M15 16.5 16.5 21M12 16.5V21" />
    </svg>
  );
}

/** A chalk swoosh, sized to underline the wordmark. Decorative. */
export function WordmarkFlourish(props: SVG): React.ReactElement {
  return (
    <svg
      viewBox="0 0 120 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      preserveAspectRatio="none"
      {...props}
    >
      <path d="M2 7c14-4 30-5 46-3s28 4 44 1c8-1.5 18-2 26 0" opacity="0.9" />
      <path d="M10 10c20 1 40 0 60-1" opacity="0.45" />
    </svg>
  );
}

/**
 * Empty-state sketch: a hand-drawn chalkboard with axes and a parabola — the
 * "nothing on the board yet" illustration. Decorative (the copy carries meaning).
 */
export function EmptyBoardSketch(props: SVG): React.ReactElement {
  return (
    <svg
      viewBox="0 0 240 170"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* board frame (slightly wobbly) */}
      <path d="M18 16h202c3 0 5 2 5 5v108c0 3-2 5-5 5H18c-3 0-5-2-5-5V21c0-3 2-5 4-5z" opacity="0.55" />
      {/* axes */}
      <path d="M48 118h140M70 40v82" opacity="0.6" />
      {/* a chalk parabola */}
      <path d="M52 58c18 36 30 54 40 54s24-20 42-56" stroke="currentColor" />
      {/* a couple of chalk ticks + a dot */}
      <path d="M150 60v6M122 112h6" opacity="0.5" />
      <circle cx="110" cy="112" r="3.2" />
      {/* easel legs + chalk tray */}
      <path d="M40 134v22M200 134v22M30 150h180" opacity="0.5" />
      {/* a stick of chalk on the tray */}
      <path d="M150 150l16-3" strokeWidth={4} opacity="0.85" />
    </svg>
  );
}

import * as React from "react";

/**
 * Theia-style inline SVG garnish for the Theiaboard theme. All decorative,
 * hand-drawn-feel line art (round caps/joins, slightly irregular paths) drawn
 * in `currentColor` so it takes the theia-white / accent tones. These are
 * GARNISH — used on the switcher icon, the wordmark flourish, and empty states;
 * never over math, code, or the live preview.
 */

type SVG = React.SVGProps<SVGSVGElement>;

/** Theme-switcher icon: a little theiaboard on an easel. */
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

/**
 * A standing theiaboard on an easel — a single flat-vector illustration (board
 * in the brand deep-green, muted-wood frame/legs, a minimal tray with theia +
 * eraser). DECORATION ONLY: `aria-hidden`, and memoized with no props so it
 * renders exactly once and never repaints (e.g. while a slider is dragged).
 * The live preview is mounted over the board's inner surface — see EASEL_MOUNT.
 */
export const EaselFrame = React.memo(function EaselFrame(props: SVG): React.ReactElement {
  return (
    <svg
      viewBox="0 0 400 360"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      {/* easel legs (behind the board) */}
      <g
        stroke="hsl(var(--easel-frame))"
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M118 70 L74 334" />
        <path d="M282 70 L326 334" />
        <path d="M206 150 L242 342" />
        <path d="M96 284 H304" />
      </g>
      {/* board: muted-wood frame + brand-green surface */}
      <rect x="36" y="26" width="328" height="218" rx="11" fill="hsl(var(--easel-frame))" />
      <rect
        x="48"
        y="38"
        width="304"
        height="194"
        rx="5"
        fill="hsl(var(--board))"
        stroke="hsl(var(--board-edge))"
        strokeWidth="2"
      />
      {/* theia tray */}
      <rect x="42" y="246" width="316" height="14" rx="4" fill="hsl(var(--easel-tray))" />
      <rect x="42" y="246" width="316" height="3" rx="1.5" fill="hsl(var(--easel-frame))" opacity="0.7" />
      {/* eraser */}
      <rect x="112" y="238" width="46" height="12" rx="2" fill="hsl(var(--easel-frame))" />
      <rect x="112" y="238" width="46" height="5" rx="2" fill="hsl(var(--theia-stick))" opacity="0.35" />
      {/* a stick of theia */}
      <rect
        x="244"
        y="240"
        width="40"
        height="7"
        rx="3.5"
        fill="hsl(var(--theia-stick))"
        transform="rotate(-4 264 243)"
      />
    </svg>
  );
});

/** The live preview's mount rect within the easel wrapper (matches the board's
 * inner surface in EaselFrame's viewBox). */
export const EASEL_MOUNT = { left: "14%", top: "13%", width: "72%", height: "50%" } as const;

/** A theia swoosh, sized to underline the wordmark. Decorative. */
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
 * Empty-state sketch: a hand-drawn theiaboard with axes and a parabola — the
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
      {/* a theia parabola */}
      <path d="M52 58c18 36 30 54 40 54s24-20 42-56" stroke="currentColor" />
      {/* a couple of theia ticks + a dot */}
      <path d="M150 60v6M122 112h6" opacity="0.5" />
      <circle cx="110" cy="112" r="3.2" />
      {/* easel legs + theia tray */}
      <path d="M40 134v22M200 134v22M30 150h180" opacity="0.5" />
      {/* a stick of theia on the tray */}
      <path d="M150 150l16-3" strokeWidth={4} opacity="0.85" />
    </svg>
  );
}

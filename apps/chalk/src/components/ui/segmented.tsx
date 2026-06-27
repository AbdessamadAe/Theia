import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Accessible name when the label is icon-only. */
  ariaLabel?: string;
  /** Native tooltip text. */
  title?: string;
}

/** A small accessible segmented control (radiogroup). Used for the mobile
 * editor/preview switch. Keyboard: arrows move between segments. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  className?: string;
  "aria-label"?: string;
}): React.ReactElement {
  const move = (dir: 1 | -1): void => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    if (next) onChange(next.value);
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-1 rounded-lg border bg-muted p-1", className)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.ariaLabel}
            title={o.title}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors duration-fast ease-chalk",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-card text-foreground shadow-1"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

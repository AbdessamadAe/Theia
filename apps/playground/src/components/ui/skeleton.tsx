import * as React from "react";
import { cn } from "@/lib/utils";

/** A shimmering placeholder for loading surfaces (e.g. 3D / Pyodide). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
        "after:bg-gradient-to-r after:from-transparent after:via-foreground/10 after:to-transparent",
        "motion-reduce:after:hidden",
        className,
      )}
      {...props}
    />
  );
}

/** A small inline spinner using the live accent. */
export function Spinner({ className }: { className?: string }): React.ReactElement {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-live/30 border-t-live motion-reduce:animate-none",
        className,
      )}
    />
  );
}

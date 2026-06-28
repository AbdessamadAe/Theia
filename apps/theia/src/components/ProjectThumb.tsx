import * as React from "react";

/** First `#`/`##` heading in the source, or a fallback. */
function firstHeading(source: string): string {
  const m = /^\s*#{1,2}\s+(.+?)\s*$/m.exec(source);
  return m ? m[1]! : "Untitled";
}

/** First line of prose (skipping headings, directives, fences, math). */
function snippet(source: string): string {
  for (const raw of source.split("\n")) {
    const t = raw.trim();
    if (!t || /^(#{1,3}\s|@|\+|:::|```|\$\$)/.test(t)) continue;
    return t.replace(/[*`$]/g, "").slice(0, 90);
  }
  return "";
}

/**
 * A lightweight first-slide thumbnail: a mini "slide card" showing the title and
 * a snippet. Cheap (regex, no compile/iframe) so the dashboard scales to many
 * projects without spinning up N runtimes.
 */
export function ProjectThumb({ source }: { source: string }): React.ReactElement {
  const heading = React.useMemo(() => firstHeading(source), [source]);
  const sub = React.useMemo(() => snippet(source), [source]);
  return (
    <div
      aria-hidden="true"
      className="bg-background relative flex aspect-[16/10] w-full flex-col justify-center gap-1.5 overflow-hidden rounded-md border px-4 shadow-1"
    >
      <div className="text-foreground line-clamp-2 text-[13px] font-semibold leading-tight">{heading}</div>
      {sub && <div className="text-muted-foreground line-clamp-1 text-[11px]">{sub}</div>}
      {/* faint theia lines suggesting content */}
      <div className="mt-1 space-y-1 opacity-50">
        <div className="bg-muted-foreground/30 h-1 w-3/4 rounded-full" />
        <div className="bg-muted-foreground/20 h-1 w-1/2 rounded-full" />
      </div>
      <div className="bg-live/70 absolute bottom-0 left-0 h-0.5 w-1/3" />
    </div>
  );
}

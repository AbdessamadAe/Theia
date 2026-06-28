import * as React from "react";
import { ArrowRightIcon, SearchIcon } from "@/components/icons";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { ALL_PAGES, DEFAULT_PAGE, DOC_GROUPS } from "@/docs/pages";
import { docsPath, navigate } from "@/lib/router";
import type { Theme } from "@/lib/theme";

interface Heading {
  id: string;
  text: string;
  level: number;
}

export function Docs({ theme, setTheme, page }: { theme: Theme; setTheme: (t: Theme) => void; page: string }): React.ReactElement {
  const active = ALL_PAGES.find((p) => p.id === page) ?? ALL_PAGES.find((p) => p.id === DEFAULT_PAGE)!;
  const [query, setQuery] = React.useState("");
  const [headings, setHeadings] = React.useState<Heading[]>([]);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Build the on-page "in this section" list from the rendered headings.
  React.useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const hs = Array.from(root.querySelectorAll<HTMLElement>("h2[id], h3[id]")).map((el) => ({
      id: el.id,
      text: el.textContent ?? "",
      level: el.tagName === "H3" ? 3 : 2,
    }));
    setHeadings(hs);
  }, [active.id]);

  const idx = ALL_PAGES.findIndex((p) => p.id === active.id);
  const prev = ALL_PAGES[idx - 1];
  const next = ALL_PAGES[idx + 1];

  const q = query.trim().toLowerCase();
  const matches = (p: { title: string; keywords: string }): boolean =>
    !q || p.title.toLowerCase().includes(q) || p.keywords.includes(q);

  const goto = (id: string): void => navigate(docsPath(id));

  return (
    <div className="bg-background min-h-full">
      <SiteHeader theme={theme} setTheme={setTheme} />
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6">
        {/* ── Sidebar nav + search ─────────────────────────────────────── */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20">
            <div className="relative mb-3">
              <SearchIcon className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search docs…"
                aria-label="Search documentation"
                className="border-input bg-card focus-visible:ring-ring h-9 w-full rounded-md border pl-8 pr-3 text-sm outline-none focus-visible:ring-2"
              />
            </div>
            <nav aria-label="Documentation" className="space-y-4">
              {DOC_GROUPS.map((group) => {
                const pages = group.pages.filter(matches);
                if (pages.length === 0) return null;
                return (
                  <div key={group.label}>
                    <div className="text-muted-foreground px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider">
                      {group.label}
                    </div>
                    {pages.map((p) => (
                      <a
                        key={p.id}
                        href={docsPath(p.id)}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey) return;
                          e.preventDefault();
                          goto(p.id);
                        }}
                        aria-current={p.id === active.id ? "page" : undefined}
                        className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                          p.id === active.id
                            ? "bg-accent text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {p.title}
                      </a>
                    ))}
                  </div>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* ── Content ──────────────────────────────────────────────────── */}
        <main ref={contentRef} className="min-w-0 max-w-2xl flex-1">
          {/* Mobile page picker */}
          <div className="mb-4 lg:hidden">
            <label className="sr-only" htmlFor="docs-page">Page</label>
            <select
              id="docs-page"
              value={active.id}
              onChange={(e) => goto(e.target.value)}
              className="border-input bg-card h-9 w-full rounded-md border px-3 text-sm"
            >
              {DOC_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.pages.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <active.Body />

          {/* prev / next */}
          <div className="mt-12 flex items-stretch justify-between gap-4 border-t pt-6">
            {prev ? (
              <button onClick={() => goto(prev.id)} className="hover:border-live/50 flex-1 rounded-lg border p-3 text-left transition-colors">
                <div className="text-muted-foreground text-xs">Previous</div>
                <div className="text-foreground text-sm font-medium">{prev.title}</div>
              </button>
            ) : (
              <div className="flex-1" />
            )}
            {next ? (
              <button onClick={() => goto(next.id)} className="hover:border-live/50 flex-1 rounded-lg border p-3 text-right transition-colors">
                <div className="text-muted-foreground text-xs">Next</div>
                <div className="text-foreground flex items-center justify-end gap-1 text-sm font-medium">
                  {next.title} <ArrowRightIcon className="size-3.5" />
                </div>
              </button>
            ) : (
              <div className="flex-1" />
            )}
          </div>
        </main>

        {/* ── On this page ─────────────────────────────────────────────── */}
        <aside className="hidden w-48 shrink-0 xl:block">
          {headings.length > 0 && (
            <div className="sticky top-20">
              <div className="text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-wider">
                In this section
              </div>
              <nav aria-label="On this page" className="space-y-1 text-sm">
                {headings.map((h) => (
                  <a
                    key={h.id}
                    href={`#${h.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={`text-muted-foreground hover:text-foreground block ${h.level === 3 ? "pl-3" : ""}`}
                  >
                    {h.text}
                  </a>
                ))}
              </nav>
            </div>
          )}
        </aside>
      </div>
      <SiteFooter />
    </div>
  );
}

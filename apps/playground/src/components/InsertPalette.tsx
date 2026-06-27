import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CATEGORY_LABELS, type Category, SNIPPETS, type SnippetDef } from "@/lib/snippets";

interface InsertPaletteProps {
  open: boolean;
  onClose: () => void;
  onPick: (def: SnippetDef) => void;
}

/** A ⌘K-style command palette of insert snippets — searchable, grouped, and
 * keyboard-navigable. Built on the themed Dialog (focus trap + escape + overlay
 * come from Radix); selecting one inserts its skeleton at the caret. */
export function InsertPalette({ open, onClose, onPick }: InsertPaletteProps): React.ReactElement {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return SNIPPETS.filter(
      (s) => !q || s.id.includes(q) || s.label.toLowerCase().includes(q) || s.category.includes(q),
    );
  }, [query]);

  React.useEffect(() => {
    if (active >= filtered.length) setActive(Math.max(0, filtered.length - 1));
  }, [filtered, active]);

  const pick = (def: SnippetDef): void => {
    onPick(def);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const def = filtered[active];
      if (def) pick(def);
    }
  };

  // Group the filtered list by category, preserving order.
  const groups = new Map<Category, SnippetDef[]>();
  for (const s of filtered) {
    const g = groups.get(s.category) ?? [];
    g.push(s);
    groups.set(s.category, g);
  }
  let flatIndex = -1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        position="top"
        className="w-[min(580px,94vw)] overflow-hidden p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        // Don't yank focus back to the trigger on close — applySnippet has just
        // focused the editor and placed the caret on the first tab-stop; keep it.
        onCloseAutoFocus={(e) => e.preventDefault()}
        aria-label="Insert a Chalk construct"
      >
        <DialogTitle className="sr-only">Insert a Chalk construct</DialogTitle>

        <div className="flex items-center gap-2 border-b px-4">
          <svg
            className="text-muted-foreground size-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Insert… search slides, math, @plot, :::derive, code, 3D"
            aria-label="Search insertable constructs"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-[52vh] overflow-auto p-1.5" role="listbox" aria-label="Insertable constructs">
          {filtered.length === 0 && (
            <div className="text-muted-foreground px-3 py-8 text-center text-sm">No matches.</div>
          )}
          {[...groups.entries()].map(([cat, items]) => (
            <div key={cat} className="mb-1">
              <div className="text-muted-foreground px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider">
                {CATEGORY_LABELS[cat]}
              </div>
              {items.map((s) => {
                flatIndex += 1;
                const idx = flatIndex;
                const selected = idx === active;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => pick(s)}
                    className={`group flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors duration-fast ${
                      selected ? "bg-accent text-accent-foreground" : "text-foreground"
                    }`}
                  >
                    <span>{s.label}</span>
                    <kbd
                      className={`rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                        selected ? "border-live/40 text-live" : "text-muted-foreground"
                      }`}
                    >
                      /{s.id}
                    </kbd>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="text-muted-foreground flex items-center gap-3 border-t px-3 py-2 text-[11px]">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> insert</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
          <span className="ml-auto">or type <kbd className="font-mono">/</kbd> in the editor</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

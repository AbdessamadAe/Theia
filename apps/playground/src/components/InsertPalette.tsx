import * as React from "react";
import { CATEGORY_LABELS, type Category, SNIPPETS, type SnippetDef } from "@/lib/snippets";

interface InsertPaletteProps {
  open: boolean;
  onClose: () => void;
  onPick: (def: SnippetDef) => void;
}

/** A searchable, keyboard-navigable command palette of insert snippets,
 * grouped by category. Selecting one inserts its skeleton at the caret. */
export function InsertPalette({ open, onClose, onPick }: InsertPaletteProps): React.ReactElement | null {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
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

  if (!open) return null;

  const pick = (def: SnippetDef): void => {
    onPick(def);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="bg-popover text-popover-foreground w-[min(560px,92vw)] overflow-hidden rounded-lg border shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Insert a Chalk construct"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Insert… (search slides, math, @plot, :::derive, code, 3D)"
          aria-label="Search insertable constructs"
          className="bg-background w-full border-b px-4 py-3 text-sm outline-none"
        />
        <div className="max-h-[50vh] overflow-auto p-1" role="listbox">
          {filtered.length === 0 && (
            <div className="text-muted-foreground px-3 py-6 text-center text-sm">No matches.</div>
          )}
          {[...groups.entries()].map(([cat, items]) => (
            <div key={cat}>
              <div className="text-muted-foreground px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide">
                {CATEGORY_LABELS[cat]}
              </div>
              {items.map((s) => {
                flatIndex += 1;
                const idx = flatIndex;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={idx === active}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => pick(s)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm ${
                      idx === active ? "bg-accent text-accent-foreground" : ""
                    }`}
                  >
                    <span>{s.label}</span>
                    <span className="text-muted-foreground font-mono text-xs">/{s.id}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="text-muted-foreground border-t px-3 py-1.5 text-[11px]">
          ↑↓ navigate · ↵ insert · esc close — or type <span className="font-mono">/</span> in the editor
        </div>
      </div>
    </div>
  );
}

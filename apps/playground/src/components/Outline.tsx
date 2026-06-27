import { EditorView } from "@codemirror/view";
import * as React from "react";
import { buildOutline, moveBlock, type OutlineSlide } from "@/lib/outline";

interface OutlineProps {
  source: string;
  view: EditorView | null;
  /** Active slide index in the preview, for highlighting. */
  currentSlide: number;
}

/** A descriptor of a draggable outline item and its source span. */
interface DragItem {
  type: "slide" | "block";
  slideIndex: number;
  start: number;
  end: number;
}

export function Outline({ source, view, currentSlide }: OutlineProps): React.ReactElement {
  const slides = React.useMemo(() => buildOutline(source), [source]);
  const dragging = React.useRef<DragItem | null>(null);

  /** Apply a reorder as one whole-document transaction (one undo step). */
  const rewrite = React.useCallback(
    (item: DragItem, target: number) => {
      if (!view) return;
      const next = moveBlock(view.state.doc.toString(), item.start, item.end, target);
      if (next === view.state.doc.toString()) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    },
    [view],
  );

  const jumpTo = (start: number): void => {
    if (!view) return;
    view.dispatch({ selection: { anchor: start }, scrollIntoView: true });
    view.focus();
  };

  // End of a slide's region = start of the next slide (or end of doc).
  const slideRegionEnd = (s: OutlineSlide[], i: number): number =>
    i + 1 < s.length ? s[i + 1]!.start : (view?.state.doc.length ?? s[i]!.end);

  // --- Keyboard move (drag alternative) ---
  const moveSlide = (i: number, dir: -1 | 1): void => {
    const s = slides;
    const j = i + dir;
    if (j < 0 || j >= s.length) return;
    const item: DragItem = { type: "slide", slideIndex: i, start: s[i]!.start, end: s[i]!.end };
    const target = dir < 0 ? s[j]!.start : (s[i + 2]?.start ?? (view?.state.doc.length ?? s[i]!.end));
    rewrite(item, target);
  };
  const moveBlockKb = (si: number, bi: number, dir: -1 | 1): void => {
    const blocks = slides[si]!.blocks;
    const j = bi + dir;
    const item: DragItem = { type: "block", slideIndex: si, start: blocks[bi]!.start, end: blocks[bi]!.end };
    if (j < 0) {
      // move to end of previous slide
      if (si === 0) return;
      rewrite(item, slides[si]!.start);
      return;
    }
    if (j >= blocks.length) {
      // move to start of next slide (its first block, or its heading body)
      const target = slideRegionEnd(slides, si);
      rewrite(item, target);
      return;
    }
    const target = dir < 0 ? blocks[j]!.start : (blocks[bi + 2]?.start ?? slideRegionEnd(slides, si));
    rewrite(item, target);
  };

  // --- HTML5 drag ---
  // Dropping a SLIDE on a slide → reorder before it. Dropping a BLOCK on a
  // slide → append into that slide (its region end). Dropping on a block →
  // land before that block.
  const onDropSlide = (slideIndex: number): void => {
    const item = dragging.current;
    dragging.current = null;
    if (!item) return;
    const target = item.type === "slide" ? slides[slideIndex]!.start : slideRegionEnd(slides, slideIndex);
    rewrite(item, target);
  };
  const onDropBlock = (target: number): void => {
    const item = dragging.current;
    dragging.current = null;
    if (item) rewrite(item, target);
  };
  const dragProps = (item: DragItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      dragging.current = item;
      e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
  });

  const Move = ({ onUp, onDown, label }: { onUp: () => void; onDown: () => void; label: string }) => (
    <span className="ml-auto flex shrink-0 gap-0.5">
      <button
        type="button"
        aria-label={`Move ${label} up`}
        className="hover:bg-accent rounded px-1 text-xs leading-none"
        onClick={(e) => {
          e.stopPropagation();
          onUp();
        }}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        className="hover:bg-accent rounded px-1 text-xs leading-none"
        onClick={(e) => {
          e.stopPropagation();
          onDown();
        }}
      >
        ↓
      </button>
    </span>
  );

  return (
    <div className="h-full overflow-auto p-2 text-sm" aria-label="Deck outline">
      <div className="text-muted-foreground px-2 pb-1 text-[11px] font-medium uppercase tracking-wide">
        Outline
      </div>
      {slides.length === 0 && <div className="text-muted-foreground px-2 py-4">No slides yet.</div>}
      <ul className="space-y-1">
        {slides.map((slide, si) => (
          <li key={`${slide.start}-${si}`}>
            <div
              {...dragProps({ type: "slide", slideIndex: si, start: slide.start, end: slide.end })}
              onDrop={() => onDropSlide(si)}
              className={`group flex items-center gap-1 rounded-md px-2 py-1 ${
                si === currentSlide ? "bg-accent/60" : "hover:bg-accent/40"
              }`}
            >
              <span className="text-muted-foreground cursor-grab select-none" aria-hidden>⠿</span>
              <button
                type="button"
                onClick={() => jumpTo(slide.start)}
                className="truncate text-left font-medium"
                title={slide.label}
              >
                {slide.label || "Untitled"}
              </button>
              <Move label={`slide ${si + 1}`} onUp={() => moveSlide(si, -1)} onDown={() => moveSlide(si, 1)} />
            </div>
            <ul className="ml-5 mt-0.5 space-y-0.5 border-l pl-2">
              {slide.blocks.map((b, bi) => (
                <li
                  key={`${b.start}-${bi}`}
                  {...dragProps({ type: "block", slideIndex: si, start: b.start, end: b.end })}
                  onDrop={() => onDropBlock(b.start)}
                  className="hover:bg-accent/40 group flex items-center gap-1 rounded px-2 py-0.5"
                >
                  <span className="text-muted-foreground cursor-grab select-none text-xs" aria-hidden>⠿</span>
                  <button
                    type="button"
                    onClick={() => jumpTo(b.start)}
                    className="text-muted-foreground hover:text-foreground truncate text-left font-mono text-xs"
                    title={b.label}
                  >
                    {b.label}
                  </button>
                  <Move label="block" onUp={() => moveBlockKb(si, bi, -1)} onDown={() => moveBlockKb(si, bi, 1)} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

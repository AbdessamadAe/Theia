/**
 * Derive the deck outline from the parser's existing output (reusing `parse`,
 * not a second parser) and rewrite the source for reorders. Every outline item
 * maps to a source character span `[start, end)` taken straight from the node's
 * `loc`; for fenced blocks that span already covers the whole `:::…:::` block.
 */
import type { Block, Inline, Slide } from "@theia/ast";
import { parse } from "@theia/parser";

export interface OutlineBlock {
  kind: string;
  label: string;
  start: number;
  end: number;
}
export interface OutlineSlide {
  index: number;
  label: string;
  start: number;
  end: number;
  blocks: OutlineBlock[];
}

function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) =>
      n.type === "text"
        ? n.value
        : n.type === "inlineMath"
          ? `$${n.tex}$`
          : n.type === "inlineCode"
            ? n.value
            : "children" in n
              ? inlineText(n.children)
              : "",
    )
    .join("");
}

function clip(s: string, n = 42): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function blockLabel(b: Block, source: string): { kind: string; label: string } {
  const first = clip(source.slice(b.loc.start.offset, b.loc.end.offset).split("\n")[0] ?? "");
  switch (b.type) {
    case "paragraph":
      return { kind: "text", label: clip(inlineText(b.children)) || "text" };
    case "math":
      return { kind: "math", label: `math  ${clip(b.tex, 28)}` };
    case "theorem":
      return { kind: "theorem", label: `:::${b.kind}${b.title ? ` ${b.title}` : ""}` };
    case "derive":
      return { kind: "derive", label: ":::derive" };
    case "scene":
      return { kind: "scene", label: b.dimension === "3d" ? ":::scene3d" : ":::scene" };
    case "code":
      return { kind: "code", label: `${b.lang} cell` };
    case "slider":
      return { kind: "slider", label: `@slider ${b.name}` };
    case "plot":
      return { kind: "plot", label: `@plot ${b.lhs ?? b.expr}` };
    case "geo":
      return { kind: "geo", label: ":::geo" };
    case "list":
      return { kind: "list", label: "list" };
    default:
      return { kind: "block", label: first };
  }
}

export type Container = "scene" | "scene3d" | "derive" | "theorem";

/** The innermost container block whose source range contains `offset`. */
export function enclosingContainer(source: string, offset: number): Container | null {
  let found: Container | null = null;
  try {
    const doc = parse(source);
    for (const slide of doc.children) {
      for (const b of slide.children) {
        if (offset < b.loc.start.offset || offset > b.loc.end.offset) continue;
        if (b.type === "scene") found = b.dimension === "3d" ? "scene3d" : "scene";
        else if (b.type === "derive") found = "derive";
        else if (b.type === "theorem") found = "theorem";
      }
    }
  } catch {
    /* lenient: no container */
  }
  return found;
}

/** Build the outline (slides → blocks) from the current source. */
export function buildOutline(source: string): OutlineSlide[] {
  let doc;
  try {
    doc = parse(source);
  } catch {
    return [];
  }
  return doc.children.map((slide: Slide, index) => ({
    index,
    label: clip(inlineText(slide.heading)) || (slide.kind === "title" ? "Title" : "Untitled"),
    start: slide.loc.start.offset,
    end: slide.loc.end.offset,
    blocks: slide.children.map((b) => {
      const { kind, label } = blockLabel(b, source);
      return { kind, label, start: b.loc.start.offset, end: b.loc.end.offset };
    }),
  }));
}

// --- Pure text reorder ------------------------------------------------------

function lineStartOffset(text: string, i: number): number {
  return text.lastIndexOf("\n", Math.max(0, i - 1)) + 1;
}
/** Offset just past the newline that ends the line containing `i`. */
function lineEndExclusive(text: string, i: number): number {
  const nl = text.indexOf("\n", i);
  return nl < 0 ? text.length : nl + 1;
}

/**
 * Move the (line-aligned) span `[start, end)` to `target`, joining neighbours
 * with a blank line so the result still parses. Pure: returns the new text.
 * `target` is an offset in the ORIGINAL text (the position to land before).
 */
export function moveBlock(text: string, start: number, end: number, target: number): string {
  const s = lineStartOffset(text, start);
  const e = lineEndExclusive(text, Math.max(start, end - 1));
  const block = text.slice(s, e).replace(/\s+$/, "");
  if (!block) return text;

  const without = text.slice(0, s) + text.slice(e);
  let t = target;
  if (t >= e) t -= e - s;
  else if (t > s) t = s;
  t = lineStartOffset(without, Math.max(0, Math.min(t, without.length)));

  const head = without.slice(0, t).replace(/\n+$/, "");
  const tail = without.slice(t).replace(/^\n+/, "");
  const parts = [head, block, tail].filter((p) => p.length > 0);
  const out = parts.join("\n\n");
  return out.endsWith("\n") ? out : `${out}\n`;
}

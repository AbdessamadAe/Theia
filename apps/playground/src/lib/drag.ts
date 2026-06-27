/**
 * Surgical write-back for drag-on-preview position editing.
 *
 * The preview (runtime) posts `{span, x, y}` when a FREE-position object is
 * dropped or nudged. We locate the two number tokens inside that object's
 * `at (…)` within its source span and produce minimal text replacements — only
 * the numbers change, everything else (spacing, the rest of the line) is
 * preserved. Applied as one editor transaction, a drag is one undo step.
 */

export interface CoordEdit {
  from: number;
  to: number;
  insert: string;
}

/** Format a dragged coordinate: up to 2 decimals, no trailing zeros. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100);
}

const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)/g;

/**
 * Compute the minimal edits to set the `at (x, y)` coordinates of the object
 * whose source occupies `span`. Returns null if the span has no rewritable
 * literal `at (…)` (e.g. a derived position — which is never dragged anyway).
 */
export function coordEdits(
  source: string,
  span: [number, number],
  x: number,
  y: number,
): CoordEdit[] | null {
  const [base, end] = span;
  const seg = source.slice(base, end);
  const atMatch = /\bat\s*\(/.exec(seg);
  if (!atMatch) return null;
  const open = seg.indexOf("(", atMatch.index);
  const close = seg.indexOf(")", open);
  if (open < 0 || close < 0) return null;

  const inner = seg.slice(open + 1, close);
  const nums: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  NUM.lastIndex = 0;
  while ((m = NUM.exec(inner)) && nums.length < 2) {
    nums.push({ start: open + 1 + m.index, end: open + 1 + m.index + m[0].length });
  }
  if (nums.length < 2) return null; // not two literal coords → don't rewrite

  return [
    { from: base + nums[0]!.start, to: base + nums[0]!.end, insert: fmt(x) },
    { from: base + nums[1]!.start, to: base + nums[1]!.end, insert: fmt(y) },
  ];
}

/**
 * Free-vs-derived classification for drag-on-preview position editing.
 *
 * THE LINE THAT MUST NOT BE CROSSED: only an object whose position is a FREE
 * literal coordinate may be dragged. A position that references any binding
 * (slider/variable) or is otherwise computed is DERIVED — dragging it would
 * destroy the relationship that makes it reactive, so it is inert (the user
 * manipulates its slider instead). We classify purely from the coordinate
 * strings the parser already produced (`args.x`, `args.y`).
 */
import { compileExpr } from "./expr.js";

/** A coordinate is free iff it is a plain numeric literal — no identifiers. */
export function isFreeLiteral(expr: string | undefined): boolean {
  return expr !== undefined && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(expr.trim());
}

/** An `at (x, y)` position is drag-editable iff BOTH coords are free literals. */
export function isDraggablePosition(xExpr?: string, yExpr?: string): boolean {
  return isFreeLiteral(xExpr) && isFreeLiteral(yExpr);
}

/** Variables a derived coordinate references (for the "drag the slider" hint). */
export function boundVars(...exprs: Array<string | undefined>): string[] {
  const out: string[] = [];
  for (const e of exprs) {
    if (e === undefined || isFreeLiteral(e)) continue;
    try {
      for (const v of compileExpr(e).vars) if (!out.includes(v)) out.push(v);
    } catch {
      /* unparseable → no surfaced binding */
    }
  }
  return out;
}

/**
 * Pure graph layout + edge parsing for @graph / @digraph. Positions are unit-
 * normalized to roughly [-1, 1]; the scene scales them by a radius around the
 * object's resolved center. Two layouts: circular (deterministic) and spring
 * (Fruchterman–Reingold, computed once — not per frame).
 */

export interface Edge {
  from: string;
  to: string;
}

/** Parse `[A-B, B-C]` (graph) or `[A->B, B->C]` (digraph) into edges. */
export function parseEdges(spec: string): Edge[] {
  const inner = spec.trim().replace(/^\[/, "").replace(/\]$/, "");
  const out: Edge[] = [];
  for (const tok of inner.split(",").map((t) => t.trim()).filter(Boolean)) {
    const m = /^(\w+)\s*-?>?\s*(\w+)$/.exec(tok.replace(/->/g, "-"));
    if (m) out.push({ from: m[1]!, to: m[2]! });
  }
  return out;
}

/** A node sequence `A-B-C` → its consecutive edges. */
export function pathEdges(path: string): Edge[] {
  const nodes = path.split(/->|-/).map((n) => n.trim()).filter(Boolean);
  const out: Edge[] = [];
  for (let i = 0; i + 1 < nodes.length; i++) out.push({ from: nodes[i]!, to: nodes[i + 1]! });
  return out;
}

export type Layout = Map<string, [number, number]>;

export function circularLayout(names: string[]): Layout {
  const pos: Layout = new Map();
  const n = Math.max(1, names.length);
  names.forEach((name, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    pos.set(name, [Math.cos(a), Math.sin(a)]);
  });
  return pos;
}

/** Normalize positions so the largest |coord| is ~1 (centered at the mean). */
function normalize(pos: Layout): Layout {
  const pts = [...pos.values()];
  if (pts.length === 0) return pos;
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let max = 0;
  for (const [x, y] of pts) max = Math.max(max, Math.abs(x - cx), Math.abs(y - cy));
  const s = max > 0 ? 1 / max : 1;
  const out: Layout = new Map();
  for (const [k, [x, y]] of pos) out.set(k, [(x - cx) * s, (y - cy) * s]);
  return out;
}

export function springLayout(names: string[], edges: Edge[], iters = 200): Layout {
  const pos = circularLayout(names); // deterministic seed
  const k = 1.0; // ideal edge length
  for (let it = 0; it < iters; it++) {
    const disp = new Map<string, [number, number]>(names.map((n) => [n, [0, 0]]));
    for (const u of names)
      for (const v of names) {
        if (u === v) continue;
        const pu = pos.get(u)!;
        const pv = pos.get(v)!;
        const dx = pu[0] - pv[0];
        const dy = pu[1] - pv[1];
        const d = Math.hypot(dx, dy) || 0.01;
        const rep = (k * k) / d;
        const du = disp.get(u)!;
        du[0] += (dx / d) * rep;
        du[1] += (dy / d) * rep;
      }
    for (const e of edges) {
      const pa = pos.get(e.from);
      const pb = pos.get(e.to);
      if (!pa || !pb) continue;
      const dx = pa[0] - pb[0];
      const dy = pa[1] - pb[1];
      const d = Math.hypot(dx, dy) || 0.01;
      const att = (d * d) / k;
      const da = disp.get(e.from)!;
      const db = disp.get(e.to)!;
      da[0] -= (dx / d) * att;
      da[1] -= (dy / d) * att;
      db[0] += (dx / d) * att;
      db[1] += (dy / d) * att;
    }
    const temp = 0.1 * (1 - it / iters);
    for (const n of names) {
      const dp = disp.get(n)!;
      const d = Math.hypot(dp[0], dp[1]) || 0.01;
      const lim = Math.min(d, temp * 10);
      const p = pos.get(n)!;
      pos.set(n, [p[0] + (dp[0] / d) * lim, p[1] + (dp[1] / d) * lim]);
    }
  }
  return normalize(pos);
}

export function layoutGraph(names: string[], edges: Edge[], kind: string): Layout {
  return kind === "spring" ? springLayout(names, edges) : circularLayout(names);
}

/**
 * Token/atom matching for equation morphing — pure, no DOM, so it is unit
 * testable. The morph primitive extracts an ordered list of glyph "atoms" from
 * each rendered expression (its visible content plus an optional author key)
 * and asks this module how the two lists correspond.
 *
 * Matching order:
 *   1. Author keys first — atoms carrying the same `ck-…` key (from a
 *      `\htmlClass{ck-…}{…}` hint in the tex) pair up in order. This resolves
 *      ambiguous cases the way Manim's TransformMatchingTex key_map does.
 *   2. Then identical content, choosing the nearest unused position — so a
 *      surviving symbol glides to its closest counterpart.
 *
 * `confidence` (matched fraction of all atoms) lets the caller fall back to a
 * clean cross-fade when a transform would be a meaningless jumble.
 */

export interface Atom {
  content: string;
  key?: string | null;
}

export interface MatchPair {
  from: number;
  to: number;
}

export interface MatchResult {
  pairs: MatchPair[];
  unmatchedFrom: number[];
  unmatchedTo: number[];
  /** Matched fraction in [0,1]: 2·pairs / (|from| + |to|). */
  confidence: number;
}

/** Below this matched fraction, a transform is not worth it — cross-fade. */
export const CROSSFADE_CONFIDENCE = 0.4;

export function shouldCrossfade(result: MatchResult): boolean {
  return result.confidence < CROSSFADE_CONFIDENCE;
}

function groupByKey(atoms: Atom[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  atoms.forEach((atom, i) => {
    const key = atom.key;
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(i);
    else map.set(key, [i]);
  });
  return map;
}

/** Match two atom lists into pairs + leftovers. Deterministic. */
export function matchAtoms(from: Atom[], to: Atom[]): MatchResult {
  const n = from.length;
  const m = to.length;
  const fromUsed = new Array<boolean>(n).fill(false);
  const toUsed = new Array<boolean>(m).fill(false);
  const pairs: MatchPair[] = [];

  // 1) Author keys: pair same-key atoms positionally.
  const toByKey = groupByKey(to);
  for (const [key, fromIdxs] of groupByKey(from)) {
    const toIdxs = toByKey.get(key);
    if (!toIdxs) continue;
    const count = Math.min(fromIdxs.length, toIdxs.length);
    for (let p = 0; p < count; p++) {
      const i = fromIdxs[p]!;
      const j = toIdxs[p]!;
      pairs.push({ from: i, to: j });
      fromUsed[i] = true;
      toUsed[j] = true;
    }
  }

  // 2) Identical content, nearest unused position.
  for (let i = 0; i < n; i++) {
    if (fromUsed[i]) continue;
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < m; j++) {
      if (toUsed[j] || to[j]!.content !== from[i]!.content) continue;
      const dist = Math.abs(i - j);
      if (dist < bestDist) {
        bestDist = dist;
        best = j;
      }
    }
    if (best >= 0) {
      pairs.push({ from: i, to: best });
      fromUsed[i] = true;
      toUsed[best] = true;
    }
  }

  const unmatchedFrom: number[] = [];
  const unmatchedTo: number[] = [];
  for (let i = 0; i < n; i++) if (!fromUsed[i]) unmatchedFrom.push(i);
  for (let j = 0; j < m; j++) if (!toUsed[j]) unmatchedTo.push(j);

  pairs.sort((a, b) => a.to - b.to);
  const confidence = n + m === 0 ? 1 : (2 * pairs.length) / (n + m);
  return { pairs, unmatchedFrom, unmatchedTo, confidence };
}

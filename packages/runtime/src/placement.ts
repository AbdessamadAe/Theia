/**
 * Relative placement helpers for scene objects (`next_to` / `shift`).
 *
 * Placement creates object-to-object dependencies: an object placed `next_to`
 * another must resolve AFTER its target and update whenever the target moves.
 * Rather than a second reactive system, we compute a STATIC resolution order
 * once (the `next_to` graph is fixed by the source) and resolve positions in
 * that order inside the scene's single rAF-coalesced draw — so reactive and
 * animated targets are followed for free. Cycles are detected here and reported,
 * never resolved (the cyclic objects fall back to their own `at`/origin).
 */

/** Unit direction vectors in DATA space (y points up). Diagonals normalized. */
const S = Math.SQRT1_2;
export const DIRECTIONS: Record<string, [number, number]> = {
  up: [0, 1],
  down: [0, -1],
  left: [-1, 0],
  right: [1, 0],
  "up-left": [-S, S],
  "up-right": [S, S],
  "down-left": [-S, -S],
  "down-right": [S, -S],
};

export function directionVector(dir: string | undefined): [number, number] {
  return DIRECTIONS[(dir ?? "right").toLowerCase()] ?? DIRECTIONS.right!;
}

export interface PlaceItem {
  name: string;
  /** Name of the object this one is placed next_to, if any. */
  nextTo?: string;
}

/**
 * Topologically order objects so every `next_to` target precedes its follower.
 * Returns the order (objects in a cycle, or pointing at an unknown target, keep
 * source order with placement disabled) and the list of names caught in a cycle.
 */
export function placementOrder(items: PlaceItem[]): { order: string[]; cycles: string[] } {
  const byName = new Map(items.map((i) => [i.name, i]));
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 in-stack, 2 done
  const order: string[] = [];
  const cycles = new Set<string>();

  const visit = (name: string, stack: string[]): void => {
    const s = state.get(name) ?? 0;
    if (s === 2) return;
    if (s === 1) {
      // back-edge → cycle; mark everyone from the target onward in the stack
      const i = stack.indexOf(name);
      for (const n of stack.slice(i)) cycles.add(n);
      cycles.add(name);
      return;
    }
    state.set(name, 1);
    const item = byName.get(name);
    const target = item?.nextTo;
    if (target && byName.has(target)) visit(target, [...stack, name]);
    state.set(name, 2);
    order.push(name);
  };

  for (const i of items) visit(i.name, []);
  // Objects in a cycle still appear (in source order) but with placement off.
  return { order, cycles: [...cycles] };
}

/**
 * Dependency ordering for code cells — the deterministic core of the compute
 * layer, kept pure (no DOM) so it can be unit-tested directly.
 *
 * Cells communicate by *name*: a cell `exposes` named values and `imports`
 * named values produced by other cells. From those names we derive a directed
 * graph (edge producer → consumer), topologically sort it so cells evaluate in
 * dependency order rather than document order, and report any cells caught in a
 * cycle instead of looping forever.
 */

export interface CellSpec {
  id: string;
  /** Names this cell reads from other cells (via `theia.imports.<name>`). */
  imports: string[];
  /** Names this cell publishes (via `theia.expose(name, …)`). */
  exposes: string[];
}

export interface CellPlan {
  /** Cell ids in a valid evaluation order (producers before consumers). */
  order: string[];
  /** Cell ids that cannot be ordered because they sit on a dependency cycle. */
  cyclic: string[];
}

/**
 * Generic Kahn topological sort over an id→prerequisite-ids adjacency map.
 * Returns the ordered ids and any ids left unresolved (i.e. on a cycle).
 * Deterministic: ties are broken by the input order of `ids`.
 */
export function topologicalOrder(
  ids: string[],
  prerequisites: Map<string, string[]>,
): { order: string[]; cyclic: string[] } {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // prereq → ids that need it
  for (const id of ids) {
    indegree.set(id, 0);
    dependents.set(id, []);
  }
  for (const id of ids) {
    const deps = prerequisites.get(id) ?? [];
    // Keep self-edges: a cell importing its own expose is a (self-)cycle and
    // should be reported, not silently ordered.
    const unique = new Set(deps.filter((d) => indegree.has(d)));
    indegree.set(id, unique.size);
    for (const d of unique) dependents.get(d)!.push(id);
  }

  // Seed the queue in input order for deterministic output.
  const queue = ids.filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const dep of dependents.get(id)!) {
      const d = indegree.get(dep)! - 1;
      indegree.set(dep, d);
      if (d === 0) queue.push(dep);
    }
  }

  const ordered = new Set(order);
  const cyclic = ids.filter((id) => !ordered.has(id));
  return { order, cyclic };
}

/**
 * Plan cell evaluation from their import/expose names. A cell that imports a
 * name no cell exposes simply has no incoming edge for it (it reads a slider or
 * an undefined). A cell that imports its own expose is a self-cycle.
 */
export function planCells(cells: CellSpec[]): CellPlan {
  // Map each exposed name to the cell that produces it (first writer wins).
  const producer = new Map<string, string>();
  for (const cell of cells) {
    for (const name of cell.exposes) {
      if (!producer.has(name)) producer.set(name, cell.id);
    }
  }

  const ids = cells.map((c) => c.id);
  const prerequisites = new Map<string, string[]>();
  for (const cell of cells) {
    const prereqs: string[] = [];
    for (const name of cell.imports) {
      const from = producer.get(name);
      if (from !== undefined) prereqs.push(from);
    }
    prerequisites.set(cell.id, prereqs);
  }

  return topologicalOrder(ids, prerequisites);
}

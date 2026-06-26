/**
 * A minimal Observable-style reactive dependency graph.
 *
 * Sliders are the only *sources*; reactive math elements and plots are
 * *dependents* that read one or more source variables. The graph is depth-1
 * (no dependent feeds another), so an update is just: set a source, then run
 * every dependent that reads it — synchronously. The API takes `deps: string[]`
 * so deeper chains could be added later without changing call sites.
 */

export interface Dependent {
  deps: string[];
  run: () => void;
}

export class ReactiveGraph {
  private readonly values = new Map<string, number>();
  private readonly dependents: Dependent[] = [];
  /** var name → dependents that read it (built lazily as deps register). */
  private readonly byVar = new Map<string, Dependent[]>();

  /** Declare or update a reactive source value (does not auto-run). */
  setValue(name: string, value: number): void {
    this.values.set(name, value);
  }

  get(name: string): number | undefined {
    return this.values.get(name);
  }

  /** Snapshot of all current source values, for evaluators that want a scope. */
  scope(): Record<string, number> {
    return Object.fromEntries(this.values);
  }

  addDependent(deps: string[], run: () => void): Dependent {
    const dep: Dependent = { deps, run };
    this.dependents.push(dep);
    for (const v of deps) {
      const list = this.byVar.get(v);
      if (list) list.push(dep);
      else this.byVar.set(v, [dep]);
    }
    return dep;
  }

  /** Set a source and synchronously re-run every dependent that reads it. */
  update(name: string, value: number): void {
    this.setValue(name, value);
    const affected = this.byVar.get(name);
    if (!affected) return;
    for (const dep of affected) dep.run();
  }

  /** Run every dependent once — the initial paint after the graph is built. */
  runAll(): void {
    for (const dep of this.dependents) dep.run();
  }
}

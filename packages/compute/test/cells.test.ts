import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { initCells, type ReactiveLike } from "../src/cells.js";

/** A stand-in for the runtime's ReactiveGraph implementing just what the
 * compute layer uses, plus an `update` to fire dependents synchronously. */
class StubGraph implements ReactiveLike {
  private values = new Map<string, number>();
  private deps: { deps: string[]; run: () => void }[] = [];
  set(name: string, v: number): void {
    this.values.set(name, v);
  }
  get(name: string): number | undefined {
    return this.values.get(name);
  }
  addDependent(deps: string[], run: () => void): unknown {
    const dep = { deps, run };
    this.deps.push(dep);
    return dep;
  }
  update(name: string, v: number): void {
    this.values.set(name, v);
    for (const d of this.deps) if (d.deps.includes(name)) d.run();
  }
}

function cellHtml(source: string): string {
  return `<div class="theia-code theia-cell" data-theia-cell="js">
    <pre class="theia-code__source"><code>${source}</code></pre>
    <div class="theia-cell__output"></div>
    <div class="theia-cell__error" hidden></div>
  </div>`;
}

/** Mount cell markup into a fresh document and expose it as the global. */
function mount(sources: string[]): Document {
  const dom = new JSDOM(`<body>${sources.map(cellHtml).join("")}</body>`, {
    pretendToBeVisual: true,
  });
  (globalThis as unknown as { document: Document }).document =
    dom.window.document;
  return dom.window.document;
}

afterEach(() => {
  delete (globalThis as unknown as { document?: Document }).document;
});

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 40));

function outputs(doc: Document): string[] {
  return Array.from(doc.querySelectorAll(".theia-cell__output")).map(
    (el) => el.textContent?.trim() ?? "",
  );
}
function errors(doc: Document): string[] {
  return Array.from(doc.querySelectorAll(".theia-cell__error")).map((el) =>
    (el as HTMLElement).hidden ? "" : (el.textContent ?? ""),
  );
}

describe("initCells — execution & reactivity", () => {
  it("runs a cell on load and emits its output", () => {
    const doc = mount([`theia.text("hello " + (2 + 2));`]);
    initCells(new StubGraph());
    expect(outputs(doc)[0]).toBe("hello 4");
  });

  it("reads a slider and re-runs when the slider moves", async () => {
    const doc = mount([`theia.tex("slope = " + (2 * theia.slider("a")));`]);
    const g = new StubGraph();
    g.set("a", 1);
    initCells(g);
    expect(outputs(doc)[0]).toContain("slope = 2");

    g.update("a", 3); // drag the slider
    await tick(); // re-run is coalesced to a frame/timeout
    expect(outputs(doc)[0]).toContain("slope = 6");
  });

  it("isolates a throwing cell: it shows an inline error, others still run", () => {
    const doc = mount([
      `throw new Error("boom");`,
      `theia.text("still works");`,
    ]);
    initCells(new StubGraph());
    expect(errors(doc)[0]).toContain("boom");
    expect(outputs(doc)[1]).toBe("still works");
  });

  it("reports a compile (syntax) error inline without throwing", () => {
    const doc = mount([`this is not ) valid js (`]);
    expect(() => initCells(new StubGraph())).not.toThrow();
    expect(errors(doc)[0]).toMatch(/Error:/);
  });

  it("evaluates in dependency order, not document order", () => {
    // The consumer is written first but must run after the producer.
    const doc = mount([
      `theia.text("got " + theia.imports.k);`,
      `theia.expose("k", 42);`,
    ]);
    initCells(new StubGraph());
    expect(outputs(doc)[0]).toBe("got 42");
  });

  it("reports mutually-dependent cells as a circular dependency", () => {
    const doc = mount([
      `theia.imports.y; theia.expose("x", 1);`,
      `theia.imports.x; theia.expose("y", 1);`,
    ]);
    initCells(new StubGraph());
    const errs = errors(doc);
    expect(errs[0]).toContain("circular");
    expect(errs[1]).toContain("circular");
  });
});

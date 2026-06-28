import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { initCells, type ReactiveLike } from "../src/cells.js";
import type { PyodideLike } from "../src/pyodide-host.js";

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
    this.deps.push({ deps, run });
    return null;
  }
}

/** A fake Pyodide that records calls instead of running Python. It can be told
 * to throw for a given source to simulate a Python traceback. */
class FakePyodide implements PyodideLike {
  runCalls: string[] = [];
  loaded: string[] = [];
  bridge: unknown = null;
  globals = {
    set: (name: string, value: unknown): void => {
      if (name === "_theia_bridge") this.bridge = value;
    },
  };
  async loadPackage(names: string[]): Promise<unknown> {
    this.loaded.push(...names);
    return undefined;
  }
  async runPythonAsync(code: string): Promise<unknown> {
    this.runCalls.push(code);
    if (code.includes("BOOM")) {
      throw new Error(
        'Traceback (most recent call last):\n  File "<exec>", line 1\nValueError: boom',
      );
    }
    return undefined;
  }
  /** Cell sources actually executed, excluding the one-time preamble. */
  cellRuns(): string[] {
    return this.runCalls.filter((c) => !c.includes("_Theia"));
  }
}

function cellHtml(lang: "js" | "py", source: string): string {
  return `<div class="chalk-code chalk-cell" data-chalk-cell="${lang}">
    <pre class="chalk-code__source"><code>${source}</code></pre>
    <div class="chalk-cell__output"></div>
    <div class="chalk-cell__error" hidden></div>
  </div>`;
}

function mount(specs: { lang: "js" | "py"; source: string }[]): Document {
  const dom = new JSDOM(
    `<body>${specs.map((s) => cellHtml(s.lang, s.source)).join("")}</body>`,
    { pretendToBeVisual: true },
  );
  (globalThis as unknown as { document: Document }).document =
    dom.window.document;
  return dom.window.document;
}

afterEach(() => {
  delete (globalThis as unknown as { document?: Document }).document;
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

function errorText(doc: Document, i: number): string {
  const el = doc.querySelectorAll(".chalk-cell__error")[i] as HTMLElement;
  return el.hidden ? "" : (el.textContent ?? "");
}

describe("lazy-load gating", () => {
  it("never loads Pyodide for a JS-only deck", async () => {
    mount([{ lang: "js", source: 'theia.text("hi");' }]);
    let called = false;
    initCells(new StubGraph(), {
      pyodide: () => {
        called = true;
        return Promise.resolve(new FakePyodide());
      },
    });
    await flush();
    expect(called).toBe(false);
  });

  it("loads Pyodide (once) only when a py cell is present", async () => {
    mount([
      { lang: "js", source: 'theia.text("hi");' },
      { lang: "py", source: "import sympy\ntheia.text('hello')" },
    ]);
    let calls = 0;
    const fake = new FakePyodide();
    initCells(new StubGraph(), {
      pyodide: () => {
        calls += 1;
        return Promise.resolve(fake);
      },
    });
    await flush();
    expect(calls).toBe(1);
    // It loaded the package the cell imports, and ran the preamble first.
    expect(fake.loaded).toContain("sympy");
    expect(fake.runCalls[0]).toContain("_Theia"); // preamble before any cell
  });
});

describe("python execution path (fake interpreter)", () => {
  it("runs py cells in dependency order across languages", async () => {
    // Producer (py) exposes 'deriv'; consumer (py) imports it. Producer first.
    mount([
      { lang: "py", source: 'theia.imported("deriv")  # consumer' },
      { lang: "py", source: 'theia.expose("deriv", "2*a*x")  # producer' },
    ]);
    const fake = new FakePyodide();
    initCells(new StubGraph(), { pyodide: () => Promise.resolve(fake) });
    await flush();
    const runs = fake.cellRuns();
    expect(runs[0]).toContain("producer");
    expect(runs[1]).toContain("consumer");
  });

  it("isolates a throwing py cell: traceback inline, others still run", async () => {
    mount([
      { lang: "py", source: "raise ValueError  # BOOM" },
      { lang: "py", source: 'theia.text("ok")  # healthy' },
    ]);
    const fake = new FakePyodide();
    initCells(new StubGraph(), { pyodide: () => Promise.resolve(fake) });
    await flush();
    // Broken cell shows the compact traceback tail.
    expect(errorText(mountDoc(), 0)).toContain("ValueError: boom");
    // Healthy cell ran and has no error.
    expect(errorText(mountDoc(), 1)).toBe("");
    expect(fake.cellRuns().some((c) => c.includes("healthy"))).toBe(true);
  });

  it("shows a calm loading state before the interpreter resolves", async () => {
    mount([{ lang: "py", source: 'theia.text("x")' }]);
    let resolveFn: (p: PyodideLike) => void = () => {};
    const pending = new Promise<PyodideLike>((res) => {
      resolveFn = res;
    });
    initCells(new StubGraph(), { pyodide: () => pending });
    // Before Pyodide resolves, the cell shows the loading message.
    const loading = mountDoc().querySelector(".chalk-cell__loading");
    expect(loading?.textContent ?? "").toMatch(/Python|Preparing/i);
    resolveFn(new FakePyodide());
    await flush();
  });
});

/** The most recently mounted document (the global the engine reads). */
function mountDoc(): Document {
  return (globalThis as unknown as { document: Document }).document;
}

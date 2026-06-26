/**
 * Static discovery for Python (`py`) cells — pure, no DOM, no Pyodide.
 *
 * JS cells learn their dependencies by *running* once; we cannot run Python
 * before Pyodide has loaded (and we want to plan the dependency order, and
 * decide which packages to download, *before* paying that cost). So for py
 * cells we read the dependencies straight out of the source text:
 *   - sliders read:   chalk.slider("a")
 *   - cell imports:   chalk.imported("slope")
 *   - cell exposes:   chalk.expose("deriv", …)
 *   - packages:       import numpy / from sympy import …  → Pyodide packages
 *
 * This is deliberately syntactic (a teaching tool's cells are short and plain).
 * It never executes code, so it is safe and instant.
 */

/** Python import roots that map to a loadable Pyodide package. Stdlib modules
 * (io, base64, math, …) are intentionally absent — they need no download. */
const PACKAGE_BY_ROOT: Record<string, string> = {
  numpy: "numpy",
  scipy: "scipy",
  sympy: "sympy",
  matplotlib: "matplotlib",
  pandas: "pandas",
  networkx: "networkx",
  sklearn: "scikit-learn",
  PIL: "Pillow",
  statsmodels: "statsmodels",
};

function matchAll(re: RegExp, source: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(source)) !== null) {
    if (m[1] !== undefined) out.push(m[1]);
  }
  return out;
}

export interface PythonDiscovery {
  sliders: string[];
  imports: string[];
  exposes: string[];
  /** Pyodide package names this cell needs loaded. */
  packages: string[];
}

/** Discover a single py cell's dependencies and required packages. */
export function discoverPython(source: string): PythonDiscovery {
  const sliders = new Set(
    matchAll(/chalk\.slider\(\s*["']([^"']+)["']/g, source),
  );
  const imports = new Set(
    matchAll(/chalk\.imported\(\s*["']([^"']+)["']/g, source),
  );
  const exposes = new Set(
    matchAll(/chalk\.expose\(\s*["']([^"']+)["']/g, source),
  );

  const packages = new Set<string>();
  // `import numpy as np`, `import numpy.linalg`, `from sympy import symbols`
  const roots = matchAll(
    /^[ \t]*(?:import|from)[ \t]+([A-Za-z_][\w]*)/gm,
    source,
  );
  for (const root of roots) {
    const pkg = PACKAGE_BY_ROOT[root];
    if (pkg) packages.add(pkg);
  }

  return {
    sliders: [...sliders],
    imports: [...imports],
    exposes: [...exposes],
    packages: [...packages],
  };
}

/** Union of Pyodide packages needed across several py cell sources. */
export function pythonPackages(sources: string[]): string[] {
  const set = new Set<string>();
  for (const src of sources) {
    for (const pkg of discoverPython(src).packages) set.add(pkg);
  }
  return [...set];
}

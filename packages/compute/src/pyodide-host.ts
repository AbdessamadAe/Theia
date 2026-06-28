/**
 * Lazy, one-time Pyodide loader (browser only).
 *
 * Pyodide and its packages are fetched from the official CDN — this is the one
 * part of a Theia deck that needs network access, and ONLY for decks that
 * contain a `py` cell. The interpreter is created once and reused for every
 * cell and every slider-driven re-run; the heavy download/init never repeats.
 * (Browsers cache the CDN assets, so repeat visits are much faster.)
 */

/** The minimal slice of the Pyodide API the compute layer uses. */
export interface PyodideLike {
  runPythonAsync(code: string): Promise<unknown>;
  loadPackage(names: string[]): Promise<unknown>;
  globals: { set(name: string, value: unknown): void };
}

/** Factory signature, so tests can inject a fake interpreter. */
export type PyodideFactory = (
  onStatus: (message: string) => void,
) => Promise<PyodideLike>;

/** Pinned Pyodide version. The full CDN distribution serves the matching
 * package wheels from the same indexURL. */
const PYODIDE_VERSION = "0.26.4";
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let scriptPromise: Promise<void> | null = null;
let enginePromise: Promise<PyodideLike> | null = null;

function injectScript(src: string): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-chalk-pyodide]`,
    );
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.setAttribute("data-chalk-pyodide", "");
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load Pyodide from the CDN (needs network)."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Load (once) and return the Pyodide interpreter. Subsequent calls return the
 * same cached promise. `onStatus` reports human-readable progress for the
 * loading state shown on affected slides.
 */
export const loadPyodideEngine: PyodideFactory = (onStatus) => {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    onStatus("Preparing the Python runtime… (first load only)");
    await injectScript(`${INDEX_URL}pyodide.js`);
    const loader = (
      globalThis as unknown as {
        loadPyodide?: (opts: { indexURL: string }) => Promise<PyodideLike>;
      }
    ).loadPyodide;
    if (!loader) throw new Error("Pyodide loader unavailable after script load.");
    const py = await loader({ indexURL: INDEX_URL });
    return py;
  })();
  return enginePromise;
};

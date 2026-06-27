/**
 * Lazy three.js loader (browser only), mirroring the Pyodide host.
 *
 * three.js is fetched from the CDN — the one network dependency of a 3D deck,
 * and ONLY for decks that contain a 3D object. The module is imported once and
 * the namespace cached; the WebGL renderer is created per scene by the caller.
 * (Browsers cache the CDN module, so repeat visits are fast.)
 *
 * The dynamic import is done through `Function` so the bundler leaves it as a
 * native runtime `import()` of the CDN URL rather than trying to bundle three.
 */

/** The three.js module namespace (types only; loaded at runtime from the CDN). */
export type ThreeModule = typeof import("three");

export type ThreeFactory = (
  onStatus: (message: string) => void,
) => Promise<ThreeModule>;

const THREE_VERSION = "0.160.0";
const MODULE_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js`;

const dynamicImport = (url: string): Promise<unknown> =>
  (new Function("u", "return import(u)") as (u: string) => Promise<unknown>)(url);

let modulePromise: Promise<ThreeModule> | null = null;

/** Load (once) and return the three.js module. Subsequent calls share it. */
export const loadThree: ThreeFactory = (onStatus) => {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    onStatus("Loading the 3D engine… (first load only)");
    const mod = (await dynamicImport(MODULE_URL)) as ThreeModule;
    return mod;
  })();
  return modulePromise;
};

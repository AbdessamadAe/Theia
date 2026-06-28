/**
 * Browser entry for the compute layer. Bundled (via esbuild) into the deck as
 * part of the runtime. `initCells` is invoked by the runtime's reactive setup,
 * which hands over the shared dependency graph. Handles both `js` and `py`
 * cells; Pyodide loads lazily and only if the deck contains a py cell.
 */
export {
  initCells,
  type ReactiveLike,
  type TheiaApi,
  type ComputeOptions,
} from "./cells.js";
export {
  loadPyodideEngine,
  type PyodideFactory,
  type PyodideLike,
} from "./pyodide-host.js";

/**
 * Browser entry for the compute layer. Bundled (via esbuild) into the deck as
 * part of the runtime. `initCells` is invoked by the runtime's reactive setup,
 * which hands over the shared dependency graph.
 */
export { initCells, type ReactiveLike, type ChalkApi } from "./cells.js";

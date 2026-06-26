/**
 * @chalk/compute — the compute layer that runs JavaScript code cells inside the
 * reactive runtime. The browser engine lives in `./browser` (bundled into the
 * deck). This index re-exports the *pure*, DOM-free dependency-ordering core so
 * it can be unit-tested in Node.
 */
export {
  planCells,
  topologicalOrder,
  type CellSpec,
  type CellPlan,
} from "./order.js";

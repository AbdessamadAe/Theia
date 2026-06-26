/**
 * @chalk/runtime — the client-side reactive runtime for Chalk decks.
 *
 * The browser bundle is built from `./browser` (esbuild → a single IIFE inlined
 * by render-slides). This index re-exports the *pure*, DOM-free pieces — the
 * token-aware LaTeX substitution and the plot-expression evaluator — so they
 * can be unit-tested in Node and reused at build time by the renderer.
 */
export {
  tokenizeLatex,
  substituteLatex,
  referencedVars,
  formatValue,
  type LatexToken,
} from "./substitution.js";

export { compileExpr, type CompiledExpr } from "./expr.js";

export { ReactiveGraph, type Dependent } from "./graph.js";

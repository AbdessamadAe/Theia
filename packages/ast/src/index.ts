/**
 * @chalk/ast — the shared AST node types.
 *
 * This package is the *contract* between the parser and every renderer. It has
 * no runtime dependencies and no logic beyond the type definitions and a few
 * pure helpers (type guards, a node-walker). The parser produces these nodes;
 * renderers consume them. Neither side imports the other.
 *
 * The tree is intentionally richer than the current slide renderer needs: it is
 * designed to carry a *complete lecture* so that future renderers (notes, PDF)
 * and the future reactive runtime can be added without changing the parser.
 *   - a stepped block stores its steps as structured children (not flattened),
 *   - a slider stores its full name/min/max/default range,
 *   - a plot records both its raw expression and the slider variables it reads,
 *   - a code cell stores its language and verbatim source.
 */

// ---------------------------------------------------------------------------
// Source locations
// ---------------------------------------------------------------------------

/** A point in the source file. `line` and `column` are 1-based; `offset` is a
 * 0-based character index into the original string. */
export interface Position {
  line: number;
  column: number;
  offset: number;
}

/** The source span a node was parsed from. Present on every node so that tools
 * (diagnostics, editors, future source maps) can map a node back to text. */
export interface SourceLocation {
  start: Position;
  end: Position;
}

/** Common shape shared by every node in the tree. */
export interface NodeBase {
  type: string;
  loc: SourceLocation;
}

// ---------------------------------------------------------------------------
// Document & slides
// ---------------------------------------------------------------------------

/** Root of the tree. One `.chalk` file parses to exactly one Document. */
export interface DocumentNode extends NodeBase {
  type: "document";
  /** Plain-text title taken from a leading `# Title`, if the file has one. */
  title?: string;
  children: Slide[];
}

/** A single slide. `title` slides come from `#`; `content` slides from `##`. */
export interface Slide extends NodeBase {
  type: "slide";
  kind: "title" | "content";
  /** Rich heading content — may contain inline math, emphasis, etc. */
  heading: Inline[];
  children: Block[];
}

// ---------------------------------------------------------------------------
// Block-level nodes
// ---------------------------------------------------------------------------

export type Block =
  | Paragraph
  | TheoremBlock
  | DisplayMath
  | CodeCell
  | Slider
  | Plot
  | GeoBlock
  | ListBlock
  | DeriveBlock;

/** A run of prose. Its children are inline nodes (text, inline math, …). */
export interface Paragraph extends NodeBase {
  type: "paragraph";
  children: Inline[];
}

/** The theorem family: visually distinct, semantically structured blocks. */
export type TheoremKind =
  | "definition"
  | "theorem"
  | "lemma"
  | "proof"
  | "example"
  | "remark";

/**
 * A `:::definition Name … :::` block (and its theorem-family siblings).
 *
 * Body content that is *not* a step lives in `children`. Revealable `+step`
 * lines are stored separately in `steps` as structured {@link Step} nodes, so
 * the future runtime can reveal them one at a time without any parser change.
 */
export interface TheoremBlock extends NodeBase {
  type: "theorem";
  kind: TheoremKind;
  /** Optional label after the keyword, e.g. `definition Limit` → "Limit". */
  title?: string;
  children: Block[];
  steps: Step[];
}

/** One revealable `+step` line inside a theorem-family block. */
export interface Step extends NodeBase {
  type: "step";
  /** 0-based position among the steps of its parent block. */
  index: number;
  children: Block[];
}

/** A `$$…$$` display-math block. `tex` is the verbatim KaTeX source. */
export interface DisplayMath extends NodeBase {
  type: "math";
  display: true;
  tex: string;
}

/** A fenced code cell. Execution is a future (compute-layer) concern; for now
 * the source is stored verbatim with its declared language. */
export interface CodeCell extends NodeBase {
  type: "code";
  lang: "js" | "py";
  source: string;
}

/** A `@slider name [min,max] = default` reactive control declaration. */
export interface Slider extends NodeBase {
  type: "slider";
  name: string;
  min: number;
  max: number;
  default: number;
  /** Optional explicit step increment; the runtime picks a default otherwise. */
  step?: number;
}

/** Follower kinds that can track a plot's point (Manim "updaters"). */
export type PlotFollower = "tangent" | "dropline" | "label";

/** A `@plot expr` declaration, optionally with a tracking point + followers. */
export interface Plot extends NodeBase {
  type: "plot";
  /** The right-hand side actually plotted (e.g. `a*x^2`). */
  expr: string;
  /** If written as `f(x) = …`, the declared left-hand side (e.g. `f(x)`). */
  lhs?: string;
  /** Slider variable names that appear in `expr` — the live dependencies. */
  vars: string[];
  /** `@point P = (t, f(t))`: the point's x-expression (it rides the curve). */
  pointX?: string;
  /** Optional name of the tracking point (from `@point P = …`). */
  pointName?: string;
  /** `@follow …` attachments that track the point live. */
  follows?: PlotFollower[];
}

/** A `:::geo … :::` geometry block; `source` is its verbatim body. */
export interface GeoBlock extends NodeBase {
  type: "geo";
  source: string;
}

/** A bulleted or numbered list. Each item is its own sequence of blocks. */
export interface ListBlock extends NodeBase {
  type: "list";
  ordered: boolean;
  items: Block[][];
}

/** What drives a `:::derive` block's transitions between states. */
export type DeriveDriver = "advance" | "slider";

/**
 * A `:::derive` block: an ordered sequence of equation states that morph into
 * one another. The first `$$…$$` is the initial state; each `+to $$…$$` appends
 * the next state.
 *
 * Designed to serve future animation pillars without a parser change:
 *   - `driver` distinguishes advance-driven (wired now) from slider-driven
 *     morphs (`:::derive bind=a` parses to `"slider"`/`bind`, not yet wired),
 *   - each {@link DeriveState} can carry `emphasis` keys for the future
 *     highlight/emphasis pillar.
 *
 * Author match hints are expressed inside the tex via KaTeX `\htmlClass{ck-…}`,
 * so the matcher needs no extra AST field.
 */
export interface DeriveBlock extends NodeBase {
  type: "derive";
  driver: DeriveDriver;
  /** Slider name when `driver === "slider"`. */
  bind?: string;
  states: DeriveState[];
}

/** An emphasis effect fired on arrival at a derive state (Part C). */
export type EmphasisEffect = "highlight" | "pulse" | "circumscribe";

/** A single `+emphasize [effect] [target]` directive. `target` is the marked
 * sub-expression text (`\mark{…}`); omitted means every mark in the state. */
export interface EmphasisSpec {
  effect: EmphasisEffect;
  target?: string;
}

/** One state of a {@link DeriveBlock}. `tex` is the verbatim KaTeX source. */
export interface DeriveState extends NodeBase {
  type: "deriveState";
  tex: string;
  /** `+emphasize` directives fired when this state is reached. */
  emphasis?: EmphasisSpec[];
}

// ---------------------------------------------------------------------------
// Inline-level nodes
// ---------------------------------------------------------------------------

export type Inline = Text | InlineMath | Strong | Emphasis | InlineCode;

export interface Text extends NodeBase {
  type: "text";
  value: string;
}

/** Inline `$…$` math. `tex` is the verbatim KaTeX source. */
export interface InlineMath extends NodeBase {
  type: "inlineMath";
  tex: string;
}

export interface Strong extends NodeBase {
  type: "strong";
  children: Inline[];
}

export interface Emphasis extends NodeBase {
  type: "emphasis";
  children: Inline[];
}

export interface InlineCode extends NodeBase {
  type: "inlineCode";
  value: string;
}

// ---------------------------------------------------------------------------
// Convenience unions & guards
// ---------------------------------------------------------------------------

/** Any node in the tree. */
export type AnyNode = DocumentNode | Slide | Step | Block | DeriveState | Inline;

const BLOCK_TYPES = new Set<string>([
  "paragraph",
  "theorem",
  "math",
  "code",
  "slider",
  "plot",
  "geo",
  "list",
  "derive",
]);

const INLINE_TYPES = new Set<string>([
  "text",
  "inlineMath",
  "strong",
  "emphasis",
  "inlineCode",
]);

export function isBlock(node: AnyNode): node is Block {
  return BLOCK_TYPES.has(node.type);
}

export function isInline(node: AnyNode): node is Inline {
  return INLINE_TYPES.has(node.type);
}

/** The set of recognized theorem-family keywords, for parser/renderer reuse. */
export const THEOREM_KINDS: readonly TheoremKind[] = [
  "definition",
  "theorem",
  "lemma",
  "proof",
  "example",
  "remark",
];

/** Return the direct children of a node, or `[]` for leaf nodes. Useful for
 * generic tree walks in renderers without re-deriving the shape each time. */
export function childrenOf(node: AnyNode): AnyNode[] {
  switch (node.type) {
    case "document":
      return node.children;
    case "slide":
      return [...node.heading, ...node.children];
    case "theorem":
      return [...node.children, ...node.steps];
    case "step":
      return node.children;
    case "paragraph":
    case "strong":
    case "emphasis":
      return node.children;
    case "list":
      return node.items.flat();
    case "derive":
      return node.states;
    default:
      return [];
  }
}

/** Depth-first pre-order walk over the tree, invoking `visit` on every node. */
export function walk(node: AnyNode, visit: (node: AnyNode) => void): void {
  visit(node);
  for (const child of childrenOf(node)) walk(child, visit);
}

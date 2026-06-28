/**
 * Insert-palette snippets: ready-to-edit Theia skeletons with CodeMirror
 * tab-stops (`${1:field}`; reused `${1}` links). Each is a minimal VALID
 * construct. Container-requiring snippets carry both a `template` (standalone,
 * wrapped in its container) and an `inside` form (bare, used when the caret is
 * already inside that container) — see lib/insert.ts for the resolution rule.
 */

export type Category =
  | "structure"
  | "math"
  | "theorem"
  | "graphing"
  | "animation"
  | "code"
  | "geometry"
  | "3d";

export interface SnippetDef {
  id: string;
  label: string;
  category: Category;
  /** Standalone template (wrapped in its container, if any). */
  template: string;
  /** Bare template used when the caret is already inside `container`. */
  inside?: string;
  /** Required enclosing block kind for the bare form. */
  container?: "scene" | "scene3d" | "derive" | "theorem";
  /** Insert inline at the caret (not on its own line). */
  inline?: boolean;
}

const js = [
  "```js",
  'const a = chalk.slider("${1:a}");',
  'chalk.tex("f\'(1) = 2a = " + (2 * a).toFixed(2));',
  "```",
].join("\n");

const py = [
  "```py",
  "import sympy as sp",
  'x = sp.Symbol("x")',
  'a = chalk.slider("${1:a}")',
  'chalk.tex("f\'(x) = " + sp.latex(sp.diff(a * x**2, x)))',
  "```",
].join("\n");

const sceneWrap = [
  ":::scene",
  "@axes ${1:ax} x:[-3, 3] y:[-1, 9] grid",
  "@plot ${2:f} on ${1} : ${3:a*x^2}",
  ":::",
].join("\n");

const scene3dWrap = [
  ":::scene3d",
  "@axes3d ${1:ax} x:[-3,3] y:[-3,3] z:[0,9]",
  "@surface ${2:f} on ${1} : ${3:a*(x^2 + y^2)} colorscale:height",
  "@camera cam phi:62 theta:-35 distance:9 autorotate",
  ":::",
].join("\n");

const deriveWrap = [
  ":::derive",
  "$$ ${1:a x^2 + b x + c} $$",
  "+to $$ ${2:a(x + h)^2 + k} $$",
  ":::",
].join("\n");

export const SNIPPETS: SnippetDef[] = [
  // structure
  { id: "slide", label: "Slide (## heading)", category: "structure", template: "## ${1:Heading}\n\n${2:Body text.}\n" },
  { id: "title", label: "Title slide (# title)", category: "structure", template: "# ${1:Title}\n\n${2:Subtitle.}\n" },

  // math
  { id: "math-inline", label: "Inline math  $…$", category: "math", inline: true, template: "$${1:f(x)}$" },
  { id: "math-display", label: "Display math  $$…$$", category: "math", template: "$$ ${1:f(x) = a x^2} $$" },

  // theorem family
  { id: "definition", label: ":::definition", category: "theorem", template: ":::definition ${1:Name}\n${2:Statement.}\n:::" },
  { id: "theorem", label: ":::theorem", category: "theorem", template: ":::theorem ${1:Name}\n${2:Statement.}\n:::" },
  { id: "lemma", label: ":::lemma", category: "theorem", template: ":::lemma ${1:Name}\n${2:Statement.}\n:::" },
  { id: "proof", label: ":::proof (with steps)", category: "theorem", template: ":::proof\n${1:We show …}\n+step ${2:First step.}\n+step ${3:Therefore …} $\\blacksquare$\n:::" },
  { id: "example", label: ":::example", category: "theorem", template: ":::example\n${1:Worked example.}\n:::" },
  {
    id: "step",
    label: "+step (in a theorem)",
    category: "theorem",
    container: "theorem",
    inside: "+step ${1:Next step.}",
    template: ":::proof\n+step ${1:Step.}\n:::",
  },

  // derive / morphing
  { id: "derive", label: ":::derive (two states)", category: "math", template: deriveWrap },
  {
    id: "to",
    label: "+to (next derive state)",
    category: "math",
    container: "derive",
    inside: "+to $$ ${1:next state} $$",
    template: deriveWrap,
  },
  {
    id: "emphasize",
    label: "+emphasize (in derive)",
    category: "math",
    container: "derive",
    inside: "+emphasize ${1:circumscribe} ${2:term}",
    template: ":::derive\n$$ ${1:expr} $$\n+to $$ ${2:expr with \\mark{term}} $$\n+emphasize ${3:circumscribe} ${4:term}\n:::",
  },

  // graphing (2D scene)
  { id: "scene", label: ":::scene (axes + plot)", category: "graphing", template: sceneWrap },
  {
    id: "plot",
    label: "@plot (on axes)",
    category: "graphing",
    container: "scene",
    inside: "@plot ${1:f} on ${2:ax} : ${3:a*x^2}",
    template: sceneWrap,
  },
  {
    id: "axes",
    label: "@axes",
    category: "graphing",
    container: "scene",
    inside: "@axes ${1:ax} x:[${2:-3}, ${3:3}] y:[${4:-1}, ${5:9}] grid",
    template: ":::scene\n@axes ${1:ax} x:[-3, 3] y:[-1, 9] grid\n:::",
  },
  {
    id: "point",
    label: "@point (on axes)",
    category: "graphing",
    container: "scene",
    inside: "@point ${1:P} on ${2:ax} at (${3:t}, ${4:f(t)})",
    template: ":::scene\n@axes ax x:[-3, 3] y:[-1, 9] grid\n@point ${1:P} on ax at (${2:t}, ${3:f(t)})\n:::",
  },
  {
    id: "tangent",
    label: "@tangent (on axes)",
    category: "graphing",
    container: "scene",
    inside: "@tangent ${1:tan} on ${2:ax} to ${3:f} at ${4:P}",
    template: ":::scene\n@axes ax x:[-3, 3] y:[-1, 9] grid\n@plot f on ax : a*x^2\n@point P on ax at (t, f(t))\n@tangent ${1:tan} on ax to f at P\n:::",
  },
  {
    id: "area",
    label: "@area (Riemann)",
    category: "graphing",
    container: "scene",
    inside: "@area ${1:ar} on ${2:ax} under ${3:f} from ${4:0} to ${5:t} rects ${6:12}",
    template: ":::scene\n@axes ax x:[-3, 3] y:[-1, 9] grid\n@plot f on ax : a*x^2\n@area ${1:ar} on ax under f from ${2:0} to ${3:t} rects ${4:12}\n:::",
  },
  {
    id: "label",
    label: "@label (on axes)",
    category: "graphing",
    container: "scene",
    inside: '@label ${1:lab} on ${2:ax} at (${3:0}, ${4:0}) "${5:text}"',
    template: ':::scene\n@axes ax x:[-3, 3] y:[-1, 9] grid\n@label ${1:lab} on ax at (${2:0}, ${3:0}) "${4:text}"\n:::',
  },

  // animation
  { id: "slider", label: "@slider", category: "animation", template: "@slider ${1:a} [${2:0}, ${3:3}] = ${4:1}" },
  {
    id: "animate",
    label: "+animate (in scene)",
    category: "animation",
    container: "scene",
    inside: "+animate ${1:create} ${2:ax}",
    template: ":::scene\n@axes ax x:[-3, 3] y:[-1, 9] grid\n@plot f on ax : a*x^2\n+animate ${1:write} ${2:f}\n:::",
  },

  // code
  { id: "js", label: "JavaScript cell", category: "code", template: js },
  { id: "py", label: "Python cell (Pyodide)", category: "code", template: py },

  // geometry
  { id: "geo", label: ":::geo (GeoGebra)", category: "geometry", template: ":::geo\n${1:A = Point(1, 0)}\n:::" },

  // 3D
  { id: "scene3d", label: ":::scene3d (surface)", category: "3d", template: scene3dWrap },
  {
    id: "surface",
    label: "@surface (z = f(x,y))",
    category: "3d",
    container: "scene3d",
    inside: "@surface ${1:f} on ${2:ax} : ${3:a*(x^2 + y^2)} colorscale:height",
    template: scene3dWrap,
  },
  {
    id: "dot3d",
    label: "@dot3d",
    category: "3d",
    container: "scene3d",
    inside: "@dot3d ${1:P} on ${2:ax} at (${3:1}, ${4:1}, ${5:2})",
    template: ":::scene3d\n@axes3d ax x:[-3,3] y:[-3,3] z:[0,9]\n@dot3d ${1:P} on ax at (${2:1}, ${3:1}, ${4:2})\n:::",
  },
  {
    id: "camera",
    label: "@camera (3D)",
    category: "3d",
    container: "scene3d",
    inside: "@camera ${1:cam} phi:${2:62} theta:${3:-35} distance:${4:9} autorotate",
    template: ":::scene3d\n@axes3d ax x:[-3,3] y:[-3,3] z:[0,9]\n@surface f on ax : a*(x^2 + y^2) colorscale:height\n@camera ${1:cam} phi:${2:62} theta:${3:-35} distance:${4:9} autorotate\n:::",
  },
];

/** Strip CodeMirror tab-stop syntax to plain text (used by tests + previews). */
export function expandTemplate(tmpl: string): string {
  return tmpl
    .replace(/\$\{\d+:([^}]*)\}/g, "$1")
    .replace(/\$\{\d+\}/g, "")
    .replace(/\$\{\}/g, "");
}

export const CATEGORY_LABELS: Record<Category, string> = {
  structure: "Structure",
  math: "Math & derivations",
  theorem: "Theorems",
  graphing: "Graphing (2D)",
  animation: "Animation & controls",
  code: "Code cells",
  geometry: "Geometry",
  "3d": "3D",
};

/**
 * The single manifest of every `.chalk` snippet shown in the docs. Pages cite
 * snippets by id (so prose can't drift from code), and a test compiles all of
 * them with the real engine (test/docs-examples.test.ts) — docs can't silently
 * rot. Every source here has been verified to compile.
 */
export const DOC_EXAMPLES = {
  // ── Quickstart (built up step by step) ──────────────────────────────────
  "qs-title": `# Continuity\n\nA first look at limits.\n`,
  "qs-slide": `# Continuity\n\nA first look at limits.\n\n## What is a limit?\n\nThe value $f(x)$ approaches as $x \\to a$.\n`,
  "qs-math": `## The definition\n\nWe write\n\n$$ \\lim_{x \\to a} f(x) = L $$\n\nto mean $f(x)$ gets arbitrarily close to $L$.\n`,
  "qs-reactive": `## Explore  $f(x) = a\\,x^2$\n\n@slider a [0.2, 3] = 1.4\n\n:::scene\n@axes ax x:[-3, 3] y:[-1, 9] grid\n@plot f on ax : a*x^2\n:::\n\nDrag **a** — the curve responds.\n`,

  // ── Structure & prose ───────────────────────────────────────────────────
  "structure": `# A Short Lecture\n\nThe subtitle goes here.\n\n## First slide\n\nProse with **bold**, *italic*, and \`code\`.\n\n## Second slide\n\n- a list item\n- another item\n`,
  "math": `## Math\n\nInline math like $e^{i\\pi} + 1 = 0$, and display math:\n\n$$ \\int_0^1 x^2 \\, dx = \\tfrac{1}{3} $$\n`,

  // ── Theorem family + steps ──────────────────────────────────────────────
  "theorem": `## Pythagoras\n\n:::theorem Pythagorean theorem\nFor a right triangle, $a^2 + b^2 = c^2$.\n:::\n\n:::definition Limit\n$f(x) \\to L$ as $x \\to a$.\n:::\n`,
  "proof-steps": `## Proof\n\n:::proof\nWe argue in two steps.\n+step First, drop a perpendicular from the right angle.\n+step The two smaller triangles are similar, so the areas add. $\\blacksquare$\n:::\n`,

  // ── Derivations (morphing) ──────────────────────────────────────────────
  "derive": `## Completing the square\n\n:::derive\n$$ x^2 + 6x + 5 $$\n+to $$ (x + 3)^2 - 4 $$\n:::\n`,
  "derive-emphasis": `## Emphasis\n\n:::derive\n$$ a x^2 + b x + c $$\n+to $$ a\\left(x + \\tfrac{b}{2a}\\right)^2 + c - \\tfrac{b^2}{4a} $$\n+emphasize circumscribe \\tfrac{b}{2a}\n:::\n`,

  // ── Reactivity ──────────────────────────────────────────────────────────
  "slider": `## A control\n\n@slider k [0, 5] = 2 step 0.5\n\nThe value of $k$ is now bound to the slider above.\n`,
  "slider-math": `## Reactive math\n\n@slider a [0, 4] = 2\n\nThe derivative is $f'(x) = 2 a x$ — change $a$ and this updates.\n`,

  // ── 2D scenes ───────────────────────────────────────────────────────────
  "scene-basic": `## A parabola\n\n@slider a [0.2, 3] = 1\n\n:::scene\n@axes ax x:[-3, 3] y:[-1, 9] grid\n@plot f on ax : a*x^2\n:::\n`,
  "scene-area": `## Area under a curve\n\n@slider n [2, 40] = 12\n\n:::scene\n@axes ax x:[-1, 3] y:[-1, 9] grid\n@plot f on ax : x^2\n@area ar on ax under f from 0 to 2 rects n\n:::\n`,
  "scene-tangent": `## Tangent line\n\n@slider t [-2, 2] = 1\n\n:::scene\n@axes ax x:[-3, 3] y:[-1, 9] grid\n@plot f on ax : x^2\n@point P on ax at (t, t^2)\n@tangent tan on ax to f at P\n@label lab on ax at (-2, 7) "slope = 2t"\n:::\n`,
  "scene-animate": `## Built up on advance\n\n:::scene\n@axes ax x:[-3, 3] y:[-1, 9] grid\n@plot f on ax : x^2\n@point P on ax at (1, 1)\n+animate create ax\n+animate write f\n+animate grow P\n:::\n`,
  "scene-numberline": `## A number line\n\n:::scene\n@numberline nl range:[-5, 5]\n@point P on nl at (2, 0)\n:::\n`,

  // ── 3D ──────────────────────────────────────────────────────────────────
  "scene3d-surface": `## A paraboloid\n\n@slider a [0.1, 1] = 0.5\n\n:::scene3d\n@axes3d ax x:[-3,3] y:[-3,3] z:[0,9]\n@surface s on ax : a*(x^2 + y^2) colorscale:height\n@camera cam phi:62 theta:-35 distance:9 autorotate\n:::\n`,
  "scene3d-solids": `## Solids\n\n:::scene3d\n@axes3d ax x:[-3,3] y:[-3,3] z:[-1,3]\n@sphere s on ax at (-1, 0, 1) r:1\n@cube c on ax at (1.5, 0, 1) size:1.4\n@camera cam phi:65 theta:-30 distance:9\n:::\n`,
  "scene3d-vector": `## A 3D vector\n\n:::scene3d\n@axes3d ax x:[-3,3] y:[-3,3] z:[0,4]\n@vector3d v on ax from (0,0,0) to (2, 1, 3)\n@camera cam phi:60 theta:-40 distance:9\n:::\n`,

  // ── Code cells ──────────────────────────────────────────────────────────
  "code-js": "## A JavaScript cell\n\n@slider a [0, 4] = 2\n\n```js\nconst a = chalk.slider(\"a\");\nchalk.tex(\"f'(1) = 2a = \" + (2 * a).toFixed(2));\n```\n",
  "code-py": "## A Python cell\n\n```py\nimport sympy as sp\nx = sp.Symbol(\"x\")\nchalk.tex(sp.latex(sp.diff(x**3, x)))\n```\n",

  // ── Media & geometry ────────────────────────────────────────────────────
  "media-image": `## A figure\n\n@image fig of "https://upload.wikimedia.org/diagram.png" at (0, 0) width:5 alt:"A labelled diagram"\n`,
  "media-video": `## A clip\n\n@video clip of "https://example.com/clip.mp4" width:7 poster:"https://example.com/poster.jpg"\n`,
  "media-markdown": `## Inline image\n\nDrop a figure in prose: ![a small glyph](https://example.com/glyph.png) right here.\n`,
  "geo": `## A construction\n\n:::geo\nA = Point(1, 0)\nB = Point(4, 3)\nSegment(A, B)\n:::\n`,

  // ── Guides ──────────────────────────────────────────────────────────────
  "guide-slider": `## Slope of a line\n\n@slider m [-3, 3] = 1\n\n:::scene\n@axes ax x:[-4, 4] y:[-4, 4] grid\n@plot line on ax : m*x\n:::\n\nThe line $y = m x$ tilts as you drag $m$.\n`,
  "guide-present": `# Linear algebra\n\nWelcome to today's class.\n\n## Vectors\n\nA vector has length and direction.\n`,
} as const;

export type DocExampleId = keyof typeof DOC_EXAMPLES;

export const example = (id: DocExampleId): string => DOC_EXAMPLES[id];

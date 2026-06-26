/**
 * A compact arithmetic expression parser + evaluator for plot expressions.
 *
 * Supports numbers, variables, the binary operators `+ - * / ^` (with `^`
 * right-associative for math-style powers), unary minus, parentheses, and a
 * fixed set of math functions. Slider values are supplied through the eval
 * *scope* — never by string substitution — so identifiers are matched as whole
 * tokens and a slider named `a` can never bleed into a function name or another
 * identifier. No dependencies; small enough to bundle into the deck.
 */

type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "neg"; x: Node }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "^"; l: Node; r: Node }
  | { t: "call"; name: string; args: Node[] };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, sqrt: Math.sqrt, cbrt: Math.cbrt,
  abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sign: Math.sign, ln: Math.log, log: Math.log, log10: Math.log10, log2: Math.log2,
  pow: Math.pow, min: Math.min, max: Math.max, atan2: Math.atan2,
};

const CONSTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

interface Token {
  t: "num" | "id" | "op" | "lparen" | "rparen" | "comma";
  v: string;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;
  const isDigit = (c: string): boolean => c >= "0" && c <= "9";
  const isAlpha = (c: string): boolean =>
    (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";

  while (i < n) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (isDigit(c) || (c === "." && i + 1 < n && isDigit(src[i + 1]!))) {
      let j = i + 1;
      while (j < n && (isDigit(src[j]!) || src[j] === ".")) j++;
      // optional exponent: 1e-3
      if (j < n && (src[j] === "e" || src[j] === "E")) {
        let k = j + 1;
        if (k < n && (src[k] === "+" || src[k] === "-")) k++;
        if (k < n && isDigit(src[k]!)) {
          j = k;
          while (j < n && isDigit(src[j]!)) j++;
        }
      }
      tokens.push({ t: "num", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (isAlpha(c)) {
      let j = i + 1;
      while (j < n && (isAlpha(src[j]!) || isDigit(src[j]!))) j++;
      tokens.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/^".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") { tokens.push({ t: "lparen", v: c }); i++; continue; }
    if (c === ")") { tokens.push({ t: "rparen", v: c }); i++; continue; }
    if (c === ",") { tokens.push({ t: "comma", v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}" in expression`);
  }
  return tokens;
}

/** Recursive-descent / Pratt parser producing a small expression tree. */
class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  parse(): Node {
    const node = this.additive();
    if (this.pos !== this.tokens.length) {
      throw new Error("Unexpected trailing tokens in expression");
    }
    return node;
  }

  private additive(): Node {
    let left = this.multiplicative();
    let tok = this.peek();
    while (tok && tok.t === "op" && (tok.v === "+" || tok.v === "-")) {
      this.next();
      const right = this.multiplicative();
      left = { t: "bin", op: tok.v as "+" | "-", l: left, r: right };
      tok = this.peek();
    }
    return left;
  }

  private multiplicative(): Node {
    let left = this.unary();
    let tok = this.peek();
    while (tok && tok.t === "op" && (tok.v === "*" || tok.v === "/")) {
      this.next();
      const right = this.unary();
      left = { t: "bin", op: tok.v as "*" | "/", l: left, r: right };
      tok = this.peek();
    }
    return left;
  }

  private unary(): Node {
    const tok = this.peek();
    if (tok && tok.t === "op" && (tok.v === "-" || tok.v === "+")) {
      this.next();
      const x = this.unary();
      return tok.v === "-" ? { t: "neg", x } : x;
    }
    return this.power();
  }

  private power(): Node {
    const base = this.primary();
    const tok = this.peek();
    if (tok && tok.t === "op" && tok.v === "^") {
      this.next();
      const exp = this.unary(); // right-associative, allow unary exponent
      return { t: "bin", op: "^", l: base, r: exp };
    }
    return base;
  }

  private primary(): Node {
    const tok = this.next();
    if (!tok) throw new Error("Unexpected end of expression");
    if (tok.t === "num") return { t: "num", v: Number(tok.v) };
    if (tok.t === "lparen") {
      const inner = this.additive();
      const close = this.next();
      if (!close || close.t !== "rparen") throw new Error("Expected )");
      return inner;
    }
    if (tok.t === "id") {
      if (this.peek()?.t === "lparen") {
        this.next(); // consume (
        const args: Node[] = [];
        if (this.peek()?.t !== "rparen") {
          args.push(this.additive());
          while (this.peek()?.t === "comma") {
            this.next();
            args.push(this.additive());
          }
        }
        const close = this.next();
        if (!close || close.t !== "rparen") throw new Error("Expected )");
        return { t: "call", name: tok.v, args };
      }
      return { t: "var", name: tok.v };
    }
    throw new Error(`Unexpected token "${tok.v}"`);
  }
}

function evalNode(node: Node, scope: Record<string, number>): number {
  switch (node.t) {
    case "num":
      return node.v;
    case "var":
      if (Object.prototype.hasOwnProperty.call(scope, node.name)) {
        return scope[node.name]!;
      }
      if (Object.prototype.hasOwnProperty.call(CONSTS, node.name)) {
        return CONSTS[node.name]!;
      }
      return NaN;
    case "neg":
      return -evalNode(node.x, scope);
    case "bin": {
      const l = evalNode(node.l, scope);
      const r = evalNode(node.r, scope);
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return l / r;
        case "^": return Math.pow(l, r);
      }
    }
    // eslint-disable-next-line no-fallthrough
    case "call": {
      const fn = FUNCS[node.name];
      if (!fn) return NaN;
      return fn(...node.args.map((a) => evalNode(a, scope)));
    }
  }
}

function collectVars(node: Node, out: Set<string>): void {
  switch (node.t) {
    case "var":
      if (!(node.name in CONSTS)) out.add(node.name);
      break;
    case "neg":
      collectVars(node.x, out);
      break;
    case "bin":
      collectVars(node.l, out);
      collectVars(node.r, out);
      break;
    case "call":
      for (const a of node.args) collectVars(a, out);
      break;
  }
}

export interface CompiledExpr {
  /** Free variable names (excluding known constants and functions). */
  vars: string[];
  /** Evaluate against a scope of variable values. Returns NaN for gaps. */
  eval(scope: Record<string, number>): number;
}

/** Parse an arithmetic expression into a reusable compiled evaluator. */
export function compileExpr(src: string): CompiledExpr {
  const tree = new Parser(tokenize(src)).parse();
  const vars = new Set<string>();
  collectVars(tree, vars);
  return {
    vars: [...vars],
    eval: (scope) => evalNode(tree, scope),
  };
}

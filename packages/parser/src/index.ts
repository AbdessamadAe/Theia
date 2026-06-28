import type {
  Block,
  CodeCell,
  DeriveBlock,
  DeriveDriver,
  DeriveState,
  DisplayMath,
  DocumentNode,
  EmphasisSpec,
  GeoBlock,
  MediaBlock,
  Paragraph,
  Plot,
  PlotFollower,
  SceneAnim,
  SceneBlock,
  SceneObject,
  Slide,
  Slider,
  Step,
  TheoremBlock,
  TheoremKind,
} from "@chalk/ast";
import { THEOREM_KINDS } from "@chalk/ast";
import { inlineText, parseInline } from "./inline.js";
import { SourceText } from "./location.js";

export { SourceText } from "./location.js";
export { parseInline, inlineText } from "./inline.js";

const THEOREM_KIND_SET = new Set<string>(THEOREM_KINDS);

/** True for any line whose trimmed text begins a non-paragraph block. */
function isBlockStart(trimmed: string): boolean {
  return (
    trimmed.startsWith("```") ||
    trimmed.startsWith(":::") ||
    trimmed.startsWith("$$") ||
    trimmed.startsWith("@slider") ||
    trimmed.startsWith("@plot") ||
    trimmed.startsWith("@point") ||
    trimmed.startsWith("@follow") ||
    trimmed.startsWith("@image") ||
    trimmed.startsWith("@video") ||
    /^#{1,2}[ \t]+/.test(trimmed)
  );
}

/** Match a heading line; returns its level and the text after the `#`s. */
function matchHeading(
  text: string,
): { level: 1 | 2; prefixLen: number } | null {
  const m = /^(#{1,2})[ \t]+/.exec(text);
  if (!m) return null;
  return { level: m[1]!.length as 1 | 2, prefixLen: m[0].length };
}

/** Collect every declared @slider name up front, so a @plot appearing before
 * its slider still resolves its variable dependencies correctly. */
function collectSliderNames(lines: { text: string }[]): Set<string> {
  const names = new Set<string>();
  const re = /^\s*@slider\s+([A-Za-z_]\w*)\b/;
  for (const line of lines) {
    const m = re.exec(line.text);
    if (m) names.add(m[1]!);
  }
  return names;
}

/** The most recent Plot in a block list (for attaching @point / @follow). */
function lastPlot(blocks: Block[]): Plot | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (b.type === "plot") return b;
  }
  return undefined;
}

/** Parse the tail of a `+emphasize` directive into an effect + optional target. */
function parseEmphasis(rest: string): EmphasisSpec {
  const trimmed = rest.trim();
  const m = /^(highlight|pulse|circumscribe)\b\s*(.*)$/.exec(trimmed);
  if (m) {
    const target = m[2]!.trim();
    return target
      ? { effect: m[1] as EmphasisSpec["effect"], target }
      : { effect: m[1] as EmphasisSpec["effect"] };
  }
  return trimmed ? { effect: "pulse", target: trimmed } : { effect: "pulse" };
}

/**
 * Parse the tail of a scene object declaration (`@kind name <rest>`) into a
 * host name (`on …`) and a raw argument bag. Values stay as strings; the
 * runtime compiles ranges/expressions. Kept permissive so unknown kinds (from
 * later sub-phases) still capture `on` + key:value/flag args generically.
 */
function parseSceneObjectArgs(
  _kind: string,
  rest: string,
): { on?: string; args: Record<string, string> } {
  const args: Record<string, string> = {};
  let on: string | undefined;
  let body = rest.trim();

  const grab = (re: RegExp): string | undefined => {
    const m = re.exec(body);
    if (!m) return undefined;
    body = (body.slice(0, m.index) + body.slice(m.index + m[0].length)).trim();
    return m[1];
  };
  const unquote = (s: string): string =>
    s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
  /** Extract the balanced-paren content following `keyword (`, e.g. for
   * coordinate tuples whose components may themselves contain parens. */
  const grabBalanced = (keyword: string): string | undefined => {
    const m = new RegExp(`\\b${keyword}\\s*\\(`).exec(body);
    if (!m) return undefined;
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < body.length && depth > 0; i++) {
      if (body[i] === "(") depth++;
      else if (body[i] === ")") depth--;
    }
    const content = body.slice(start, i - 1);
    body = (body.slice(0, m.index) + body.slice(i)).trim();
    return content;
  };
  /** Split on commas that are not nested inside parentheses. */
  const splitTop = (s: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of s) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((p) => p.trim());
  };
  const tuple = (raw: string, into: string[]): void => {
    splitTop(raw).forEach((v, i) => {
      if (v) args[into[i]!] = v;
    });
  };

  // Host coordinate system.
  on = grab(/\bon\s+([A-Za-z_]\w*)/);

  // Media source: `of "url-or-path"` (quoted) or `of bare-token`.
  const ofSrc = grab(/\bof\s+("[^"]*"|\S+)/);
  if (ofSrc !== undefined) args.src = unquote(ofSrc);

  // Relative placement: `next_to <object>` and `shift:(dx, dy)` (dir:/buff: are
  // captured as ordinary key:value pairs below).
  const nextTo = grab(/\bnext_to\s+([A-Za-z_]\w*)/);
  if (nextTo !== undefined) args.next_to = nextTo;
  const shift = grab(/\bshift\s*:\s*\(([^)]*)\)/);
  if (shift !== undefined) args.shift = shift.trim();

  // Matrix literal: `= [[a, b], [c, d]]` (entries may reference sliders).
  const matrix = grab(/=\s*(\[\[[\s\S]*\]\])\s*$/);
  if (matrix !== undefined) args.value = matrix;

  // `label "…"` and a bare trailing `"…"` both become text-ish args.
  const labelText = grab(/\blabel\s+"([^"]*)"/);
  if (labelText !== undefined) args.label = labelText;

  // `at (x, y[, z])` for coordinates, or bare `at NAME` (e.g. tangent at P).
  const at = grabBalanced("at");
  if (at !== undefined) tuple(at, ["x", "y", "z"]);
  else {
    const atName = grab(/\bat\s+([A-Za-z_]\w*)/);
    if (atName) args.at = atName;
  }

  // `from (…) to (…)` (3D arrows/lines) or scalar `from … to …` (2D area).
  const fromParen = grabBalanced("from");
  if (fromParen !== undefined) args.from = fromParen;
  else {
    const f = grab(/\bfrom\s+(\S+)/);
    if (f) args.from = f;
  }
  const toParen = grabBalanced("to");
  if (toParen !== undefined) args.to = toParen;
  else {
    const t = grab(/\bto\s+(\S+)/);
    if (t) args.to = t;
  }

  // Reference keywords.
  const under = grab(/\bunder\s+([A-Za-z_]\w*)/);
  if (under) args.under = under;
  const rects = grab(/\brects\s+(\d+)/);
  if (rects) args.rects = rects;

  // `key:value` pairs (ranges, r:, phi:, colorscale:, color:, …).
  for (;;) {
    const m = /\b([A-Za-z_]\w*):\s*("[^"]*"|\[[^\]]*\]|\S+)/.exec(body);
    if (!m) break;
    args[m[1]!] = unquote(m[2]!);
    body = (body.slice(0, m.index) + body.slice(m.index + m[0].length)).trim();
  }

  // A leading `:` introduces an expression (plot/surface/parametric/curve).
  const exprM = /(?:^|\s):\s+(.+)$/.exec(body);
  if (exprM) {
    args.expr = exprM[1]!.trim();
    body = body.slice(0, exprM.index).trim();
  }

  // A trailing quoted string is label text (e.g. `@label L at (…) "f(x)"`).
  const text = grab(/"([^"]*)"/);
  if (text !== undefined && args.text === undefined) args.text = text;

  // Remaining bare words are boolean flags (grid, autorotate, wireframe, …).
  for (const word of body.split(/\s+/)) {
    if (word) args[word] = "true";
  }

  return on === undefined ? { args } : { on, args };
}

/** Identifiers in `expr` that name a declared slider, in first-seen order. */
function extractVars(expr: string, sliderNames: Set<string>): string[] {
  const ids = expr.match(/[A-Za-z_]\w*/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (sliderNames.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Parse a `.chalk` source string into a Document AST.
 *
 * This is a pure function: no I/O, no DOM. It is the only public entry point of
 * the package. The strategy is a two-level hand-written scanner — a block pass
 * over physical lines (headings, `:::` blocks, code fences, `$$`, `@…`) and an
 * inline pass over the resulting text runs (`$…$`, `**`, `*`, `` ` ``). Verbatim
 * regions (code fences, `:::` blocks) are resolved at the block level *before*
 * any inline parsing, so fences and math never corrupt each other.
 */
export function parse(source: string): DocumentNode {
  const src = new SourceText(source);
  const lines = src.lines;
  const sliderNames = collectSliderNames(lines);
  const n = lines.length;

  /** Does any line in [start, end) carry non-whitespace content? */
  function rangeHasContent(start: number, end: number): boolean {
    for (let i = start; i < end; i++) {
      if (lines[i]!.text.trim() !== "") return true;
    }
    return false;
  }

  /** Parse a contiguous run of lines [start, end) into block nodes. Does not
   * see `+step` lines (theorem bodies strip those out before calling here). */
  function parseBlocks(start: number, end: number): Block[] {
    const blocks: Block[] = [];
    let k = start;

    while (k < end) {
      const line = lines[k]!;
      const t = line.text.trim();

      if (t === "") {
        k++;
        continue;
      }

      // --- Fenced code cell -------------------------------------------------
      if (t.startsWith("```")) {
        const langRaw = t.slice(3).trim().toLowerCase();
        const lang: CodeCell["lang"] =
          langRaw === "py" || langRaw === "python" ? "py" : "js";
        let e = k + 1;
        while (e < end && !lines[e]!.text.trim().startsWith("```")) e++;
        const hasBody = e > k + 1;
        const sourceCode = hasBody
          ? src.source.slice(lines[k + 1]!.start, lines[e - 1]!.end)
          : "";
        const blockEnd = e < end ? lines[e]!.end : lines[e - 1]!.end;
        blocks.push({
          type: "code",
          lang,
          source: sourceCode,
          loc: src.loc(line.start, blockEnd),
        } satisfies CodeCell);
        k = e + 1;
        continue;
      }

      // --- ::: block (theorem family or geo) --------------------------------
      if (t.startsWith(":::")) {
        const header = t.slice(3).trim();
        const hm = /^(\w+)\s*(.*)$/.exec(header);
        // Find the closing `:::` line (verbatim scan — inner lines are not
        // parsed until we know the block type and range).
        let close = k + 1;
        while (close < end && lines[close]!.text.trim() !== ":::") close++;
        const bodyStart = k + 1;
        const bodyEnd = close; // exclusive
        const blockEnd = close < end ? lines[close]!.end : lines[close - 1]!.end;
        const keyword = hm ? hm[1]!.toLowerCase() : "";
        const titleText = hm ? hm[2]!.trim() : "";

        if (keyword === "geo") {
          const hasBody = bodyEnd > bodyStart;
          const geoSource = hasBody
            ? src.source.slice(lines[bodyStart]!.start, lines[bodyEnd - 1]!.end)
            : "";
          blocks.push({
            type: "geo",
            source: geoSource,
            loc: src.loc(line.start, blockEnd),
          } satisfies GeoBlock);
          k = close + 1;
          continue;
        }

        if (keyword === "scene" || keyword === "scene3d") {
          blocks.push(
            parseScene(
              bodyStart,
              bodyEnd,
              line.start,
              blockEnd,
              titleText || undefined,
              keyword === "scene3d" ? "3d" : "2d",
            ),
          );
          k = close + 1;
          continue;
        }

        if (keyword === "derive") {
          // `:::derive` is advance-driven; `:::derive bind=a` is slider-driven
          // (parsed now to prove the design; runtime wiring is a later phase).
          let driver: DeriveDriver = "advance";
          let bind: string | undefined;
          const bm = /\bbind\s*=\s*([A-Za-z_]\w*)/.exec(header);
          if (bm) {
            driver = "slider";
            bind = bm[1];
          }
          blocks.push(
            parseDerive(bodyStart, bodyEnd, line.start, blockEnd, driver, bind),
          );
          k = close + 1;
          continue;
        }

        if (THEOREM_KIND_SET.has(keyword)) {
          const node = parseTheorem(
            keyword as TheoremKind,
            titleText,
            bodyStart,
            bodyEnd,
            line.start,
            blockEnd,
          );
          blocks.push(node);
          k = close + 1;
          continue;
        }

        // Unknown ::: keyword: treat the whole region as a remark so content
        // is never silently dropped.
        const node = parseTheorem(
          "remark",
          header,
          bodyStart,
          bodyEnd,
          line.start,
          blockEnd,
        );
        blocks.push(node);
        k = close + 1;
        continue;
      }

      // --- Display math ($$ … $$) ------------------------------------------
      if (t.startsWith("$$")) {
        if (t.length > 4 && t.endsWith("$$")) {
          blocks.push({
            type: "math",
            display: true,
            tex: t.slice(2, -2).trim(),
            loc: src.loc(line.start, line.end),
          } satisfies DisplayMath);
          k++;
          continue;
        }
        // Multi-line display math.
        let e = k + 1;
        while (e < end && !lines[e]!.text.trim().endsWith("$$")) e++;
        const openIdx = line.text.indexOf("$$");
        const innerStart = line.start + openIdx + 2;
        let innerEnd: number;
        let blockEnd: number;
        if (e < end) {
          const closeIdx = lines[e]!.text.lastIndexOf("$$");
          innerEnd = lines[e]!.start + closeIdx;
          blockEnd = lines[e]!.end;
        } else {
          innerEnd = lines[end - 1]!.end;
          blockEnd = innerEnd;
          e = end - 1;
        }
        blocks.push({
          type: "math",
          display: true,
          tex: src.source.slice(innerStart, innerEnd).trim(),
          loc: src.loc(line.start, blockEnd),
        } satisfies DisplayMath);
        k = e + 1;
        continue;
      }

      // --- @slider name [min,max] = default [step s] -----------------------
      if (t.startsWith("@slider")) {
        const m =
          /^@slider\s+([A-Za-z_]\w*)\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*=\s*(-?[\d.]+)\s*(?:\bstep\s+(-?[\d.]+))?\s*$/.exec(
            t,
          );
        if (m) {
          const node: Slider = {
            type: "slider",
            name: m[1]!,
            min: parseFloat(m[2]!),
            max: parseFloat(m[3]!),
            default: parseFloat(m[4]!),
            loc: src.loc(line.start, line.end),
          };
          if (m[5] !== undefined) node.step = parseFloat(m[5]);
          blocks.push(node);
          k++;
          continue;
        }
        // Malformed → fall through to paragraph (content is preserved as text).
      }

      // --- @plot expr  (optionally `lhs = expr`) ---------------------------
      if (t.startsWith("@plot")) {
        const rest = t.slice("@plot".length).trim();
        if (rest.length > 0) {
          let lhs: string | undefined;
          let expr = rest;
          const am = /^([A-Za-z_]\w*\s*(?:\([^)]*\))?)\s*=\s*(.+)$/.exec(rest);
          if (am) {
            lhs = am[1]!.trim();
            expr = am[2]!.trim();
          }
          const node: Plot = {
            type: "plot",
            expr,
            vars: extractVars(expr, sliderNames),
            loc: src.loc(line.start, line.end),
          };
          if (lhs !== undefined) node.lhs = lhs;
          blocks.push(node);
          k++;
          continue;
        }
      }

      // --- @point P = (t, f(t)) — a tracking point on the preceding plot ----
      if (t.startsWith("@point")) {
        const m = /^@point\s+(\w+)\s*=\s*\(([^,]+),(.*)\)\s*$/.exec(t);
        const plot = lastPlot(blocks);
        if (m && plot) {
          plot.pointName = m[1]!;
          plot.pointX = m[2]!.trim();
          k++;
          continue;
        }
      }

      // --- @follow <kind> at P — a follower tracking the point --------------
      if (t.startsWith("@follow")) {
        const m = /^@follow\s+(tangent|dropline|label)\b/.exec(t);
        const plot = lastPlot(blocks);
        if (m && plot) {
          (plot.follows ??= []).push(m[1] as PlotFollower);
          k++;
          continue;
        }
      }

      // --- @image / @video name of "src" … (standalone block-level media) --
      if (t.startsWith("@image") || t.startsWith("@video")) {
        const m = /^@(image|video)\s+([A-Za-z_]\w*)\s+(.*)$/.exec(t);
        if (m && /\bof\b/.test(m[3]!)) {
          const { args } = parseSceneObjectArgs(m[1]!, m[3]!);
          const node: MediaBlock = {
            type: "media",
            mediaKind: m[1] as "image" | "video",
            name: m[2]!,
            src: args.src ?? "",
            loc: src.loc(line.start, line.end),
          };
          if (args.alt !== undefined) node.alt = args.alt;
          else if (args.text !== undefined) node.alt = args.text;
          if (args.width !== undefined) node.width = args.width;
          if (args.poster !== undefined) node.poster = args.poster;
          if (args.caption !== undefined) node.caption = args.caption;
          if (args.track !== undefined) node.track = args.track;
          if (args.loop === "true") node.loop = true;
          if (args.autoplay === "true") node.autoplay = true;
          if (args.muted === "true") node.muted = true;
          if (args.controls === "false") node.controls = false;
          blocks.push(node);
          k++;
          continue;
        }
        // Malformed → fall through to paragraph (preserve as text).
      }

      // --- Paragraph: accumulate consecutive prose lines -------------------
      let e = k + 1;
      while (e < end) {
        const tt = lines[e]!.text.trim();
        if (tt === "" || isBlockStart(tt)) break;
        e++;
      }
      const sliceEnd = lines[e - 1]!.end;
      blocks.push({
        type: "paragraph",
        children: parseInline(
          src.source.slice(line.start, sliceEnd),
          line.start,
          src,
        ),
        loc: src.loc(line.start, sliceEnd),
      } satisfies Paragraph);
      k = e;
    }

    return blocks;
  }

  /** Parse a theorem-family block body into pre-step children and steps. */
  function parseTheorem(
    kind: TheoremKind,
    titleText: string,
    bodyStart: number,
    bodyEnd: number,
    blockStart: number,
    blockEnd: number,
  ): TheoremBlock {
    // Pre-step content runs until the first `+step` line.
    let firstStep = bodyStart;
    while (
      firstStep < bodyEnd &&
      !/^\s*\+step\b/.test(lines[firstStep]!.text)
    ) {
      firstStep++;
    }
    const children = parseBlocks(bodyStart, firstStep);

    const steps: Step[] = [];
    let s = firstStep;
    let index = 0;
    while (s < bodyEnd) {
      if (lines[s]!.text.trim() === "") {
        s++;
        continue;
      }
      const m = /^\s*\+step\s+/.exec(lines[s]!.text);
      const prefixLen = m ? m[0].length : 0;
      const contentOffset = lines[s]!.start + prefixLen;
      // A step owns its line plus following non-blank continuation lines until
      // the next `+step`.
      let e = s + 1;
      while (
        e < bodyEnd &&
        lines[e]!.text.trim() !== "" &&
        !/^\s*\+step\b/.test(lines[e]!.text)
      ) {
        e++;
      }
      const sliceEnd = lines[e - 1]!.end;
      const para: Paragraph = {
        type: "paragraph",
        children: parseInline(
          src.source.slice(contentOffset, sliceEnd),
          contentOffset,
          src,
        ),
        loc: src.loc(contentOffset, sliceEnd),
      };
      steps.push({
        type: "step",
        index: index++,
        children: [para],
        loc: src.loc(lines[s]!.start, sliceEnd),
      });
      s = e;
    }

    const node: TheoremBlock = {
      type: "theorem",
      kind,
      children,
      steps,
      loc: src.loc(blockStart, blockEnd),
    };
    if (titleText.length > 0) node.title = titleText;
    return node;
  }

  /** Parse a `:::derive` body into an ordered list of equation states. The
   * first `$$…$$` is the initial state; each `+to $$…$$` appends another. */
  function parseDerive(
    bodyStart: number,
    bodyEnd: number,
    blockStart: number,
    blockEnd: number,
    driver: DeriveDriver,
    bind: string | undefined,
  ): DeriveBlock {
    const states: DeriveState[] = [];
    let s = bodyStart;

    while (s < bodyEnd) {
      let txt = lines[s]!.text;
      if (txt.trim() === "") {
        s++;
        continue;
      }
      // `+emphasize [effect] [target]` attaches to the most recent state.
      const em = /^\s*\+emphasize\b\s*(.*)$/.exec(txt);
      if (em) {
        const last = states[states.length - 1];
        if (last) (last.emphasis ??= []).push(parseEmphasis(em[1]!));
        s++;
        continue;
      }
      // An optional `+to` introduces the next state.
      let lineStartOffset = lines[s]!.start;
      const tm = /^\s*\+to\s*/.exec(txt);
      if (tm) {
        txt = txt.slice(tm[0].length);
        lineStartOffset += tm[0].length;
      }
      const trimmed = txt.trim();
      if (!trimmed.startsWith("$$")) {
        s++; // ignore stray lines rather than mangle them
        continue;
      }

      // Single-line `$$ … $$`.
      if (trimmed.length > 4 && trimmed.endsWith("$$")) {
        states.push({
          type: "deriveState",
          tex: trimmed.slice(2, -2).trim(),
          loc: src.loc(lineStartOffset, lines[s]!.end),
        });
        s++;
        continue;
      }

      // Multi-line: open `$$` here, close on a later line ending in `$$`.
      const innerStart = lineStartOffset + txt.indexOf("$$") + 2;
      let e = s + 1;
      while (e < bodyEnd && !lines[e]!.text.trim().endsWith("$$")) e++;
      let innerEnd: number;
      let stateEnd: number;
      if (e < bodyEnd) {
        innerEnd = lines[e]!.start + lines[e]!.text.lastIndexOf("$$");
        stateEnd = lines[e]!.end;
      } else {
        innerEnd = lines[bodyEnd - 1]!.end;
        stateEnd = innerEnd;
        e = bodyEnd - 1;
      }
      states.push({
        type: "deriveState",
        tex: src.source.slice(innerStart, innerEnd).trim(),
        loc: src.loc(lines[s]!.start, stateEnd),
      });
      s = e + 1;
    }

    const node: DeriveBlock = {
      type: "derive",
      driver,
      states,
      loc: src.loc(blockStart, blockEnd),
    };
    if (bind !== undefined) node.bind = bind;
    return node;
  }

  /** Parse a `:::scene` body into named objects and ordered +animate verbs. */
  function parseScene(
    bodyStart: number,
    bodyEnd: number,
    blockStart: number,
    blockEnd: number,
    name: string | undefined,
    dimension: "2d" | "3d",
  ): SceneBlock {
    const objects: SceneObject[] = [];
    const steps: SceneAnim[] = [];
    let animIndex = 0;

    for (let s = bodyStart; s < bodyEnd; s++) {
      const raw = lines[s]!.text;
      const t = raw.trim();
      if (t === "") continue;

      const anim = /^\+animate\s+([A-Za-z][\w-]*)\s+([A-Za-z_]\w*)\s*(.*)$/.exec(t);
      if (anim) {
        const extra = anim[3]!.trim();
        steps.push({
          type: "sceneAnim",
          verb: anim[1]!,
          target: anim[2]!,
          args: extra ? extra.split(/\s+/) : [],
          index: animIndex++,
          loc: src.loc(lines[s]!.start, lines[s]!.end),
        });
        continue;
      }

      const obj = /^@([A-Za-z]\w*)\s+([A-Za-z_]\w*)\s*(.*)$/.exec(t);
      if (obj) {
        const kind = obj[1]!;
        const objName = obj[2]!;
        const { on, args } = parseSceneObjectArgs(kind, obj[3]!);
        const node: SceneObject = {
          type: "sceneObject",
          kind,
          name: objName,
          args,
          loc: src.loc(lines[s]!.start, lines[s]!.end),
        };
        if (on !== undefined) node.on = on;
        objects.push(node);
        continue;
      }
      // Unrecognized lines are ignored rather than mangled.
    }

    const node: SceneBlock = {
      type: "scene",
      dimension,
      objects,
      steps,
      loc: src.loc(blockStart, blockEnd),
    };
    if (name !== undefined) node.name = name;
    return node;
  }

  // --- Top level: split the document into slides at headings ----------------
  const slides: Slide[] = [];
  let i = 0;

  // Any content before the first heading becomes an untitled content slide.
  {
    let j = i;
    while (j < n && !matchHeading(lines[j]!.text)) j++;
    if (j > i && rangeHasContent(i, j)) {
      slides.push({
        type: "slide",
        kind: "content",
        heading: [],
        children: parseBlocks(i, j),
        loc: src.loc(lines[i]!.start, lines[j - 1]!.end),
      });
    }
    i = j;
  }

  while (i < n) {
    const head = matchHeading(lines[i]!.text)!;
    const headingOffset = lines[i]!.start + head.prefixLen;
    const headingNodes = parseInline(
      lines[i]!.text.slice(head.prefixLen),
      headingOffset,
      src,
    );

    let j = i + 1;
    while (j < n && !matchHeading(lines[j]!.text)) j++;

    const children = parseBlocks(i + 1, j);
    slides.push({
      type: "slide",
      kind: head.level === 1 ? "title" : "content",
      heading: headingNodes,
      children,
      loc: src.loc(lines[i]!.start, lines[j - 1]!.end),
    });
    i = j;
  }

  const doc: DocumentNode = {
    type: "document",
    children: slides,
    loc: src.loc(0, source.length),
  };
  const firstTitle = slides.find((s) => s.kind === "title");
  if (firstTitle) doc.title = inlineText(firstTitle.heading).trim();
  return doc;
}

import type {
  Block,
  CodeCell,
  DisplayMath,
  DocumentNode,
  GeoBlock,
  Paragraph,
  Plot,
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

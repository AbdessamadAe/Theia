import type { Inline } from "@theia/ast";
import type { SourceText } from "./location.js";

/** Find the next unescaped occurrence of `ch` at or after `from`. */
function findUnescaped(text: string, from: number, ch: string): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] === "\\") {
      j++; // skip the escaped character
      continue;
    }
    if (text[j] === ch) return j;
  }
  return -1;
}

/**
 * Parse a run of inline text into inline nodes.
 *
 * `text` is a contiguous slice of the source; `baseOffset` is that slice's
 * global offset, so every produced node's `loc` maps back to the original file.
 *
 * The math body inside `$…$` is captured *verbatim* (no escape processing) so
 * that LaTeX like `\frac{}{}` or `|x-a|` reaches KaTeX untouched. Outside math,
 * a backslash escapes the special characters `$ * ` \`.
 */
export function parseInline(
  text: string,
  baseOffset: number,
  src: SourceText,
): Inline[] {
  const nodes: Inline[] = [];
  const g = (local: number): number => baseOffset + local;

  let buf = "";
  let bufStart = 0;
  let i = 0;

  const flush = (localEnd: number): void => {
    if (buf.length === 0) return;
    nodes.push({
      type: "text",
      value: buf,
      loc: src.loc(g(bufStart), g(localEnd)),
    });
    buf = "";
  };

  while (i < text.length) {
    const c = text[i]!;

    // Escapes: \$ \* \` \\ collapse to the literal character.
    if (
      c === "\\" &&
      i + 1 < text.length &&
      "$*`\\".includes(text[i + 1]!)
    ) {
      if (buf.length === 0) bufStart = i;
      buf += text[i + 1]!;
      i += 2;
      continue;
    }

    // Markdown image: ![alt](url) — mapped to the same image rendering.
    if (c === "!" && text[i + 1] === "[") {
      const closeBracket = text.indexOf("]", i + 2);
      if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
        const closeParen = text.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          flush(i);
          nodes.push({
            type: "image",
            alt: text.slice(i + 2, closeBracket),
            url: text.slice(closeBracket + 2, closeParen).trim(),
            loc: src.loc(g(i), g(closeParen + 1)),
          });
          i = closeParen + 1;
          bufStart = i;
          continue;
        }
      }
    }

    // Inline math: $…$ (verbatim body).
    if (c === "$") {
      const close = findUnescaped(text, i + 1, "$");
      if (close !== -1) {
        flush(i);
        nodes.push({
          type: "inlineMath",
          tex: text.slice(i + 1, close),
          loc: src.loc(g(i), g(close + 1)),
        });
        i = close + 1;
        bufStart = i;
        continue;
      }
    }

    // Inline code: `…`
    if (c === "`") {
      const close = text.indexOf("`", i + 1);
      if (close !== -1) {
        flush(i);
        nodes.push({
          type: "inlineCode",
          value: text.slice(i + 1, close),
          loc: src.loc(g(i), g(close + 1)),
        });
        i = close + 1;
        bufStart = i;
        continue;
      }
    }

    // Strong: **…**  (checked before single-* emphasis).
    if (c === "*" && text[i + 1] === "*") {
      const close = text.indexOf("**", i + 2);
      if (close !== -1) {
        flush(i);
        nodes.push({
          type: "strong",
          children: parseInline(text.slice(i + 2, close), g(i + 2), src),
          loc: src.loc(g(i), g(close + 2)),
        });
        i = close + 2;
        bufStart = i;
        continue;
      }
    }

    // Emphasis: *…*
    if (c === "*") {
      const close = text.indexOf("*", i + 1);
      if (close !== -1) {
        flush(i);
        nodes.push({
          type: "emphasis",
          children: parseInline(text.slice(i + 1, close), g(i + 1), src),
          loc: src.loc(g(i), g(close + 1)),
        });
        i = close + 1;
        bufStart = i;
        continue;
      }
    }

    // Ordinary character.
    if (buf.length === 0) bufStart = i;
    buf += c;
    i++;
  }

  flush(i);
  return nodes;
}

/** Plain-text projection of an inline run (used for the document title). */
export function inlineText(nodes: Inline[]): string {
  let out = "";
  for (const n of nodes) {
    switch (n.type) {
      case "text":
        out += n.value;
        break;
      case "inlineCode":
        out += n.value;
        break;
      case "inlineMath":
        out += n.tex;
        break;
      case "strong":
      case "emphasis":
        out += inlineText(n.children);
        break;
      case "image":
        out += n.alt;
        break;
    }
  }
  return out;
}

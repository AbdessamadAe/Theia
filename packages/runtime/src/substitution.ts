/**
 * Token-aware substitution of slider values into LaTeX.
 *
 * The hard requirement: substituting a value for a slider named `a` must not
 * corrupt `\alpha`, must not touch the letters inside `\sin`, and must not
 * rewrite part of a multi-letter identifier like `abc`. We therefore tokenize
 * rather than string-replace.
 *
 * Token kinds we distinguish while scanning the tex:
 *   - command:    a backslash followed by letters (`\alpha`, `\sin`, `\frac`)
 *                 — or a backslash + single non-letter (`\{`, `\,`). Never a
 *                 substitution target; its letters are not free variables.
 *   - identifier: a maximal run of ASCII letters NOT preceded by a backslash.
 *                 Only a run of length 1 whose letter names a slider is a
 *                 substitution target (so `abc` is protected as a whole).
 *   - other:      digits, braces, operators, whitespace — passed through.
 */

/** Format a number for display: trim float noise, keep it compact. */
export function formatValue(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  // Round to 4 significant-ish decimals, then drop trailing zeros.
  const rounded = Math.round(value * 1e4) / 1e4;
  return String(rounded);
}

export interface LatexToken {
  kind: "command" | "identifier" | "other";
  value: string;
}

const isLetter = (ch: string): boolean =>
  (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");

/** Split a LaTeX string into command / identifier / other tokens. */
export function tokenizeLatex(tex: string): LatexToken[] {
  const tokens: LatexToken[] = [];
  let i = 0;
  const n = tex.length;

  while (i < n) {
    const ch = tex[i]!;

    // Command: backslash + (letters | single symbol).
    if (ch === "\\") {
      let j = i + 1;
      if (j < n && isLetter(tex[j]!)) {
        while (j < n && isLetter(tex[j]!)) j++;
      } else if (j < n) {
        j++; // e.g. \{  \,  \\
      }
      tokens.push({ kind: "command", value: tex.slice(i, j) });
      i = j;
      continue;
    }

    // Identifier: a maximal run of letters.
    if (isLetter(ch)) {
      let j = i + 1;
      while (j < n && isLetter(tex[j]!)) j++;
      tokens.push({ kind: "identifier", value: tex.slice(i, j) });
      i = j;
      continue;
    }

    // Everything else: accumulate a run of non-letter, non-backslash chars.
    let j = i + 1;
    while (j < n && !isLetter(tex[j]!) && tex[j] !== "\\") j++;
    tokens.push({ kind: "other", value: tex.slice(i, j) });
    i = j;
  }

  return tokens;
}

/** The set of slider variable names a tex template references (single-letter
 * identifier tokens that match a known slider name). */
export function referencedVars(
  tex: string,
  sliderNames: Iterable<string>,
): string[] {
  const names = new Set(sliderNames);
  const found = new Set<string>();
  for (const tok of tokenizeLatex(tex)) {
    if (tok.kind === "identifier" && tok.value.length === 1 && names.has(tok.value)) {
      found.add(tok.value);
    }
  }
  return [...found];
}

/**
 * Substitute slider values into a LaTeX template. Only standalone single-letter
 * identifiers matching a provided value are replaced, each wrapped in `{…}` so
 * a negative or multi-digit value never corrupts an adjacent `^`/`_`.
 */
export function substituteLatex(
  template: string,
  values: Record<string, number>,
): string {
  let out = "";
  for (const tok of tokenizeLatex(template)) {
    if (
      tok.kind === "identifier" &&
      tok.value.length === 1 &&
      Object.prototype.hasOwnProperty.call(values, tok.value)
    ) {
      out += `{${formatValue(values[tok.value]!)}}`;
    } else {
      out += tok.value;
    }
  }
  return out;
}

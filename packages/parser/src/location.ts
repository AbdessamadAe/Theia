import type { Position, SourceLocation } from "@theia/ast";

/** One physical line of the source, with its byte/char offsets. `end` is the
 * offset just past the last character (before the newline, if any). */
export interface Line {
  text: string;
  start: number;
  end: number;
}

/**
 * Wraps the raw source string and provides offset → {line,column} mapping plus
 * a line index for the block scanner. All offsets are 0-based character indices
 * into the original string, so slices map back to source exactly.
 */
export class SourceText {
  readonly source: string;
  readonly lines: Line[];
  private readonly lineStarts: number[];

  constructor(source: string) {
    this.source = source;
    this.lines = [];
    this.lineStarts = [];
    let start = 0;
    const n = source.length;
    for (let i = 0; i <= n; i++) {
      if (i === n || source[i] === "\n") {
        // Strip a trailing \r so CRLF files behave like LF files.
        let end = i;
        if (end > start && source[end - 1] === "\r") end -= 1;
        this.lines.push({ text: source.slice(start, end), start, end });
        this.lineStarts.push(start);
        start = i + 1;
        if (i === n) break;
      }
    }
  }

  /** Map a 0-based character offset to a 1-based line/column Position. */
  posAt(offset: number): Position {
    // Binary search for the greatest line start <= offset.
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    let line = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.lineStarts[mid]! <= offset) {
        line = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return {
      line: line + 1,
      column: offset - this.lineStarts[line]! + 1,
      offset,
    };
  }

  /** Build a SourceLocation from a start and end offset. */
  loc(start: number, end: number): SourceLocation {
    return { start: this.posAt(start), end: this.posAt(end) };
  }
}

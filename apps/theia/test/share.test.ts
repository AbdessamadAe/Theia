import { describe, expect, it } from "vitest";
import {
  buildShareUrl,
  decodeSource,
  encodeSource,
  readShareFromHash,
  SHARE_LIMIT,
} from "../src/share.js";

const SAMPLE = `# Limits\n\n## A slide\n\n$f(x) \\to L$ as $x \\to a$.\n\n@slider a [0, 3] = 1\n`;

describe("share URL round-trip", () => {
  it("encode → decode returns the identical source", () => {
    const encoded = encodeSource(SAMPLE);
    expect(decodeSource(encoded)).toBe(SAMPLE);
  });

  it("round-trips through a full share URL + hash read", () => {
    const { url } = buildShareUrl("https://theia.example/play", SAMPLE);
    expect(url).toContain("#c=");
    const hash = url.slice(url.indexOf("#"));
    expect(readShareFromHash(hash)).toBe(SAMPLE);
  });

  it("preserves unicode, math backslashes, and newlines exactly", () => {
    const tricky = "α \\frac{1}{2} ∫₀¹ x² dx\n\t:::derive\n$$\\blacksquare$$\n";
    expect(decodeSource(encodeSource(tricky))).toBe(tricky);
  });

  it("replaces an existing hash rather than appending", () => {
    const { url } = buildShareUrl("https://x.example/p#c=OLD", SAMPLE);
    expect(url.match(/#/g)).toHaveLength(1);
  });

  it("flags over-limit sources for the download fallback", () => {
    // Varied (poorly-compressible) content so the encoded form exceeds the cap.
    const big = Array.from({ length: 60000 }, (_, i) =>
      String.fromCharCode(33 + (((i * 2654435761) >>> 0) % 90)),
    ).join("");
    expect(buildShareUrl("https://x", big).overLimit).toBe(true);
    expect(buildShareUrl("https://x", SAMPLE).overLimit).toBe(false);
  });

  it("returns null for a hash without a share payload", () => {
    expect(readShareFromHash("#3")).toBeNull();
    expect(readShareFromHash("")).toBeNull();
  });
});

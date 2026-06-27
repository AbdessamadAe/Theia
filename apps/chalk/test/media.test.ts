import { parse } from "@chalk/parser";
import { describe, expect, it } from "vitest";
import { buildShareUrl, MEDIA_INLINE_BUDGET, readShareFromHash, SHARE_LIMIT } from "../src/share.js";

// A tiny inline image (well within budget) embedded in the source.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const SMALL_DECK = [
  "## A figure",
  "",
  `@image fig of "${TINY_PNG}" width:8 alt:"a dot"`,
  "",
  "And inline: ![dot](" + TINY_PNG + ") here.",
].join("\n");

describe("share-URL round-trip with embedded media", () => {
  it("a small inlined image round-trips within the share budget", () => {
    const { url, encoded, overLimit } = buildShareUrl("https://app/", SMALL_DECK);
    expect(overLimit).toBe(false);
    expect(encoded.length).toBeLessThan(SHARE_LIMIT);
    // Opening the link reproduces the exact source (data URI and all).
    expect(readShareFromHash(new URL(url).hash)).toBe(SMALL_DECK);
  });

  it("the embedded image is canonical — it lives in the .chalk text", () => {
    const restored = readShareFromHash(new URL(buildShareUrl("https://app/", SMALL_DECK).url).hash)!;
    const block = parse(restored).children[0]!.children.find((b) => b.type === "media");
    expect(block && block.type === "media" && block.src).toBe(TINY_PNG);
  });

  it("a deck larger than the budget is flagged over-limit (Share warns, never silent)", () => {
    // High-entropy base64 (incompressible, like a real image) blows the budget.
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let blob = "";
    let s = 1;
    for (let i = 0; i < 60000; i++) {
      s = (s * 48271) % 2147483647; // Park–Miller; take high bits (good period)
      blob += chars[(s >> 8) & 63];
    }
    const huge = `## Big\n\n@image big of "data:image/png;base64,${blob}" alt:"x"`;
    expect(buildShareUrl("https://app/", huge).overLimit).toBe(true);
  });

  it("the inline budget is well under a multi-MB asset", () => {
    expect(MEDIA_INLINE_BUDGET).toBeLessThan(1024 * 1024);
  });
});

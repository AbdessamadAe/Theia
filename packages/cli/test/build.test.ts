import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFile, isExternalRef, makeMediaResolver, MEDIA_INLINE_THRESHOLD } from "../src/build.js";

const tmp = (): string => mkdtempSync(join(tmpdir(), "chalk-media-"));

describe("isExternalRef", () => {
  it("treats https / data / blob as external (no embedding)", () => {
    expect(isExternalRef("https://x/y.png")).toBe(true);
    expect(isExternalRef("data:image/png;base64,AA")).toBe(true);
    expect(isExternalRef("fig.png")).toBe(false);
    expect(isExternalRef("./a/b.mp4")).toBe(false);
  });
});

describe("makeMediaResolver", () => {
  it("inlines a small local image as a data URI", () => {
    const dir = tmp();
    writeFileSync(join(dir, "fig.png"), Buffer.from([1, 2, 3, 4]));
    const warnings: string[] = [];
    const resolve = makeMediaResolver({ srcDir: dir, outDir: dir, outBase: "deck", warnings });
    const out = resolve("fig.png");
    expect(out.startsWith("data:image/png;base64,")).toBe(true);
    expect(Buffer.from(out.split(",")[1]!, "base64")).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(warnings).toHaveLength(0);
  });

  it("copies a large asset alongside and references it relatively", () => {
    const dir = tmp();
    const big = Buffer.alloc(MEDIA_INLINE_THRESHOLD + 1, 7);
    writeFileSync(join(dir, "clip.mp4"), big);
    const warnings: string[] = [];
    const resolve = makeMediaResolver({ srcDir: dir, outDir: dir, outBase: "deck", warnings });
    const out = resolve("clip.mp4");
    expect(out).toBe("deck.assets/clip.mp4");
    expect(existsSync(join(dir, "deck.assets/clip.mp4"))).toBe(true);
    expect(readFileSync(join(dir, "deck.assets/clip.mp4")).length).toBe(big.length);
  });

  it("leaves remote refs untouched and warns on a missing local file", () => {
    const dir = tmp();
    const warnings: string[] = [];
    const resolve = makeMediaResolver({ srcDir: dir, outDir: dir, outBase: "deck", warnings });
    expect(resolve("https://x/y.png")).toBe("https://x/y.png");
    expect(resolve("ghost.png")).toBe("ghost.png");
    expect(warnings.some((w) => w.includes("ghost.png"))).toBe(true);
  });
});

describe("buildFile media embedding", () => {
  it("embeds a local image into the output and warns on missing alt", () => {
    const dir = tmp();
    writeFileSync(join(dir, "dot.png"), Buffer.from([9, 9, 9]));
    writeFileSync(
      join(dir, "deck.theia"),
      ['## Local media', '', '@image dot of "dot.png" width:8'].join("\n"),
    );
    const res = buildFile(join(dir, "deck.theia"), join(dir, "out.html"));
    const html = readFileSync(res.output, "utf8");
    expect(html).toContain("data:image/png;base64,");
    expect(res.warnings.some((w) => /no alt text/.test(w))).toBe(true); // dot has no alt
  });
});

import type { ImageInline, MediaBlock, Paragraph, SceneBlock } from "@theia/ast";
import { describe, expect, it } from "vitest";
import { parse } from "../src/index.js";

const firstBlock = (src: string): MediaBlock =>
  parse(src).children[0]!.children[0] as MediaBlock;

describe("standalone @image / @video blocks", () => {
  it("parses an @image with src, position, size, and alt", () => {
    const b = firstBlock('## S\n\n@image fig of "diagram.png" at (1, 2) width:4 alt:"A diagram"');
    expect(b.type).toBe("media");
    expect(b.mediaKind).toBe("image");
    expect(b.name).toBe("fig");
    expect(b.src).toBe("diagram.png");
    expect(b.alt).toBe("A diagram");
    expect(b.width).toBe("4");
  });

  it("parses an @video with poster + flags", () => {
    const b = firstBlock('## S\n\n@video clip of "https://x/v.mp4" width:6 poster:"p.jpg" loop muted');
    expect(b.mediaKind).toBe("video");
    expect(b.src).toBe("https://x/v.mp4");
    expect(b.poster).toBe("p.jpg");
    expect(b.loop).toBe(true);
    expect(b.muted).toBe(true);
  });

  it("a malformed media line (no `of`) degrades to a paragraph", () => {
    const block = parse("## S\n\n@image just some text").children[0]!.children[0]!;
    expect(block.type).toBe("paragraph");
  });
});

describe("@image / @video as scene objects", () => {
  it("parses media inside a :::scene as named, positioned objects", () => {
    const scene = parse(
      [
        "## S",
        "",
        ":::scene",
        "@axes ax x:[-3,3] y:[-1,9]",
        '@image fig on ax of "fig.png" at (-1.5, 6) width:3 alt:"figure" opacity:k',
        '@video clip on ax of "clip.mp4" at (1, 4) width:4',
        "+animate play clip from 0:03 to 0:09",
        "+animate fade-in fig",
        ":::",
      ].join("\n"),
    ).children[0]!.children[0] as SceneBlock;

    const img = scene.objects.find((o) => o.name === "fig")!;
    expect(img.kind).toBe("image");
    expect(img.on).toBe("ax");
    expect(img.args.src).toBe("fig.png");
    expect(img.args.x).toBe("-1.5");
    expect(img.args.y).toBe("6");
    expect(img.args.width).toBe("3");
    expect(img.args.opacity).toBe("k"); // reactive (slider-bound)

    const vid = scene.objects.find((o) => o.name === "clip")!;
    expect(vid.kind).toBe("video");

    const play = scene.steps.find((s) => s.verb === "play")!;
    expect(play.target).toBe("clip");
    expect(play.args).toEqual(["from", "0:03", "to", "0:09"]);
  });
});

describe("markdown image syntax", () => {
  it("parses ![alt](url) as an inline image node", () => {
    const p = parse("## S\n\nSee ![the plot](plot.png) here.").children[0]!.children[0] as Paragraph;
    const img = p.children.find((n): n is ImageInline => n.type === "image")!;
    expect(img.alt).toBe("the plot");
    expect(img.url).toBe("plot.png");
  });
});

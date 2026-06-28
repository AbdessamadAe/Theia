import { describe, expect, it } from "vitest";
import type { ProjectBundle } from "../src/lib/db.js";
import { bundleToJson, parseBundle, sourceToBundle } from "../src/lib/transfer.js";

const bundle: ProjectBundle = {
  version: 1,
  name: "Linear Algebra",
  files: [
    { name: "main.theia", source: '# Vectors\n\n@image v of "data:image/png;base64,QQ==" alt:"v"\n' },
    { name: "notes.theia", source: "## Notes\n\n- one\n- two\n" },
  ],
};

describe("project bundle round-trip", () => {
  it("serialize → parse is identical (incl. inlined media)", () => {
    expect(parseBundle(bundleToJson(bundle))).toEqual(bundle);
  });

  it("rejects malformed files clearly", () => {
    expect(() => parseBundle("not json")).toThrow(/valid/i);
    expect(() => parseBundle(JSON.stringify({ version: 2 }))).toThrow(/bundle/i);
    expect(() => parseBundle(JSON.stringify({ version: 1, name: "x", files: [{ name: "a" }] }))).toThrow();
  });
});

describe("single .theia import", () => {
  it("wraps a raw source as a one-file bundle named from the filename", () => {
    const b = sourceToBundle("My Lecture.theia", "## Hi\n\nbody");
    expect(b.name).toBe("My Lecture");
    expect(b.files).toHaveLength(1);
    expect(b.files[0]!.source).toBe("## Hi\n\nbody");
  });

  it("round-trips raw source bytes exactly", () => {
    const src = "## S\n\n$$ \\frac{a}{b} $$\n\n@image f of \"data:image/png;base64,ZZ==\" alt:\"f\"\n";
    expect(sourceToBundle("x.theia", src).files[0]!.source).toBe(src);
  });
});

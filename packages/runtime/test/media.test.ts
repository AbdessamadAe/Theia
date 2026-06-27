import { describe, expect, it } from "vitest";
import { parseMediaSegment, parseMediaTime } from "../src/media.js";

describe("parseMediaTime", () => {
  it("parses m:ss, h:mm:ss, and bare seconds", () => {
    expect(parseMediaTime("9")).toBe(9);
    expect(parseMediaTime("0:03")).toBe(3);
    expect(parseMediaTime("1:30")).toBe(90);
    expect(parseMediaTime("1:02:03")).toBe(3723);
  });
  it("returns NaN for nonsense", () => {
    expect(Number.isNaN(parseMediaTime("x"))).toBe(true);
  });
});

describe("parseMediaSegment", () => {
  it("extracts from/to out of a play verb's args", () => {
    expect(parseMediaSegment(["from", "0:03", "to", "0:09"])).toEqual({ start: 3, end: 9 });
    expect(parseMediaSegment(["from", "1:30"])).toEqual({ start: 90 });
    expect(parseMediaSegment(["to", "0:05"])).toEqual({ end: 5 });
    expect(parseMediaSegment([])).toEqual({});
  });
});

import { describe, expect, it } from "vitest";
import { moveUnit, practiceUnits, segmentsByUnit } from "./practice-units";

const link = (
  id: string,
  setId: string | null = null,
  setPosition: number | null = null,
) => ({
  id,
  question: { sharedMaterialId: setId, setPosition },
});

describe("practiceUnits", () => {
  it("bộ là một mục liền ở chỗ câu đầu tiên của bộ, trong bộ theo thứ tự bộ", () => {
    const units = practiceUnits([
      link("x"),
      link("b", "S", 1),
      link("y"),
      link("a", "S", 0),
    ]);
    expect(units.map((u) => [u.setId, u.links.map((l) => l.id)])).toEqual([
      [null, ["x"]],
      ["S", ["a", "b"]],
      [null, ["y"]],
    ]);
  });
});

describe("moveUnit", () => {
  const units = practiceUnits([
    link("x"),
    link("a", "S", 0),
    link("b", "S", 1),
    link("y"),
  ]);

  it("đưa bộ xuống: cả bộ đổi chỗ với mục kề", () => {
    expect(moveUnit(units, 1, 1).map((l) => l.id)).toEqual([
      "x",
      "y",
      "a",
      "b",
    ]);
  });

  it("đưa câu lẻ xuống: nhảy qua cả bộ, không chen vào giữa", () => {
    expect(moveUnit(units, 0, 1).map((l) => l.id)).toEqual([
      "a",
      "b",
      "x",
      "y",
    ]);
  });
});

describe("segmentsByUnit", () => {
  it("gom các mục liền cùng mục vào một đoạn, giữ thứ tự", () => {
    const views = ["x", "a", "b", "c", "y"];
    const unitOf = new Map([["x", 0], ["a", 1], ["b", 1], ["c", 1], ["y", 2]]);
    expect(segmentsByUnit(views, (v) => unitOf.get(v)!)).toEqual([
      { unitIndex: 0, items: ["x"] },
      { unitIndex: 1, items: ["a", "b", "c"] },
      { unitIndex: 2, items: ["y"] },
    ]);
  });

  it("danh sách rỗng → không đoạn nào", () => {
    expect(segmentsByUnit([], () => 0)).toEqual([]);
  });
});

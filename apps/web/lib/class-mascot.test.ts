import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getClassMascot } from "./class-mascot";

describe("getClassMascot", () => {
  it("returns the same mascot and tint for the same class id", () => {
    expect(getClassMascot("class-abc")).toEqual(getClassMascot("class-abc"));
  });

  it("spreads different class ids across several mascots", () => {
    const sources = new Set(
      Array.from({ length: 50 }, (_, index) => getClassMascot(`class-${index}`).src),
    );
    expect(sources.size).toBeGreaterThan(10);
  });

  it("points at an existing asset in public/mascots", () => {
    for (let index = 0; index < 50; index += 1) {
      const { src } = getClassMascot(`class-${index}`);
      expect(src).toMatch(/^\/mascots\/unicorn-\d{4}\.webp$/);
      expect(existsSync(path.join(__dirname, "..", "public", src))).toBe(true);
    }
  });
});

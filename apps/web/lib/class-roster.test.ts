import { describe, expect, it } from "vitest";
import {
  isRosterCollapsedByDefault,
  ROSTER_COLLAPSE_THRESHOLD,
} from "./class-roster";

describe("isRosterCollapsedByDefault", () => {
  it("mở roster khi lớp có tối đa 7 học sinh đang học", () => {
    expect(ROSTER_COLLAPSE_THRESHOLD).toBe(7);
    expect(isRosterCollapsedByDefault(0)).toBe(false);
    expect(isRosterCollapsedByDefault(7)).toBe(false);
  });

  it("thu gọn roster khi lớp có hơn 7 học sinh đang học", () => {
    expect(isRosterCollapsedByDefault(8)).toBe(true);
    expect(isRosterCollapsedByDefault(30)).toBe(true);
  });
});

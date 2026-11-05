import { describe, expect, it } from "vitest";
import { formatScore, formatScoreValue } from "./attempt-score";

describe("formatScoreValue", () => {
  it("absolute_it: chia 100, 2 chữ số, dấu phẩy", () => {
    expect(formatScoreValue(1000, "absolute_it")).toBe("10,00");
    expect(formatScoreValue(875, "absolute_it")).toBe("8,75");
    expect(formatScoreValue(10, "absolute_it")).toBe("0,10");
  });
  it("equal_100: giữ nguyên", () => {
    expect(formatScoreValue(72, "equal_100")).toBe("72");
  });
});

describe("formatScore", () => {
  it("ghép điểm/tối đa", () => {
    expect(formatScore(800, 1000, "absolute_it")).toBe("8,00/10,00");
    expect(formatScore(50, 100, "equal_100")).toBe("50/100");
  });
});

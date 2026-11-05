import { describe, expect, it } from "vitest";
import { isOrderCorrect, restoreOrderIndices } from "./ordering";

describe("restoreOrderIndices", () => {
  it("map chữ thẻ về chỉ số thẻ hiển thị, thẻ trùng chữ lấy chỉ số chưa dùng", () => {
    expect(restoreOrderIndices(["本", "の", "机", "の"], ["の", "本", "の"])).toEqual([1, 0, 3]);
  });

  it("bỏ chữ không còn thẻ khớp (dữ liệu cũ/hỏng)", () => {
    expect(restoreOrderIndices(["a", "b"], ["b", "x", "b"])).toEqual([1]);
    expect(restoreOrderIndices(["a", "b"], null)).toEqual([]);
  });
});

describe("isOrderCorrect", () => {
  it("khớp toàn bộ chuỗi thẻ mới đúng", () => {
    expect(isOrderCorrect(["の", "本"], ["の", "本"])).toBe(true);
    expect(isOrderCorrect(["本", "の"], ["の", "本"])).toBe(false);
    expect(isOrderCorrect(["の"], ["の", "本"])).toBe(false);
    expect(isOrderCorrect(null, ["の"])).toBe(false);
  });
});

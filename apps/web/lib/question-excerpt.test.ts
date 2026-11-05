import { describe, expect, it } from "vitest";
import { questionExcerpt } from "./question-excerpt";

describe("questionExcerpt", () => {
  it("ô trống của câu điền hiện nhãn số như học sinh thấy, không lộ dấu soạn", () => {
    expect(questionExcerpt("<p>よるから気温が [[___]]。</p>")).toBe(
      "よるから気温が 【1】。",
    );
  });

  it("bỏ thẻ HTML và cắt ở 60 ký tự", () => {
    expect(questionExcerpt(`<p>${"あ".repeat(70)}</p>`)).toBe(
      `${"あ".repeat(60)}…`,
    );
  });
});

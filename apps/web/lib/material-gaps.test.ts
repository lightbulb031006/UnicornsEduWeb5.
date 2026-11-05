import { describe, expect, it } from "vitest";
import {
  materialGapIds,
  materialGapMarker,
  numberMaterialGaps,
} from "./material-gaps";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("numberMaterialGaps", () => {
  it("hiện số câu trong lượt làm tại vị trí trống của câu đó", () => {
    const content = `<p>今日は ${materialGapMarker(A)} 天気 ${materialGapMarker(B)} です。</p>`;
    const numbers = new Map([
      [A, 28],
      [B, 27],
    ]);
    expect(numberMaterialGaps(content, numbers)).toBe(
      "<p>今日は （28） 天気 （27） です。</p>",
    );
  });

  it("câu vắng trong tiết → vị trí trống không số", () => {
    const content = `<p>${materialGapMarker(A)}</p>`;
    expect(numberMaterialGaps(content, new Map())).toBe("<p>（　　）</p>");
  });

  it("nội dung không có vị trí trống giữ nguyên", () => {
    expect(numberMaterialGaps("<p>[[___]] x</p>", new Map())).toBe(
      "<p>[[___]] x</p>",
    );
  });
});

describe("materialGapIds", () => {
  it("liệt kê câu được nối theo thứ tự xuất hiện, không trùng", () => {
    const content = `${materialGapMarker(B)} ${materialGapMarker(A)} ${materialGapMarker(B)}`;
    expect(materialGapIds(content)).toEqual([B, A]);
  });
});

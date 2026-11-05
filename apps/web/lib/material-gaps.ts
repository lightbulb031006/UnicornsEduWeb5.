/**
 * Vị trí trống trong Tư liệu dùng chung (JP): dấu `[[#<questionId>]]` trong
 * văn bản tư liệu, nối tới một câu gắn tư liệu đó. Khi hiển thị, dấu đổi thành
 * số câu của câu đó trong lượt làm — `（27）` — hoặc ô không số nếu câu vắng.
 * Khác ô trống `[[___]]` của Câu điền vào ô trống (thuộc đề bài của câu).
 */
const GAP_PATTERN = /\[\[#([0-9a-fA-F-]{36})\]\]/g;

export function materialGapMarker(questionId: string): string {
  return `[[#${questionId}]]`;
}

/** Câu được nối tới, theo thứ tự xuất hiện đầu tiên, không trùng. */
export function materialGapIds(content: string): string[] {
  return [...new Set([...content.matchAll(GAP_PATTERN)].map((m) => m[1]))];
}

export function numberMaterialGaps(
  content: string,
  numbers: ReadonlyMap<string, number>,
): string {
  return content.replace(GAP_PATTERN, (_, id: string) => {
    const n = numbers.get(id);
    return n == null ? "（　　）" : `（${n}）`;
  });
}

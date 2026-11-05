/**
 * Câu sắp xếp (JP): câu trả lời gửi/lưu dạng chữ thẻ theo thứ tự xếp. UI giữ chỉ
 * số thẻ để phân biệt các thẻ trùng chữ.
 */

/** Map chữ thẻ đã xếp về chỉ số thẻ hiển thị; thẻ trùng chữ lấy chỉ số chưa dùng đầu tiên. */
export function restoreOrderIndices(
  cards: string[],
  orderAnswer: string[] | null | undefined,
): number[] {
  const used = new Set<number>();
  const out: number[] = [];
  for (const text of orderAnswer ?? []) {
    const i = cards.findIndex((c, j) => c === text && !used.has(j));
    if (i < 0) continue;
    used.add(i);
    out.push(i);
  }
  return out;
}

/** Khớp toàn bộ chuỗi thẻ (giống chấm của API) — chỉ để tô màu khi xem lại. */
export function isOrderCorrect(
  orderAnswer: string[] | null | undefined,
  key: string[],
): boolean {
  return (
    !!orderAnswer &&
    key.length > 0 &&
    orderAnswer.length === key.length &&
    orderAnswer.every((text, i) => text === key[i])
  );
}

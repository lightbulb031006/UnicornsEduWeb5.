/** Tổng điểm mặc định của một Bài làm (PRD 3.6). */
export const ATTEMPT_TOTAL_POINTS = 100;

/**
 * Chia `total` điểm đều cho `count` câu bằng phương pháp Hamilton:
 * mỗi câu nhận floor(total/count), phần dư +1 lần lượt từ câu đầu.
 * Tổng luôn đúng `total` (không bị 99.99). `count <= 0` → mảng rỗng.
 */
export function splitTotalPoints(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

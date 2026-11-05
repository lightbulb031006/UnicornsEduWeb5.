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

/** Trọng số mặc định của câu-trong-tiết (`question_links.points` null). */
export const DEFAULT_QUESTION_WEIGHT = 1;

/** Trọng số hiệu lực: null / ≤ 0 → mặc định 1. */
export function questionWeight(points: number | null | undefined): number {
  return points != null && points > 0 ? points : DEFAULT_QUESTION_WEIGHT;
}

/**
 * Chia `total` theo trọng số (hồ sơ JP, ADR 2026-10-09-jp-weighted-scoring):
 * câu i nhận floor(total × wᵢ / W), phần dư +1 cho câu có phần lẻ lớn nhất,
 * hoà thì câu đứng trước. Trọng số bằng nhau → giống hệt `splitTotalPoints`.
 * Tổng trọng số 0 → chia đều.
 */
export function splitTotalPointsByWeight(
  total: number,
  weights: number[],
): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return splitTotalPoints(total, weights.length);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let remainder = total - parts.reduce((s, p) => s + p, 0);
  const byFraction = exact
    .map((x, index) => ({ index, fraction: x - Math.floor(x) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of byFraction) {
    if (remainder <= 0) break;
    parts[index] += 1;
    remainder -= 1;
  }
  return parts;
}

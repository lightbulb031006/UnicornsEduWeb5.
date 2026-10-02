export const LESSON_OUTPUT_DIFFICULTY_BANDS = [
  'easy',
  'medium',
  'hard',
  'very_hard',
  'extreme',
] as const;

export type LessonOutputDifficultyBandValue =
  (typeof LESSON_OUTPUT_DIFFICULTY_BANDS)[number];

export type LessonOutputPricingItems = {
  includesTest: boolean;
  includesSolution: boolean;
  includesLectureVideo: boolean;
};

/** Bảng giá VNĐ theo bậc — hằng số trong code, không có UI quản trị. */
export const LESSON_OUTPUT_DIFFICULTY_PRICES: Record<
  LessonOutputDifficultyBandValue,
  { test: number; solution: number; lecture: number }
> = {
  easy: { test: 20000, solution: 10000, lecture: 20000 },
  medium: { test: 25000, solution: 10000, lecture: 25000 },
  hard: { test: 30000, solution: 15000, lecture: 30000 },
  very_hard: { test: 35000, solution: 15000, lecture: 35000 },
  extreme: { test: 50000, solution: 20000, lecture: 50000 },
};

export function isLessonOutputDifficultyBand(
  value: string | null | undefined,
): value is LessonOutputDifficultyBandValue {
  return (
    value != null &&
    (LESSON_OUTPUT_DIFFICULTY_BANDS as readonly string[]).includes(value)
  );
}

/**
 * Tính tiền output theo bậc + tick hạng mục.
 * Bậc `null`/`undefined` → `null` (không tính lại; caller giữ cost cũ).
 */
export function computeLessonOutputCost(
  band: LessonOutputDifficultyBandValue | null | undefined,
  items: LessonOutputPricingItems,
): number | null {
  if (!isLessonOutputDifficultyBand(band)) {
    return null;
  }

  const prices = LESSON_OUTPUT_DIFFICULTY_PRICES[band];
  let total = 0;
  if (items.includesTest) {
    total += prices.test;
  }
  if (items.includesSolution) {
    total += prices.solution;
  }
  if (items.includesLectureVideo) {
    total += prices.lecture;
  }
  return total;
}

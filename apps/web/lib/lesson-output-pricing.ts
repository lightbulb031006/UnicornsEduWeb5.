export const LESSON_OUTPUT_DIFFICULTY_BANDS = [
  "easy",
  "medium",
  "hard",
  "very_hard",
  "extreme",
] as const;

export type LessonOutputDifficultyBand =
  (typeof LESSON_OUTPUT_DIFFICULTY_BANDS)[number];

export type LessonOutputPricingItems = {
  includesTest: boolean;
  includesSolution: boolean;
  includesLectureVideo: boolean;
};

export const LESSON_OUTPUT_DIFFICULTY_META: Record<
  LessonOutputDifficultyBand,
  { label: string; ratingHint: string; test: number; solution: number; lecture: number }
> = {
  easy: { label: "Dễ", ratingHint: "< 1200", test: 20000, solution: 10000, lecture: 20000 },
  medium: {
    label: "Trung bình",
    ratingHint: "1200–1600",
    test: 25000,
    solution: 10000,
    lecture: 25000,
  },
  hard: { label: "Khó", ratingHint: "1600–1800", test: 30000, solution: 15000, lecture: 30000 },
  very_hard: {
    label: "Rất khó",
    ratingHint: "1800–2000",
    test: 35000,
    solution: 15000,
    lecture: 35000,
  },
  extreme: { label: "Cực khó", ratingHint: "> 2000", test: 50000, solution: 20000, lecture: 50000 },
};

export function isLessonOutputDifficultyBand(
  value: string | null | undefined,
): value is LessonOutputDifficultyBand {
  return (
    value != null &&
    (LESSON_OUTPUT_DIFFICULTY_BANDS as readonly string[]).includes(value)
  );
}

export function computeLessonOutputCost(
  band: LessonOutputDifficultyBand | null | undefined,
  items: LessonOutputPricingItems,
): number | null {
  if (!isLessonOutputDifficultyBand(band)) {
    return null;
  }

  const prices = LESSON_OUTPUT_DIFFICULTY_META[band];
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

export function formatLessonOutputDifficultyOption(
  band: LessonOutputDifficultyBand,
): string {
  const meta = LESSON_OUTPUT_DIFFICULTY_META[band];
  return `${meta.label} (${meta.ratingHint})`;
}

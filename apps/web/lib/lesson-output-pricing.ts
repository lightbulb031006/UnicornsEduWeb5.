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
  includesTheoryLecture: boolean;
};

/** Bài giảng lý thuyết: giá theo `level` (0–5), không theo bậc. Khớp `apps/api`. */
export const LESSON_OUTPUT_THEORY_LECTURE_PRICES: Record<number, number> = {
  0: 170000,
  1: 180000,
  2: 190000,
  3: 200000,
  4: 250000,
  5: 250000,
};

export const LESSON_OUTPUT_THEORY_LECTURE_MAX_LINKS = 20;

/** Nhận `"Level 3"` hoặc `"3"`. */
export function parseLessonOutputLevel(
  value: string | null | undefined,
): number | null {
  const match = /^(?:level\s*)?([0-5])$/i.exec(value?.trim() ?? "");
  return match ? Number(match[1]) : null;
}

/** Lỗi nghiệp vụ khi tick Bài giảng lý thuyết (cùng luật backend), hoặc `null`. */
export function getLessonOutputPricingError(
  band: LessonOutputDifficultyBand | null | undefined,
  level: string | null | undefined,
  items: LessonOutputPricingItems,
): string | null {
  if (!items.includesTheoryLecture) {
    return null;
  }
  if (parseLessonOutputLevel(level) == null) {
    return "Bài giảng lý thuyết tính tiền theo level — vui lòng chọn Level 0–5.";
  }
  if (
    (items.includesTest || items.includesSolution || items.includesLectureVideo) &&
    !isLessonOutputDifficultyBand(band)
  ) {
    return "Vui lòng chọn bậc độ khó cho Sinh test / Lời giải / Bài giảng video.";
  }
  return null;
}

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
  level?: string | null,
): number | null {
  const hasBand = isLessonOutputDifficultyBand(band);
  if (!hasBand && !items.includesTheoryLecture) {
    return null;
  }

  let total = 0;
  if (hasBand) {
    const prices = LESSON_OUTPUT_DIFFICULTY_META[band];
    if (items.includesTest) {
      total += prices.test;
    }
    if (items.includesSolution) {
      total += prices.solution;
    }
    if (items.includesLectureVideo) {
      total += prices.lecture;
    }
  }
  if (items.includesTheoryLecture) {
    const parsedLevel = parseLessonOutputLevel(level);
    if (parsedLevel != null) {
      total += LESSON_OUTPUT_THEORY_LECTURE_PRICES[parsedLevel];
    }
  }
  return total;
}

export function formatLessonOutputDifficultyOption(
  band: LessonOutputDifficultyBand,
): string {
  const meta = LESSON_OUTPUT_DIFFICULTY_META[band];
  return `${meta.label} (${meta.ratingHint})`;
}

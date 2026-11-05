import { describe, expect, it } from "vitest";
import {
  LESSON_OUTPUT_DIFFICULTY_BANDS,
  LESSON_OUTPUT_DIFFICULTY_META,
  computeLessonOutputCost,
  getLessonOutputPricingError,
} from "./lesson-output-pricing";

describe("computeLessonOutputCost", () => {
  it.each(
    LESSON_OUTPUT_DIFFICULTY_BANDS.flatMap((band) =>
      [0, 1, 2, 3, 4, 5, 6, 7].map((mask) => {
        const includesTest = Boolean(mask & 1);
        const includesSolution = Boolean(mask & 2);
        const includesLectureVideo = Boolean(mask & 4);
        const prices = LESSON_OUTPUT_DIFFICULTY_META[band];
        const expected =
          (includesTest ? prices.test : 0) +
          (includesSolution ? prices.solution : 0) +
          (includesLectureVideo ? prices.lecture : 0);

        return {
          band,
          includesTest,
          includesSolution,
          includesLectureVideo,
          expected,
        };
      }),
    ),
  )(
    "computes $expected for $band (test=$includesTest solution=$includesSolution lecture=$includesLectureVideo)",
    ({
      band,
      includesTest,
      includesSolution,
      includesLectureVideo,
      expected,
    }) => {
      expect(
        computeLessonOutputCost(band, {
          includesTest,
          includesSolution,
          includesLectureVideo,
          includesTheoryLecture: false,
        }),
      ).toBe(expected);
    },
  );

  it("returns null when band is null", () => {
    expect(
      computeLessonOutputCost(null, {
        includesTest: true,
        includesSolution: true,
        includesLectureVideo: true,
        includesTheoryLecture: false,
      }),
    ).toBeNull();
  });

  const theoryOnly = {
    includesTest: false,
    includesSolution: false,
    includesLectureVideo: false,
    includesTheoryLecture: true,
  };

  it.each([
    ["Level 0", 170000],
    ["Level 3", 200000],
    ["Level 4", 250000],
    ["5", 250000],
  ])("prices theory lecture by %s → %d without band", (level, expected) => {
    expect(computeLessonOutputCost(null, theoryOnly, level)).toBe(expected);
  });

  it("adds theory lecture on top of band-priced items", () => {
    expect(
      computeLessonOutputCost("easy", { ...theoryOnly, includesSolution: true }, "Level 1"),
    ).toBe(LESSON_OUTPUT_DIFFICULTY_META.easy.solution + 180000);
  });
});

describe("getLessonOutputPricingError", () => {
  it("requires level and, with band items, a band", () => {
    const items = {
      includesTest: true,
      includesSolution: false,
      includesLectureVideo: false,
      includesTheoryLecture: true,
    };
    expect(getLessonOutputPricingError("easy", "", items)).toMatch(/level/i);
    expect(getLessonOutputPricingError(null, "Level 2", items)).toMatch(/bậc độ khó/);
    expect(
      getLessonOutputPricingError(null, "Level 2", { ...items, includesTest: false }),
    ).toBeNull();
  });
});

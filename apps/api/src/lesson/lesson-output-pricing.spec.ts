import {
  LESSON_OUTPUT_DIFFICULTY_BANDS,
  LESSON_OUTPUT_DIFFICULTY_PRICES,
  computeLessonOutputCost,
} from './lesson-output-pricing';

describe('computeLessonOutputCost', () => {
  it.each(
    LESSON_OUTPUT_DIFFICULTY_BANDS.flatMap((band) =>
      [0, 1, 2, 3, 4, 5, 6, 7].map((mask) => {
        const includesTest = Boolean(mask & 1);
        const includesSolution = Boolean(mask & 2);
        const includesLectureVideo = Boolean(mask & 4);
        const prices = LESSON_OUTPUT_DIFFICULTY_PRICES[band];
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
    'computes $expected for $band (test=$includesTest solution=$includesSolution lecture=$includesLectureVideo)',
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
        }),
      ).toBe(expected);
    },
  );

  it('returns null when band is null even if every item is ticked', () => {
    expect(
      computeLessonOutputCost(null, {
        includesTest: true,
        includesSolution: true,
        includesLectureVideo: true,
      }),
    ).toBeNull();
  });

  it('returns null when band is undefined', () => {
    expect(
      computeLessonOutputCost(undefined, {
        includesTest: true,
        includesSolution: false,
        includesLectureVideo: false,
      }),
    ).toBeNull();
  });
});

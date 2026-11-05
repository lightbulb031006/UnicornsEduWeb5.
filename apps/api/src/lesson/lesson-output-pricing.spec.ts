import {
  LESSON_OUTPUT_DIFFICULTY_BANDS,
  LESSON_OUTPUT_DIFFICULTY_PRICES,
  computeLessonOutputCost,
  getLessonOutputPricingError,
  parseLessonOutputLevel,
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
          includesTheoryLecture: false,
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
        includesTheoryLecture: false,
      }),
    ).toBeNull();
  });

  it('returns null when band is undefined', () => {
    expect(
      computeLessonOutputCost(undefined, {
        includesTest: true,
        includesSolution: false,
        includesLectureVideo: false,
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
    ['Level 0', 170000],
    ['Level 1', 180000],
    ['Level 2', 190000],
    ['Level 3', 200000],
    ['Level 4', 250000],
    ['5', 250000],
  ])(
    'prices theory lecture by level %s → %d without band',
    (level, expected) => {
      expect(computeLessonOutputCost(null, theoryOnly, level)).toBe(expected);
    },
  );

  it('adds theory lecture price on top of band-priced items', () => {
    expect(
      computeLessonOutputCost(
        'hard',
        { ...theoryOnly, includesTest: true },
        'Level 2',
      ),
    ).toBe(LESSON_OUTPUT_DIFFICULTY_PRICES.hard.test + 190000);
  });
});

describe('parseLessonOutputLevel', () => {
  it.each([
    ['Level 3', 3],
    ['level 0', 0],
    [' 4 ', 4],
    ['Level 6', null],
    ['', null],
    [null, null],
  ])('parses %p → %p', (value, expected) => {
    expect(parseLessonOutputLevel(value)).toBe(expected);
  });
});

describe('getLessonOutputPricingError', () => {
  const none = {
    includesTest: true,
    includesSolution: false,
    includesLectureVideo: false,
    includesTheoryLecture: false,
  };

  it('allows legacy rows without band when theory lecture is not ticked', () => {
    expect(getLessonOutputPricingError(null, null, none)).toBeNull();
  });

  it('requires level when theory lecture is ticked', () => {
    expect(
      getLessonOutputPricingError('easy', null, {
        ...none,
        includesTheoryLecture: true,
      }),
    ).toMatch(/level/i);
  });

  it('requires band when theory lecture is ticked with band-priced items', () => {
    expect(
      getLessonOutputPricingError(null, 'Level 1', {
        ...none,
        includesTheoryLecture: true,
      }),
    ).toMatch(/bậc độ khó/);
  });

  it('accepts theory-only output with level and no band', () => {
    expect(
      getLessonOutputPricingError(null, 'Level 1', {
        ...none,
        includesTest: false,
        includesTheoryLecture: true,
      }),
    ).toBeNull();
  });
});

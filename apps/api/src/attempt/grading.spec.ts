import { AttemptScoring, QuestionSlot, QuestionType } from 'generated/enums';
import {
  GradableAnswer,
  autoGradedMaxOf,
  gradeAnswers,
  gradeTrueFalse,
  isAnswered,
  isElectiveVoided,
  itQuestionPoints,
  normalizeTrueFalseChoices,
  tfChoicesOf,
} from './grading';

const KEY = [true, false, true, false];

let seq = 0;
function sc(correct: boolean, slot = QuestionSlot.required): GradableAnswer {
  return {
    id: `sc-${seq++}`,
    type: QuestionType.single_choice,
    slot,
    pointsPossible: 25,
    choiceIndex: correct ? 1 : 0,
    correctIndex: 1,
    tfChoices: null,
    tfAnswerKey: [],
  };
}
function tf(
  choices: (boolean | null)[] | null,
  slot: QuestionSlot = QuestionSlot.required,
): GradableAnswer {
  return {
    id: `tf-${seq++}`,
    type: QuestionType.true_false_group,
    slot,
    pointsPossible: 100,
    choiceIndex: null,
    correctIndex: null,
    tfChoices: choices,
    tfAnswerKey: KEY,
  };
}

/** Đề chuẩn THPT Tin: 24 trắc nghiệm + 2 Đúng/Sai bắt buộc + 2 + 2 tự chọn. */
function standardExam(opts: {
  scCorrect: number;
  required: (boolean | null)[][];
  e1: ((boolean | null)[] | null)[];
  e2: ((boolean | null)[] | null)[];
}): GradableAnswer[] {
  return [
    ...Array.from({ length: 24 }, (_, i) => sc(i < opts.scCorrect)),
    ...opts.required.map((c) => tf(c)),
    ...opts.e1.map((c) => tf(c, QuestionSlot.elective_1)),
    ...opts.e2.map((c) => tf(c, QuestionSlot.elective_2)),
  ];
}

function single(
  choice: boolean | null,
  key = true,
  pointsPossible = 34,
): GradableAnswer {
  return {
    id: `t-${seq++}`,
    type: QuestionType.true_false,
    slot: QuestionSlot.required,
    pointsPossible,
    choiceIndex: null,
    correctIndex: null,
    tfChoices: choice === null ? null : [choice],
    tfAnswerKey: [key],
  };
}

describe('Câu Đúng/Sai (true_false) — chấm cả câu', () => {
  it('đúng thì đủ điểm câu, sai hoặc bỏ trống thì 0', () => {
    const answers = [single(true), single(false), single(null)];
    const result = gradeAnswers(answers, AttemptScoring.equal_100);
    expect(result.patches.map((p) => [p.isCorrect, p.pointsAwarded])).toEqual([
      [true, 34],
      [false, 0],
      [false, 0],
    ]);
    expect(result.autoGradedScore).toBe(34);
    expect(result.autoGradedMax).toBe(102);
    expect(result.hasUngradedEssay).toBe(false);
  });

  it('đáp án Sai: chọn Sai là đúng', () => {
    const [patch] = gradeAnswers(
      [single(false, false)],
      AttemptScoring.equal_100,
    ).patches;
    expect(patch).toMatchObject({ isCorrect: true, pointsAwarded: 34 });
  });

  it('chọn một lựa chọn là tính đã trả lời', () => {
    const base = {
      type: QuestionType.true_false,
      choiceIndex: null,
      essayAnswer: null,
    };
    expect(isAnswered({ ...base, tfChoices: [false] })).toBe(true);
    expect(isAnswered({ ...base, tfChoices: [null] })).toBe(false);
    expect(isAnswered({ ...base, tfChoices: null })).toBe(false);
  });
});

describe('tfChoicesOf — lựa chọn trả về client theo loại câu', () => {
  it('Câu Đúng/Sai 1 phần tử, nhóm 4 phần tử, loại khác null', () => {
    expect(
      tfChoicesOf(QuestionType.true_false, [true, null, null, null]),
    ).toEqual([true]);
    expect(tfChoicesOf(QuestionType.true_false, null)).toEqual([null]);
    expect(tfChoicesOf(QuestionType.true_false_group, [false])).toEqual([
      false,
      null,
      null,
      null,
    ]);
    expect(tfChoicesOf(QuestionType.single_choice, [true])).toBeNull();
    expect(tfChoicesOf(QuestionType.essay, null)).toBeNull();
  });
});

describe('normalizeTrueFalseChoices', () => {
  it('pads to 4 and drops non-boolean', () => {
    expect(normalizeTrueFalseChoices([true, 'x', false])).toEqual([
      true,
      null,
      false,
      null,
    ]);
    expect(normalizeTrueFalseChoices(null)).toEqual([null, null, null, null]);
  });
});

describe('gradeTrueFalse — bậc thang 0 / 0,1 / 0,25 / 0,5 / 1', () => {
  it.each([
    [[false, true, false, true], 0, 0],
    [[true, true, false, true], 1, 10],
    [[true, false, false, true], 2, 25],
    [[true, false, true, true], 3, 50],
    [[true, false, true, false], 4, 100],
  ])('%j → %i đúng, %i điểm', (choices, correct, points) => {
    expect(gradeTrueFalse(KEY, choices, 100)).toEqual({ correct, points });
  });

  it('nhận định bỏ trống không tính đúng', () => {
    expect(gradeTrueFalse(KEY, [true, null, null, null], 100)).toEqual({
      correct: 1,
      points: 10,
    });
  });
});

describe('isElectiveVoided', () => {
  it('chỉ một nhóm có lựa chọn → không voided', () => {
    expect(
      isElectiveVoided([
        tf(KEY, QuestionSlot.elective_1),
        tf(null, QuestionSlot.elective_2),
        tf([null, null, null, null], QuestionSlot.elective_2),
      ]),
    ).toBe(false);
  });
  it('cả hai nhóm đều có ≥1 nhận định được chọn → voided', () => {
    expect(
      isElectiveVoided([
        tf(KEY, QuestionSlot.elective_1),
        tf([null, null, true, null], QuestionSlot.elective_2),
      ]),
    ).toBe(true);
  });
});

describe('gradeAnswers — đề chuẩn 24 + 2 + 2 + 2 (absolute_it)', () => {
  it('đúng hết, làm một nhóm tự chọn → 10,00 / 10,00', () => {
    const r = gradeAnswers(
      standardExam({
        scCorrect: 24,
        required: [KEY, KEY],
        e1: [KEY, KEY],
        e2: [null, null],
      }),
      AttemptScoring.absolute_it,
    );
    expect(r.autoGradedScore).toBe(1000);
    expect(r.autoGradedMax).toBe(1000);
    expect(r.electiveVoided).toBe(false);
    expect(r.hasUngradedEssay).toBe(false);
  });

  it('làm cả hai nhóm tự chọn → phần tự chọn 0, tối đa 8,00', () => {
    const r = gradeAnswers(
      standardExam({
        scCorrect: 24,
        required: [KEY, KEY],
        e1: [KEY, KEY],
        e2: [[true, null, null, null], null],
      }),
      AttemptScoring.absolute_it,
    );
    expect(r.electiveVoided).toBe(true);
    expect(r.autoGradedScore).toBe(800);
    expect(r.autoGradedMax).toBe(1000);
    const electivePatches = r.patches.slice(26);
    expect(electivePatches.every((p) => p.pointsAwarded === 0)).toBe(true);
    // isCorrect vẫn phản ánh đáp án để xem lại
    expect(electivePatches[0].isCorrect).toBe(true);
  });

  it('điểm lẻ: 20 trắc nghiệm + Đúng/Sai 3 ý + 2 ý', () => {
    const r = gradeAnswers(
      standardExam({
        scCorrect: 20,
        required: [
          [true, false, true, true],
          [true, false, false, true],
        ],
        e1: [],
        e2: [KEY, [false, true, false, true]],
      }),
      AttemptScoring.absolute_it,
    );
    // 20×25 + 50 + 25 + 100 + 0
    expect(r.autoGradedScore).toBe(675);
  });

  it('essay → patch null và hasUngradedEssay', () => {
    const essay: GradableAnswer = {
      ...sc(false),
      type: QuestionType.essay,
      pointsPossible: 50,
    };
    const r = gradeAnswers([sc(true), essay], AttemptScoring.equal_100);
    expect(r.patches[1]).toEqual({
      id: essay.id,
      isCorrect: null,
      pointsAwarded: null,
    });
    expect(r.hasUngradedEssay).toBe(true);
    expect(r.autoGradedMax).toBe(25);
  });
});

describe('autoGradedMaxOf', () => {
  it('equal_100 cộng mọi câu tự chấm, absolute_it chỉ tính nhóm tự chọn lớn hơn', () => {
    const answers = standardExam({
      scCorrect: 0,
      required: [KEY, KEY],
      e1: [KEY, KEY],
      e2: [KEY, KEY],
    });
    expect(autoGradedMaxOf(answers, AttemptScoring.absolute_it)).toBe(1000);
    expect(autoGradedMaxOf(answers, AttemptScoring.equal_100)).toBe(1200);
  });
});

describe('Câu điền vào ô trống', () => {
  const KEY3 = [['から'], ['まで'], ['学校', 'がっこう']];
  function fb(blankAnswers: (string | null)[] | null): GradableAnswer {
    return {
      id: `fb-${seq++}`,
      type: QuestionType.fill_blank,
      slot: QuestionSlot.required,
      pointsPossible: 30,
      choiceIndex: null,
      correctIndex: null,
      tfChoices: null,
      tfAnswerKey: [],
      blankAnswerKey: KEY3,
      blankAnswers,
    };
  }

  it('câu 3 ô đúng 2 ô được 2/3 điểm câu', () => {
    const r = gradeAnswers(
      [fb(['から', 'まで', '大学'])],
      AttemptScoring.equal_100,
    );
    expect(r.patches[0]).toMatchObject({ isCorrect: false, pointsAwarded: 20 });
  });

  it('đủ ô đúng (theo luật chuẩn hoá, khai nhiều đáp án) là đúng cả câu', () => {
    const r = gradeAnswers(
      [fb([' から　', 'まで', 'がっこう'])],
      AttemptScoring.equal_100,
    );
    expect(r.patches[0]).toMatchObject({ isCorrect: true, pointsAwarded: 30 });
  });

  it('ô bỏ trống được 0', () => {
    const r = gradeAnswers([fb([null, '', '  '])], AttemptScoring.equal_100);
    expect(r.patches[0]).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
  });

  it('chỉ tính đã làm khi điền đủ mọi ô', () => {
    const base = {
      type: QuestionType.fill_blank,
      choiceIndex: null,
      essayAnswer: null,
      tfChoices: null,
      blankAnswerKey: KEY3,
    };
    expect(isAnswered({ ...base, blankAnswers: ['から', 'まで', null] })).toBe(
      false,
    );
    expect(isAnswered({ ...base, blankAnswers: ['から', 'まで', '　'] })).toBe(
      false,
    );
    expect(isAnswered({ ...base, blankAnswers: ['から', 'まで', 'x'] })).toBe(
      true,
    );
  });
});

describe('Câu sắp xếp', () => {
  // Thứ tự đúng: の・本・の・机 ; hiển thị [本, の, 机, の] = gốc [1, 0, 3, 2].
  function ord(orderAnswer: string[]) {
    return {
      id: 'o',
      type: QuestionType.ordering,
      slot: QuestionSlot.required,
      pointsPossible: 50,
      choiceIndex: null,
      correctIndex: null,
      tfChoices: null,
      tfAnswerKey: [],
      options: ['本', 'の', '机', 'の'],
      optionOrder: [1, 0, 3, 2],
      orderAnswer,
    };
  }

  it('khớp toàn bộ chuỗi thẻ thì đủ điểm', () => {
    const r = gradeAnswers(
      [ord(['の', '本', 'の', '机'])],
      AttemptScoring.equal_100,
    );
    expect(r.patches[0]).toMatchObject({ isCorrect: true, pointsAwarded: 50 });
  });

  it('sai một vị trí là 0, không chấm từng phần', () => {
    const r = gradeAnswers(
      [ord(['本', 'の', 'の', '机'])],
      AttemptScoring.equal_100,
    );
    expect(r.patches[0]).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
  });

  it('chưa dùng hết thẻ là 0 và chưa trả lời', () => {
    const r = gradeAnswers([ord(['の', '本', 'の'])], AttemptScoring.equal_100);
    expect(r.patches[0]).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
    const base = {
      type: QuestionType.ordering,
      choiceIndex: null,
      essayAnswer: null,
      tfChoices: null,
      options: ['本', 'の', '机', 'の'],
    };
    expect(isAnswered({ ...base, orderAnswer: ['の', '本', 'の'] })).toBe(
      false,
    );
    expect(isAnswered({ ...base, orderAnswer: [] })).toBe(false);
    expect(isAnswered({ ...base, orderAnswer: ['本', 'の', 'の', '机'] })).toBe(
      true,
    );
  });
});

describe('itQuestionPoints', () => {
  it('IT: trắc nghiệm 0,25đ, nhóm Đúng/Sai 1đ (đơn vị 1/100)', () => {
    expect(itQuestionPoints(QuestionType.single_choice)).toBe(25);
    expect(itQuestionPoints(QuestionType.true_false_group)).toBe(100);
  });

  it('loại câu ngoài hồ sơ IT giữ thang trắc nghiệm như trước', () => {
    for (const type of [
      QuestionType.essay,
      QuestionType.true_false,
      QuestionType.fill_blank,
      QuestionType.ordering,
    ]) {
      expect(itQuestionPoints(type)).toBe(25);
    }
  });
});

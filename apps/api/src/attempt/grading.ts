import { AttemptScoring, QuestionSlot, QuestionType } from 'generated/enums';
import { assertNever } from 'src/common/assert-never';
import { allBlanksFilled, gradeFillBlank } from './fill-blank';
import { orderingKeyOf } from './shuffle';

/**
 * Chấm Bài làm — hàm thuần, dùng chung cho nộp bài / hết giờ và chấm lại khi
 * sửa đáp án (ADR 2026-10-07-it-absolute-scoring-and-answer-key-regrade).
 * Chỉ đọc snapshot trên `attempt_answers`.
 */

/** Điểm câu trắc nghiệm hồ sơ IT: 0,25đ = 25 đơn vị 1/100 điểm. */
export const IT_SINGLE_CHOICE_POINTS = 25;
/** Điểm tối đa nhóm câu Đúng/Sai hồ sơ IT: 1đ. */
export const IT_TRUE_FALSE_POINTS = 100;
/** Bậc thang Đúng/Sai theo số nhận định đúng (index = số nhận định đúng). */
export const TRUE_FALSE_TIERS = [0, 10, 25, 50, 100] as const;

/**
 * Điểm câu lúc start bài làm `absolute_it`. Loại câu ngoài hồ sơ IT không lên
 * đề IT — giữ thang trắc nghiệm như trước; thêm loại câu mới thì tsc buộc
 * chọn thang ở đây.
 */
export function itQuestionPoints(type: QuestionType): number {
  switch (type) {
    case QuestionType.true_false_group:
      return IT_TRUE_FALSE_POINTS;
    case QuestionType.single_choice:
    case QuestionType.essay:
    case QuestionType.true_false:
    case QuestionType.fill_blank:
    case QuestionType.ordering:
      return IT_SINGLE_CHOICE_POINTS;
    default:
      return assertNever(type, 'question type');
  }
}

export type TrueFalseChoice = boolean | null;

function stringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string')
    : [];
}

export interface GradableAnswer {
  id: string;
  type: QuestionType;
  slot: QuestionSlot;
  pointsPossible: number;
  choiceIndex: number | null;
  correctIndex: number | null;
  tfChoices: unknown;
  tfAnswerKey: boolean[];
  /** Câu điền vào ô trống: đáp án hợp lệ từng ô (snapshot) và chữ học sinh gõ. */
  blankAnswerKey?: unknown;
  blankAnswers?: unknown;
  /** Câu sắp xếp: thẻ hiển thị (snapshot đã xáo), hoán vị về gốc, chữ thẻ học sinh xếp. */
  options?: unknown;
  optionOrder?: number[];
  orderAnswer?: string[];
}

export interface AnswerGradePatch {
  id: string;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
}

export interface AttemptGradeResult {
  patches: AnswerGradePatch[];
  autoGradedScore: number;
  autoGradedMax: number;
  hasUngradedEssay: boolean;
  electiveVoided: boolean;
}

/** Số nhận định: Câu Đúng/Sai (JP) 1, nhóm câu Đúng/Sai (IT) 4. */
export const TRUE_FALSE_GROUP_SIZE = 4;

/** Chuẩn hoá `tf_choices` (Json) thành mảng `length` phần tử `boolean | null`. */
export function normalizeTrueFalseChoices(
  raw: unknown,
  length = TRUE_FALSE_GROUP_SIZE,
): TrueFalseChoice[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length }, (_, i) =>
    typeof list[i] === 'boolean' ? (list[i] as boolean) : null,
  );
}

/** Số nhận định trả lời khớp đáp án. Bỏ trống không tính đúng. */
export function countCorrectStatements(
  key: boolean[],
  choices: TrueFalseChoice[],
): number {
  return key.reduce(
    (n, expected, i) =>
      choices[i] !== null && choices[i] === expected ? n + 1 : n,
    0,
  );
}

/** Có ít nhất một nhận định được chọn. */
export function hasAnyTrueFalseChoice(raw: unknown): boolean {
  return normalizeTrueFalseChoices(raw).some((c) => c !== null);
}

/**
 * Điểm nhóm câu Đúng/Sai theo bậc thang, quy về `pointsPossible` của câu.
 * IT (`pointsPossible = 100`): 0 / 10 / 25 / 50 / 100.
 */
export function gradeTrueFalse(
  key: boolean[],
  rawChoices: unknown,
  pointsPossible: number,
): { correct: number; points: number } {
  const correct = countCorrectStatements(
    key,
    normalizeTrueFalseChoices(rawChoices),
  );
  const tier = TRUE_FALSE_TIERS[Math.min(correct, 4)];
  return {
    correct,
    points: Math.round((tier * pointsPossible) / IT_TRUE_FALSE_POINTS),
  };
}

/** Lựa chọn của Câu Đúng/Sai một nhận định; null = bỏ trống. */
export function singleTrueFalseChoice(raw: unknown): TrueFalseChoice {
  return normalizeTrueFalseChoices(raw, 1)[0];
}

/** Lựa chọn Đúng/Sai trả cho client: Câu Đúng/Sai 1 phần tử, nhóm 4, loại khác null. */
export function tfChoicesOf(
  type: QuestionType,
  raw: unknown,
): TrueFalseChoice[] | null {
  switch (type) {
    case QuestionType.true_false_group:
      return normalizeTrueFalseChoices(raw);
    case QuestionType.true_false:
      return normalizeTrueFalseChoices(raw, 1);
    case QuestionType.single_choice:
    case QuestionType.essay:
    case QuestionType.fill_blank:
    case QuestionType.ordering:
      return null;
    default:
      return assertNever(type, 'question type');
  }
}

/** Câu đã được trả lời (đủ để tính "đã làm"), theo loại câu. */
export function isAnswered(ans: {
  type: QuestionType;
  choiceIndex: number | null;
  essayAnswer: string | null;
  tfChoices: unknown;
  blankAnswerKey?: unknown;
  blankAnswers?: unknown;
  options?: unknown;
  orderAnswer?: string[];
}): boolean {
  switch (ans.type) {
    case QuestionType.single_choice:
      return ans.choiceIndex != null;
    case QuestionType.essay:
      return Boolean(ans.essayAnswer?.trim());
    case QuestionType.true_false_group:
      // Câu Đúng/Sai chỉ tính đã làm khi đủ cả 4 nhận định.
      return normalizeTrueFalseChoices(ans.tfChoices).every((c) => c !== null);
    case QuestionType.true_false:
      return singleTrueFalseChoice(ans.tfChoices) !== null;
    case QuestionType.fill_blank:
      // Điền đủ mọi ô mới tính đã làm.
      return allBlanksFilled(ans.blankAnswerKey, ans.blankAnswers);
    case QuestionType.ordering: {
      // Dùng hết thẻ mới tính đã làm.
      const cards = stringArray(ans.options);
      return (
        cards.length > 0 && (ans.orderAnswer?.length ?? 0) === cards.length
      );
    }
    default:
      return assertNever(ans.type, 'question type');
  }
}

/**
 * Luật nhóm tự chọn: cả nhóm Tự chọn 1 và Tự chọn 2 đều có ≥1 nhận định được
 * chọn → phần tự chọn 0 điểm.
 */
export function isElectiveVoided(answers: GradableAnswer[]): boolean {
  const touched = (slot: QuestionSlot) =>
    answers.some((a) => a.slot === slot && hasAnyTrueFalseChoice(a.tfChoices));
  return touched(QuestionSlot.elective_1) && touched(QuestionSlot.elective_2);
}

/** Chấm một câu theo loại. `null` = chấm tay (tự luận). */
function gradeOne(
  ans: GradableAnswer,
): { isCorrect: boolean; pointsAwarded: number } | null {
  switch (ans.type) {
    case QuestionType.essay:
      return null;
    case QuestionType.true_false_group: {
      const graded = gradeTrueFalse(
        ans.tfAnswerKey,
        ans.tfChoices,
        ans.pointsPossible,
      );
      return { isCorrect: graded.correct === 4, pointsAwarded: graded.points };
    }
    case QuestionType.true_false: {
      // Chấm cả câu, không bậc thang: đúng đủ điểm, sai/bỏ trống 0.
      const choice = singleTrueFalseChoice(ans.tfChoices);
      const isCorrect = choice !== null && choice === ans.tfAnswerKey[0];
      return { isCorrect, pointsAwarded: isCorrect ? ans.pointsPossible : 0 };
    }
    case QuestionType.fill_blank: {
      const graded = gradeFillBlank(
        ans.blankAnswerKey,
        ans.blankAnswers,
        ans.pointsPossible,
      );
      return {
        isCorrect: graded.total > 0 && graded.correct === graded.total,
        pointsAwarded: graded.points,
      };
    }
    case QuestionType.ordering: {
      // So theo chữ thẻ: thẻ trùng chữ đổi chỗ vẫn đúng. Khớp toàn bộ mới có điểm.
      const key = orderingKeyOf(
        stringArray(ans.options),
        ans.optionOrder ?? [],
      );
      const given = ans.orderAnswer ?? [];
      const isCorrect =
        key.length > 0 &&
        given.length === key.length &&
        given.every((text, i) => text === key[i]);
      return { isCorrect, pointsAwarded: isCorrect ? ans.pointsPossible : 0 };
    }
    case QuestionType.single_choice: {
      const isCorrect =
        ans.choiceIndex != null && ans.choiceIndex === ans.correctIndex;
      return { isCorrect, pointsAwarded: isCorrect ? ans.pointsPossible : 0 };
    }
    default:
      return assertNever(ans.type, 'question type');
  }
}

export function gradeAnswers(
  answers: GradableAnswer[],
  scoring: AttemptScoring,
): AttemptGradeResult {
  const electiveVoided = isElectiveVoided(answers);
  let autoGradedScore = 0;
  let hasUngradedEssay = false;

  const patches = answers.map((ans): AnswerGradePatch => {
    const graded = gradeOne(ans);
    if (graded === null) {
      hasUngradedEssay = true;
      return { id: ans.id, isCorrect: null, pointsAwarded: null };
    }
    let { pointsAwarded } = graded;
    if (electiveVoided && ans.slot !== QuestionSlot.required) {
      pointsAwarded = 0;
    }
    autoGradedScore += pointsAwarded;
    return { id: ans.id, isCorrect: graded.isCorrect, pointsAwarded };
  });

  return {
    patches,
    autoGradedScore,
    autoGradedMax: autoGradedMaxOf(answers, scoring),
    hasUngradedEssay,
    electiveVoided,
  };
}

/**
 * Điểm tối đa phần tự chấm. Câu tự luận không tính (chấm tay).
 * Nhóm tự chọn chỉ tính một nhóm (học sinh chỉ được làm một nhóm).
 */
export function autoGradedMaxOf(
  answers: Pick<GradableAnswer, 'type' | 'slot' | 'pointsPossible'>[],
  scoring: AttemptScoring,
): number {
  const sumOf = (filter: (a: (typeof answers)[number]) => boolean) =>
    answers
      .filter((a) => a.type !== QuestionType.essay && filter(a))
      .reduce((sum, a) => sum + a.pointsPossible, 0);
  const required = sumOf((a) => a.slot === QuestionSlot.required);
  if (scoring !== AttemptScoring.absolute_it) {
    return sumOf(() => true);
  }
  const e1 = sumOf((a) => a.slot === QuestionSlot.elective_1);
  const e2 = sumOf((a) => a.slot === QuestionSlot.elective_2);
  return required + Math.max(e1, e2);
}

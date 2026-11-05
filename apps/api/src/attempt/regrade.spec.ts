jest.mock('../../generated/client', () => ({}));

import { AttemptScoring, QuestionSlot, QuestionType } from 'generated/enums';
import { regradeQuestionAnswerKey } from './regrade';

function answer(over: Record<string, unknown>) {
  return {
    id: 'a',
    questionId: 'q',
    type: QuestionType.single_choice,
    slot: QuestionSlot.required,
    pointsPossible: 25,
    choiceIndex: 2,
    correctIndex: 1,
    tfChoices: null,
    tfAnswerKey: [],
    isCorrect: false,
    pointsAwarded: 0,
    ...over,
  };
}

function makeTx(attempts: unknown[], shuffledRows: unknown[] = []) {
  return {
    attemptAnswer: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue(shuffledRows),
      update: jest.fn().mockResolvedValue({}),
    },
    attempt: {
      findMany: jest.fn().mockResolvedValue(attempts),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('regradeQuestionAnswerKey', () => {
  it('không đổi đáp án → không làm gì', async () => {
    const tx = makeTx([]);
    expect(await regradeQuestionAnswerKey(tx as never, 'q', {})).toBe(0);
    expect(tx.attemptAnswer.updateMany).not.toHaveBeenCalled();
  });

  it('sửa correctIndex → ghi snapshot + chấm lại bài đã nộp', async () => {
    // Snapshot findMany trả về đã có đáp án mới (updateMany chạy trước).
    const tx = makeTx([
      {
        id: 'att-1',
        scoring: AttemptScoring.absolute_it,
        answers: [
          answer({ id: 'a1', correctIndex: 2 }),
          answer({
            id: 'a2',
            questionId: 'other',
            choiceIndex: 0,
            correctIndex: 0,
            isCorrect: true,
            pointsAwarded: 25,
          }),
        ],
      },
    ]);

    const n = await regradeQuestionAnswerKey(tx as never, 'q', {
      correctIndex: 2,
    });

    expect(n).toBe(1);
    expect(tx.attemptAnswer.updateMany).toHaveBeenCalledWith({
      where: { questionId: 'q', optionOrder: { isEmpty: true } },
      data: { correctIndex: 2 },
    });
    // Chỉ câu thay đổi mới được ghi.
    expect(tx.attemptAnswer.update).toHaveBeenCalledTimes(1);
    expect(tx.attemptAnswer.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { isCorrect: true, pointsAwarded: 25 },
    });
    expect(tx.attempt.update).toHaveBeenCalledWith({
      where: { id: 'att-1' },
      data: { autoGradedScore: 50, autoGradedMax: 50, electiveVoided: false },
    });
  });

  it('sửa tfAnswerKey → điểm Đúng/Sai theo bậc thang mới, giữ điểm tự luận', async () => {
    const tx = makeTx([
      {
        id: 'att-2',
        scoring: AttemptScoring.absolute_it,
        answers: [
          answer({
            id: 'tf',
            type: QuestionType.true_false_group,
            pointsPossible: 100,
            choiceIndex: null,
            correctIndex: null,
            tfChoices: [true, true, true, true],
            tfAnswerKey: [true, true, true, false],
            pointsAwarded: 25,
          }),
          answer({
            id: 'es',
            questionId: 'e',
            type: QuestionType.essay,
            pointsAwarded: 40,
          }),
        ],
      },
    ]);

    await regradeQuestionAnswerKey(tx as never, 'q', {
      tfAnswerKey: [true, true, true, false],
    });

    expect(tx.attemptAnswer.update).toHaveBeenCalledTimes(1);
    expect(tx.attemptAnswer.update).toHaveBeenCalledWith({
      where: { id: 'tf' },
      data: { isCorrect: false, pointsAwarded: 50 },
    });
    expect(tx.attempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          answers: { some: { questionId: 'q' } },
        }),
      }),
    );
  });

  it('Câu Đúng/Sai (JP): đổi đáp án Đúng→Sai chấm lại cả câu', async () => {
    const tx = makeTx([
      {
        id: 'att-jp',
        scoring: AttemptScoring.equal_100,
        answers: [
          // Snapshot đã có đáp án mới (Sai); học sinh chọn Sai, trước đó bị chấm sai.
          answer({
            id: 'j1',
            type: QuestionType.true_false,
            pointsPossible: 50,
            choiceIndex: null,
            correctIndex: null,
            tfChoices: [false],
            tfAnswerKey: [false],
            isCorrect: false,
            pointsAwarded: 0,
          }),
        ],
      },
    ]);

    await regradeQuestionAnswerKey(tx as never, 'q', { tfAnswerKey: [false] });

    expect(tx.attemptAnswer.updateMany).toHaveBeenCalledWith({
      where: { questionId: 'q', optionOrder: { isEmpty: true } },
      data: { tfAnswerKey: [false] },
    });
    expect(tx.attemptAnswer.update).toHaveBeenCalledWith({
      where: { id: 'j1' },
      data: { isCorrect: true, pointsAwarded: 50 },
    });
    expect(tx.attempt.update).toHaveBeenCalledWith({
      where: { id: 'att-jp' },
      data: { autoGradedScore: 50, autoGradedMax: 50, electiveVoided: false },
    });
  });

  it('câu điền ô trống: thêm đáp án hợp lệ → chấm lại; snapshot khác số ô giữ nguyên', async () => {
    const newKey = [['から'], ['まで', 'までに']];
    const tx = makeTx(
      [
        {
          id: 'att-fb',
          scoring: AttemptScoring.equal_100,
          answers: [
            // Snapshot đã có đáp án mới; học sinh gõ "までに", trước bị chấm 1/2.
            answer({
              id: 'f1',
              type: QuestionType.fill_blank,
              pointsPossible: 40,
              choiceIndex: null,
              correctIndex: null,
              blankAnswerKey: newKey,
              blankAnswers: ['から', 'までに'],
              isCorrect: false,
              pointsAwarded: 20,
            }),
          ],
        },
      ],
      [
        { id: 'same', blankAnswerKey: [['から'], ['まで']] },
        { id: 'fewer', blankAnswerKey: [['から']] },
      ],
    );

    await regradeQuestionAnswerKey(tx as never, 'q', {
      blankAnswerKey: newKey,
    });

    expect(tx.attemptAnswer.update).toHaveBeenCalledWith({
      where: { id: 'same' },
      data: { blankAnswerKey: newKey },
    });
    expect(tx.attemptAnswer.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'fewer' } }),
    );
    expect(tx.attemptAnswer.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { isCorrect: true, pointsAwarded: 40 },
    });
  });

  it('câu sắp xếp: đổi thứ tự đúng cùng bộ thẻ → chấm lại; khác bộ thẻ giữ nguyên', async () => {
    const newKey = ['b', 'c', 'a'];
    const tx = makeTx(
      [
        {
          id: 'att-ord',
          scoring: AttemptScoring.equal_100,
          answers: [
            // Snapshot đã ghi optionOrder mới: hiển thị [c, a, b] → đúng = b, c, a.
            answer({
              id: 'o1',
              type: QuestionType.ordering,
              pointsPossible: 40,
              choiceIndex: null,
              correctIndex: null,
              options: ['c', 'a', 'b'],
              optionOrder: [1, 2, 0],
              orderAnswer: ['b', 'c', 'a'],
              isCorrect: false,
              pointsAwarded: 0,
            }),
          ],
        },
      ],
      [
        { id: 'same', options: ['c', 'a', 'b'], optionOrder: [2, 0, 1] },
        { id: 'edited', options: ['c', 'a', 'x'], optionOrder: [2, 0, 1] },
      ],
    );

    await regradeQuestionAnswerKey(tx as never, 'q', { orderingKey: newKey });

    expect(tx.attemptAnswer.update).toHaveBeenCalledWith({
      where: { id: 'same' },
      data: { optionOrder: [1, 2, 0] },
    });
    expect(tx.attemptAnswer.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'edited' } }),
    );
    expect(tx.attemptAnswer.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { isCorrect: true, pointsAwarded: 40 },
    });
  });

  it('snapshot đã đảo đáp án → đổi đáp án mới sang thứ tự hiển thị của lượt', async () => {
    // Lượt x: hiển thị [c, a, d, b]; lượt y: Đúng/Sai hiển thị [d, c, b, a].
    const tx = makeTx(
      [],
      [
        { id: 'x', optionOrder: [2, 0, 3, 1] },
        { id: 'y', optionOrder: [3, 2, 1, 0] },
      ],
    );
    await regradeQuestionAnswerKey(tx as never, 'q', {
      correctIndex: 3,
      tfAnswerKey: [true, true, false, false],
    });
    expect(tx.attemptAnswer.update).toHaveBeenCalledWith({
      where: { id: 'x' },
      data: { correctIndex: 2, tfAnswerKey: [false, true, false, true] },
    });
    expect(tx.attemptAnswer.update).toHaveBeenCalledWith({
      where: { id: 'y' },
      data: { correctIndex: 0, tfAnswerKey: [false, false, true, true] },
    });
  });
});

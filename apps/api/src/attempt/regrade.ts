import { Prisma } from '../../generated/client';
import { AttemptStatus, QuestionType } from 'generated/enums';
import { parseBlankAnswerKey } from './fill-blank';
import { gradeAnswers } from './grading';
import { remapAnswerKey, reorderForKey } from './shuffle';

/**
 * Chấm lại khi sửa đáp án đúng (ADR 2026-10-07-it-absolute-scoring-and-answer-key-regrade):
 * ghi đáp án mới vào snapshot của mọi Bài làm chứa câu (kể cả lượt đang làm),
 * rồi tính lại điểm các lượt đã đóng. Im lặng, không thông báo.
 *
 * @returns số Bài làm đã đóng được chấm lại.
 */
export async function regradeQuestionAnswerKey(
  tx: Prisma.TransactionClient,
  questionId: string,
  key: {
    correctIndex?: number | null;
    tfAnswerKey?: boolean[];
    blankAnswerKey?: string[][];
    /** Câu sắp xếp: thẻ theo thứ tự đúng mới. */
    orderingKey?: string[];
  },
): Promise<number> {
  const { blankAnswerKey, orderingKey, ...optionKey } = key;
  const data: Prisma.AttemptAnswerUpdateManyMutationInput = {};
  if (optionKey.correctIndex !== undefined) {
    data.correctIndex = optionKey.correctIndex;
  }
  if (optionKey.tfAnswerKey !== undefined) {
    data.tfAnswerKey = optionKey.tfAnswerKey;
  }
  if (
    Object.keys(data).length === 0 &&
    blankAnswerKey === undefined &&
    orderingKey === undefined
  ) {
    return 0;
  }

  if (Object.keys(data).length > 0) {
    // Snapshot không đảo: ghi thẳng. Snapshot đã đảo: đổi đáp án sang thứ tự hiển thị của lượt đó.
    await tx.attemptAnswer.updateMany({
      where: { questionId, optionOrder: { isEmpty: true } },
      data,
    });
    const shuffledRows = await tx.attemptAnswer.findMany({
      where: { questionId, NOT: { optionOrder: { isEmpty: true } } },
      select: { id: true, optionOrder: true },
    });
    for (const row of shuffledRows) {
      await tx.attemptAnswer.update({
        where: { id: row.id },
        data: remapAnswerKey(row.optionOrder, optionKey),
      });
    }
  }

  if (blankAnswerKey !== undefined) {
    // Chỉ snapshot cùng số ô: thêm/bớt ô không làm bài cũ đổi.
    const rows = await tx.attemptAnswer.findMany({
      where: { questionId, type: QuestionType.fill_blank },
      select: { id: true, blankAnswerKey: true },
    });
    for (const row of rows) {
      if (
        parseBlankAnswerKey(row.blankAnswerKey).length !== blankAnswerKey.length
      ) {
        continue;
      }
      await tx.attemptAnswer.update({
        where: { id: row.id },
        data: { blankAnswerKey },
      });
    }
  }

  if (orderingKey !== undefined) {
    // Thẻ hiển thị giữ nguyên; chỉ đổi hoán vị về thứ tự đúng mới. Bộ thẻ khác → bỏ qua.
    const rows = await tx.attemptAnswer.findMany({
      where: { questionId, type: QuestionType.ordering },
      select: { id: true, options: true, optionOrder: true },
    });
    for (const row of rows) {
      const cards = Array.isArray(row.options)
        ? row.options.filter((x): x is string => typeof x === 'string')
        : [];
      const optionOrder = reorderForKey(cards, orderingKey);
      if (optionOrder === null) continue;
      await tx.attemptAnswer.update({
        where: { id: row.id },
        data: { optionOrder },
      });
    }
  }

  const attempts = await tx.attempt.findMany({
    where: {
      status: { in: [AttemptStatus.submitted, AttemptStatus.timed_out] },
      answers: { some: { questionId } },
    },
    include: { answers: { orderBy: { order: 'asc' } } },
  });

  for (const attempt of attempts) {
    const graded = gradeAnswers(attempt.answers, attempt.scoring);
    for (const patch of graded.patches) {
      const before = attempt.answers.find((a) => a.id === patch.id);
      // Câu tự luận giữ điểm gia sư đã chấm.
      if (!before || patch.pointsAwarded === null) continue;
      if (
        before.pointsAwarded === patch.pointsAwarded &&
        before.isCorrect === patch.isCorrect
      ) {
        continue;
      }
      await tx.attemptAnswer.update({
        where: { id: patch.id },
        data: {
          isCorrect: patch.isCorrect,
          pointsAwarded: patch.pointsAwarded,
        },
      });
    }
    await tx.attempt.update({
      where: { id: attempt.id },
      data: {
        autoGradedScore: graded.autoGradedScore,
        autoGradedMax: graded.autoGradedMax,
        electiveVoided: graded.electiveVoided,
      },
    });
  }
  return attempts.length;
}

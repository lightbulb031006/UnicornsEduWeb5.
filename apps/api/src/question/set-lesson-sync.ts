import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

type LinkClient = Pick<PrismaService, 'questionLink' | 'lessonQuiz'>;

/** Order của câu cuối bộ trong từng tiết (null tính 0). */
function lastOrderByLesson(
  rows: { lessonId: string; order: number | null }[],
): Map<string, number> {
  const last = new Map<string, number>();
  for (const { lessonId, order } of rows) {
    last.set(lessonId, Math.max(last.get(lessonId) ?? -1, order ?? 0));
  }
  return last;
}

/**
 * Tiết đi theo bộ (ADR 2026-10-09-question-set): câu mới vào bộ được thêm vào
 * mọi tiết thực hành / bài ôn đang dùng bộ, ngay sau câu cuối của bộ, trọng số
 * mặc định. Lượt đã bắt đầu đọc snapshot nên không đổi.
 */
export async function linkQuestionToSetLessons(
  tx: LinkClient,
  questionId: string,
  sharedMaterialId: string,
): Promise<void> {
  const setMembers = {
    questionId: { not: questionId },
    question: { sharedMaterialId, deletedAt: null },
  };
  const select = { lessonId: true, order: true } as const;
  const [practiceLinks, quizLinks] = await Promise.all([
    tx.questionLink.findMany({ where: setMembers, select }),
    tx.lessonQuiz.findMany({ where: setMembers, select }),
  ]);

  for (const [lessonId, last] of lastOrderByLesson(practiceLinks)) {
    await tx.questionLink.updateMany({
      where: { lessonId, order: { gt: last } },
      data: { order: { increment: 1 } },
    });
    await tx.questionLink.create({
      data: { lessonId, questionId, order: last + 1, points: null },
    });
  }
  for (const [lessonId, last] of lastOrderByLesson(quizLinks)) {
    await tx.lessonQuiz.updateMany({
      where: { lessonId, order: { gt: last } },
      data: { order: { increment: 1 } },
    });
    await tx.lessonQuiz.create({
      data: { lessonId, questionId, order: last + 1 },
    });
  }
}

/**
 * Câu (chưa xoá) của bộ theo thứ tự bộ, để thêm nguyên bộ vào tiết / bài ôn.
 * Bộ phải tồn tại, cùng khoá với tiết và có ít nhất một câu.
 */
export async function setQuestionIdsForLesson(
  prisma: Pick<PrismaService, 'sharedMaterial' | 'question'>,
  sharedMaterialId: string,
  courseId: string | null,
): Promise<string[]> {
  const set = await prisma.sharedMaterial.findUnique({
    where: { id: sharedMaterialId },
    select: { id: true, courseId: true, deletedAt: true },
  });
  if (!set || set.deletedAt)
    throw new NotFoundException('Không tìm thấy bộ câu hỏi.');
  if (set.courseId !== courseId) {
    throw new BadRequestException('Bộ câu hỏi phải thuộc cùng khoá với tiết.');
  }
  const questions = await prisma.question.findMany({
    where: { sharedMaterialId, deletedAt: null },
    orderBy: [{ setPosition: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  if (questions.length === 0) {
    throw new BadRequestException('Bộ chưa có câu.');
  }
  return questions.map((q) => q.id);
}

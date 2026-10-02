import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LessonKind } from 'generated/enums';
import {
  ActionHistoryActor,
  CourseContentSupportService,
} from './course-content-support.service';

@Injectable()
export class LessonQuizService extends CourseContentSupportService {
  protected readonly logger = new Logger(LessonQuizService.name);

  private async loadTheoryLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }
    if (lesson.kind !== LessonKind.theory) {
      throw new BadRequestException(
        'Chỉ tiết lý thuyết mới có bài tập ôn nhẹ',
      );
    }
    return lesson;
  }

  async linkQuizQuestions(
    lessonId: string,
    questionIds: string[],
    actor: ActionHistoryActor,
  ): Promise<void> {
    const lesson = await this.loadTheoryLesson(lessonId);
    await this.assertCanManageOwnedAcademicContent(actor, lesson);

    if (lesson.courseId) {
      const questions = await this.prisma.question.findMany({
        where: {
          id: { in: questionIds },
          courseId: lesson.courseId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (questions.length !== questionIds.length) {
        throw new BadRequestException(
          'Một số câu hỏi không thuộc khoá học này',
        );
      }
    }

    const maxOrder = await this.prisma.lessonQuiz.aggregate({
      where: { lessonId },
      _max: { order: true },
    });
    let nextOrder = (maxOrder._max.order ?? -1) + 1;

    await this.prisma.$transaction(async (tx) => {
      for (const questionId of questionIds) {
        const existing = await tx.lessonQuiz.findUnique({
          where: { lessonId_questionId: { lessonId, questionId } },
        });
        if (!existing) {
          await tx.lessonQuiz.create({
            data: { lessonId, questionId, order: nextOrder++ },
          });
        }
      }

      await this.actionHistory.recordCreate(tx, {
        entityType: 'lesson_quiz',
        entityId: lessonId,
        actor,
        afterValue: { lessonId, questionIds },
      });
    });

    this.logger.log(
      `Quiz questions linked to lesson ${lessonId} by ${actor.userEmail}`,
    );
  }

  async unlinkQuizQuestion(
    lessonId: string,
    questionId: string,
    actor: ActionHistoryActor,
  ): Promise<void> {
    const lesson = await this.loadTheoryLesson(lessonId);
    await this.assertCanManageOwnedAcademicContent(actor, lesson);

    const link = await this.prisma.lessonQuiz.findUnique({
      where: { lessonId_questionId: { lessonId, questionId } },
    });
    if (!link) {
      throw new NotFoundException('Câu hỏi chưa được gắn vào tiết học này');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.lessonQuiz.delete({
        where: { lessonId_questionId: { lessonId, questionId } },
      });

      await this.actionHistory.recordDelete(tx, {
        entityType: 'lesson_quiz',
        entityId: lessonId,
        actor,
        beforeValue: link,
      });
    });

    this.logger.log(
      `Quiz question ${questionId} unlinked from lesson ${lessonId} by ${actor.userEmail}`,
    );
  }

  async getLessonQuizzes(lessonId: string, actor: ActionHistoryActor) {
    const lesson = await this.loadTheoryLesson(lessonId);
    await this.assertCanManageOwnedAcademicContent(actor, lesson);

    return this.prisma.lessonQuiz.findMany({
      where: { lessonId },
      orderBy: { order: 'asc' },
      include: {
        question: {
          select: {
            id: true,
            type: true,
            content: true,
            options: true,
            correctIndex: true,
            explanation: true,
            answerGuide: true,
          },
        },
      },
    });
  }

  async getLessonQuizzesForStudent(lessonId: string) {
    await this.loadTheoryLesson(lessonId);

    const quizzes = await this.prisma.lessonQuiz.findMany({
      where: { lessonId },
      orderBy: { order: 'asc' },
      include: {
        question: {
          select: {
            id: true,
            type: true,
            content: true,
            options: true,
            explanation: true,
            answerGuide: true,
          },
        },
      },
    });

    return quizzes.map((q) => ({
      ...q,
      question: { ...q.question, correctIndex: null },
    }));
  }

  async submitQuizAnswers(
    lessonId: string,
    studentId: string,
    answers: {
      questionId: string;
      choiceIndex?: number | null;
      essayAnswer?: string | null;
    }[],
  ) {
    await this.loadTheoryLesson(lessonId);

    const linkedQuestionIds = (
      await this.prisma.lessonQuiz.findMany({
        where: { lessonId },
        select: { questionId: true },
      })
    ).map((q) => q.questionId);

    const linkedQuestionIdSet = new Set(linkedQuestionIds);
    const invalid = answers.filter(
      (a) => !linkedQuestionIdSet.has(a.questionId),
    );
    if (invalid.length) {
      throw new BadRequestException('Một số câu hỏi không thuộc tiết học này');
    }

    await this.prisma.$transaction(
      answers.map((a) =>
        this.prisma.lessonQuizAnswer.upsert({
          where: {
            lessonId_questionId_studentId: {
              lessonId,
              questionId: a.questionId,
              studentId,
            },
          },
          create: {
            lessonId,
            questionId: a.questionId,
            studentId,
            choiceIndex: a.choiceIndex ?? null,
            essayAnswer: a.essayAnswer ?? null,
          },
          update: {
            choiceIndex: a.choiceIndex ?? null,
            essayAnswer: a.essayAnswer ?? null,
          },
        }),
      ),
    );

    return this.prisma.lessonQuizAnswer.findMany({
      where: { lessonId, studentId },
      include: {
        question: {
          select: {
            id: true,
            type: true,
            content: true,
            options: true,
            correctIndex: true,
            explanation: true,
            answerGuide: true,
          },
        },
      },
    });
  }

  async getQuizAnswers(lessonId: string, studentId: string) {
    return this.prisma.lessonQuizAnswer.findMany({
      where: { lessonId, studentId },
      include: {
        question: {
          select: {
            id: true,
            type: true,
            content: true,
            options: true,
            correctIndex: true,
            explanation: true,
            answerGuide: true,
          },
        },
      },
    });
  }
}

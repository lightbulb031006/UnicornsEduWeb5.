import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LessonKind, QuestionType } from 'generated/enums';
import { parseBlankAnswerKey } from '../attempt/fill-blank';
import {
  groupByMaterial,
  seededRng,
  setSlotOf,
  shuffleOrderingCards,
} from '../attempt/shuffle';
import { orderQuizAnswers } from './quiz-review-order';
import { normalizeTrueFalseChoices } from '../attempt/grading';
import { resolveAudioRefs } from '../question/audio-asset.service';
import { setQuestionIdsForLesson } from '../question/set-lesson-sync';
import {
  ActionHistoryActor,
  CourseContentSupportService,
} from './course-content-support.service';

@Injectable()
export class LessonQuizService extends CourseContentSupportService {
  protected readonly logger = new Logger(LessonQuizService.name);

  /** Ký URL audio của câu + tư liệu (một lần gọi storage cho cả lô). */
  private async withQuizAudio<
    T extends {
      question: {
        audioId: string | null;
        sharedMaterial: { audioId: string | null } | null;
      };
    },
  >(rows: T[]) {
    const refs = await resolveAudioRefs(
      this.prisma,
      rows.flatMap((r) => [
        r.question.audioId,
        r.question.sharedMaterial?.audioId,
      ]),
    );
    const urlOf = (id: string | null | undefined) =>
      id ? (refs.get(id)?.url ?? null) : null;
    return rows.map((r) => ({
      ...r,
      question: {
        ...r.question,
        audioUrl: urlOf(r.question.audioId),
        sharedMaterial: r.question.sharedMaterial && {
          ...r.question.sharedMaterial,
          audioUrl: urlOf(r.question.sharedMaterial.audioId),
        },
      },
    }));
  }

  private async loadTheoryLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }
    if (lesson.kind !== LessonKind.theory) {
      throw new BadRequestException('Chỉ tiết lý thuyết mới có bài tập ôn nhẹ');
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
        select: { id: true, sharedMaterialId: true },
      });
      if (questions.length !== questionIds.length) {
        throw new BadRequestException(
          'Một số câu hỏi không thuộc khoá học này',
        );
      }
      // Bộ câu hỏi vào bài ôn theo cả bộ (ADR 2026-10-09-question-set).
      if (questions.some((q) => q.sharedMaterialId)) {
        throw new BadRequestException('Câu thuộc bộ — thêm cả bộ vào bài ôn.');
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
      include: { question: { select: { sharedMaterialId: true } } },
    });
    if (!link) {
      throw new NotFoundException('Câu hỏi chưa được gắn vào tiết học này');
    }
    if (link.question.sharedMaterialId) {
      throw new BadRequestException('Câu thuộc bộ — gỡ cả bộ khỏi bài ôn.');
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

  /** Thêm nguyên Bộ câu hỏi vào bài ôn: mọi câu theo thứ tự bộ, nối cuối. */
  async addSetToQuiz(
    lessonId: string,
    sharedMaterialId: string,
    actor: ActionHistoryActor,
  ): Promise<void> {
    const lesson = await this.loadTheoryLesson(lessonId);
    await this.assertCanManageOwnedAcademicContent(actor, lesson);

    const questionIds = await setQuestionIdsForLesson(
      this.prisma,
      sharedMaterialId,
      lesson.courseId,
    );
    const already = await this.prisma.lessonQuiz.count({
      where: { lessonId, question: { sharedMaterialId } },
    });
    if (already > 0) throw new BadRequestException('Bộ đã có trong bài ôn.');

    const { _max } = await this.prisma.lessonQuiz.aggregate({
      where: { lessonId },
      _max: { order: true },
    });
    const start = (_max.order ?? -1) + 1;
    await this.prisma.$transaction(async (tx) => {
      await tx.lessonQuiz.createMany({
        data: questionIds.map((questionId, i) => ({
          lessonId,
          questionId,
          order: start + i,
        })),
      });
      await this.actionHistory.recordCreate(tx, {
        entityType: 'lesson_quiz',
        entityId: lessonId,
        actor,
        afterValue: { lessonId, sharedMaterialId, questionIds },
      });
    });
    this.logger.log(
      `Question set ${sharedMaterialId} linked to quiz of lesson ${lessonId} by ${actor.userEmail}`,
    );
  }

  /** Gỡ cả Bộ câu hỏi khỏi bài ôn. */
  async removeSetFromQuiz(
    lessonId: string,
    sharedMaterialId: string,
    actor: ActionHistoryActor,
  ): Promise<void> {
    const lesson = await this.loadTheoryLesson(lessonId);
    await this.assertCanManageOwnedAcademicContent(actor, lesson);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.lessonQuiz.deleteMany({
        where: { lessonId, question: { sharedMaterialId } },
      });
      if (count === 0) {
        throw new NotFoundException('Bộ không có trong bài ôn.');
      }
      await this.actionHistory.recordDelete(tx, {
        entityType: 'lesson_quiz',
        entityId: lessonId,
        actor,
        beforeValue: { lessonId, sharedMaterialId },
      });
    });
    this.logger.log(
      `Question set ${sharedMaterialId} unlinked from quiz of lesson ${lessonId} by ${actor.userEmail}`,
    );
  }

  async getLessonQuizzes(lessonId: string, actor: ActionHistoryActor) {
    const lesson = await this.loadTheoryLesson(lessonId);
    await this.assertCanManageOwnedAcademicContent(actor, lesson);

    const rows = await this.prisma.lessonQuiz.findMany({
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
            tfAnswerKey: true,
            explanation: true,
            answerGuide: true,
            essayInputSize: true,
            tfLabelStyle: true,
            blankAnswerKey: true,
            audioId: true,
            sharedMaterialId: true,
            setPosition: true,
            sharedMaterial: {
              select: { id: true, content: true, audioId: true },
            },
          },
        },
      },
    });
    return this.withQuizAudio(rows);
  }

  async getLessonQuizzesForStudent(lessonId: string, studentId: string) {
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
            essayInputSize: true,
            tfLabelStyle: true,
            blankAnswerKey: true,
            audioId: true,
            sharedMaterialId: true,
            setPosition: true,
            sharedMaterial: {
              select: { id: true, content: true, audioId: true },
            },
          },
        },
      },
    });

    // Học sinh chỉ biết số ô trống, không thấy đáp án hợp lệ. Thẻ câu sắp xếp
    // xáo theo seed học sinh + câu: tải lại không đổi thứ tự, không lộ đáp án.
    // Câu cùng Bộ câu hỏi đứng liền nhau (tại câu đầu của khối), theo thứ tự bộ.
    const grouped = groupByMaterial(quizzes, (q) => setSlotOf(q.question));
    return this.withQuizAudio(
      grouped.map((q) => ({
        ...q,
        question: {
          ...q.question,
          options:
            q.question.type === QuestionType.ordering
              ? shuffleOrderingCards(
                  Array.isArray(q.question.options)
                    ? (q.question.options as string[])
                    : [],
                  seededRng(`${studentId}:${q.question.id}`),
                ).options
              : q.question.options,
          correctIndex: null,
          tfAnswerKey: [],
          blankAnswerKey: null,
          blankCount:
            q.question.type === QuestionType.fill_blank
              ? parseBlankAnswerKey(q.question.blankAnswerKey).length
              : null,
        },
      })),
    );
  }

  async submitQuizAnswers(
    lessonId: string,
    studentId: string,
    answers: {
      questionId: string;
      choiceIndex?: number | null;
      essayAnswer?: string | null;
      tfChoices?: unknown;
      blankAnswers?: (string | null)[] | null;
      orderAnswer?: string[] | null;
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
            ...(a.tfChoices != null && {
              tfChoices: normalizeTrueFalseChoices(a.tfChoices),
            }),
            ...(a.blankAnswers != null && {
              blankAnswers: a.blankAnswers.map((b) =>
                typeof b === 'string' ? b : null,
              ),
            }),
            ...(a.orderAnswer != null && { orderAnswer: a.orderAnswer }),
          },
          update: {
            choiceIndex: a.choiceIndex ?? null,
            essayAnswer: a.essayAnswer ?? null,
            ...(a.tfChoices != null && {
              tfChoices: normalizeTrueFalseChoices(a.tfChoices),
            }),
            ...(a.blankAnswers != null && {
              blankAnswers: a.blankAnswers.map((b) =>
                typeof b === 'string' ? b : null,
              ),
            }),
            ...(a.orderAnswer != null && { orderAnswer: a.orderAnswer }),
          },
        }),
      ),
    );

    const rows = await this.prisma.lessonQuizAnswer.findMany({
      where: { lessonId, studentId },
      include: {
        question: {
          select: {
            id: true,
            type: true,
            content: true,
            options: true,
            correctIndex: true,
            tfAnswerKey: true,
            explanation: true,
            answerGuide: true,
            essayInputSize: true,
            tfLabelStyle: true,
            blankAnswerKey: true,
            audioId: true,
            sharedMaterialId: true,
            setPosition: true,
            sharedMaterial: {
              select: { id: true, content: true, audioId: true },
            },
          },
        },
      },
    });
    return this.withQuizAudio(rows);
  }

  async getQuizAnswers(lessonId: string, studentId: string) {
    const rows = await this.prisma.lessonQuizAnswer.findMany({
      where: { lessonId, studentId },
      include: {
        question: {
          select: {
            id: true,
            type: true,
            content: true,
            options: true,
            correctIndex: true,
            tfAnswerKey: true,
            explanation: true,
            answerGuide: true,
            essayInputSize: true,
            tfLabelStyle: true,
            blankAnswerKey: true,
            audioId: true,
            sharedMaterialId: true,
            setPosition: true,
            sharedMaterial: {
              select: { id: true, content: true, audioId: true },
            },
          },
        },
      },
    });
    const quizzes = await this.prisma.lessonQuiz.findMany({
      where: { lessonId },
      select: { questionId: true, order: true },
    });
    return this.withQuizAudio(
      orderQuizAnswers(
        rows,
        new Map(quizzes.map((q) => [q.questionId, q.order])),
        (a) => setSlotOf(a.question),
      ),
    );
  }
}

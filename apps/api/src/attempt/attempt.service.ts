import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/client';
import {
  AttemptStatus,
  QuestionType,
  StudentClassStatus,
} from 'generated/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import { CourseContentService } from 'src/course-content/course-content.service';
import type {
  AssignmentLobbyDto,
  AttemptDetailDto,
  AttemptQuestionDto,
  EssayGradingQueueDto,
  EssayGradingQueueItemDto,
  GradeEssayAnswerDto,
  PracticeStatsDto,
  PracticeStatsQuestionRateDto,
  PracticeStatsStudentRowDto,
  SaveAttemptAnswerItemDto,
} from 'src/dtos/attempt.dto';
import {
  ATTEMPT_TOTAL_POINTS,
  splitTotalPoints,
} from './split-total-points';

/** Include chấm/đọc bài: chỉ snapshot trên AttemptAnswer, không join Question live. */
type AttemptWithAnswers = Prisma.AttemptGetPayload<{
  include: {
    assignment: { include: { lesson: true } };
    answers: { orderBy: { order: 'asc' } };
  };
}>;

@Injectable()
export class AttemptService {
  private readonly logger = new Logger(AttemptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly topicService: CourseContentService,
  ) {}

  async getLobby(
    classId: string,
    assignmentId: string,
    studentId: string,
  ): Promise<AssignmentLobbyDto> {
    const item = await this.topicService.getPracticeAssignmentForStudent(
      classId,
      assignmentId,
      studentId,
    );
    const attempts = await this.prisma.attempt.findMany({
      where: { assignmentId, studentId },
      orderBy: { startedAt: 'desc' },
    });
    return {
      assignmentId: item.id,
      classId,
      lessonId: item.lessonId ?? '',
      title: item.lesson!.title,
      durationMinutes: item.durationMinutes as number,
      openAt: item.openAt,
      attempts: attempts.map((a) => ({
        id: a.id,
        status: a.status,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        autoGradedScore: a.autoGradedScore,
        autoGradedMax: a.autoGradedMax,
        hasUngradedEssay: a.hasUngradedEssay,
      })),
    };
  }

  async start(
    classId: string,
    assignmentId: string,
    studentId: string,
  ): Promise<AttemptDetailDto> {
    const item = await this.topicService.getPracticeAssignmentForStudent(
      classId,
      assignmentId,
      studentId,
    );

    const existing = await this.prisma.attempt.findFirst({
      where: { assignmentId, studentId, status: AttemptStatus.in_progress },
      include: this.attemptInclude(),
    });
    if (existing) {
      return this.finalizeIfExpired(existing);
    }

    const lessonId = item.lessonId;
    if (!lessonId) {
      throw new BadRequestException('Assignment has no lesson');
    }
    const links = await this.prisma.questionLink.findMany({
      where: { lessonId, question: { deletedAt: null } },
      include: { question: { include: { difficultyLevel: true } } },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
    if (links.length === 0) {
      throw new BadRequestException(
        'Đề chưa có câu hỏi, không thể bắt đầu làm bài.',
      );
    }
    const pointsByIndex = splitTotalPoints(ATTEMPT_TOTAL_POINTS, links.length);

    const startedAt = new Date();
    try {
      const created = await this.prisma.attempt.create({
        data: {
          assignmentId: item.id,
          studentId,
          startedAt,
          durationMinutes: item.durationMinutes as number,
          status: AttemptStatus.in_progress,
          answers: {
            create: links.map((link, index) => ({
              questionId: link.questionId,
              order: link.order ?? index,
              pointsPossible: pointsByIndex[index],
              type: link.question.type,
              content: link.question.content,
              options:
                link.question.options === null
                  ? Prisma.JsonNull
                  : (link.question.options as Prisma.InputJsonValue),
              correctIndex: link.question.correctIndex,
              explanation: link.question.explanation,
              answerGuide: link.question.answerGuide,
              difficultyLabel: link.question.difficultyLevel.name,
            })),
          },
        },
        include: this.attemptInclude(),
      });
      return this.toDetail(created, false);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await this.prisma.attempt.findFirst({
          where: {
            assignmentId,
            studentId,
            status: AttemptStatus.in_progress,
          },
          include: this.attemptInclude(),
        });
        if (raced) return this.finalizeIfExpired(raced);
      }
      throw err;
    }
  }

  async get(
    classId: string,
    attemptId: string,
    studentId: string,
  ): Promise<AttemptDetailDto> {
    const attempt = await this.loadOwned(classId, attemptId, studentId);
    return this.finalizeIfExpired(attempt);
  }

  async saveAnswers(
    classId: string,
    attemptId: string,
    studentId: string,
    answers: SaveAttemptAnswerItemDto[],
  ): Promise<AttemptDetailDto> {
    const row = await this.loadOwned(classId, attemptId, studentId);
    if (row.status === AttemptStatus.in_progress) {
      const allowed = new Set(row.answers.map((a) => a.questionId));
      const ops = answers
        .filter((item) => allowed.has(item.questionId))
        .map((item) =>
          this.prisma.attemptAnswer.update({
            where: {
              attemptId_questionId: {
                attemptId,
                questionId: item.questionId,
              },
            },
            data: {
              ...(item.choiceIndex !== undefined
                ? { choiceIndex: item.choiceIndex }
                : {}),
              ...(item.essayAnswer !== undefined
                ? { essayAnswer: item.essayAnswer }
                : {}),
              ...(item.markedForReview !== undefined
                ? { markedForReview: item.markedForReview }
                : {}),
            },
          }),
        );
      if (ops.length > 0) {
        await this.prisma.$transaction(ops);
      }
    }

    return this.get(classId, attemptId, studentId);
  }

  async submit(
    classId: string,
    attemptId: string,
    studentId: string,
  ): Promise<AttemptDetailDto> {
    const attempt = await this.loadOwned(classId, attemptId, studentId);
    if (attempt.status !== AttemptStatus.in_progress) {
      return this.toDetail(attempt, true);
    }
    const expired = this.isExpired(attempt);
    return this.gradeAndClose(
      attempt,
      expired ? AttemptStatus.timed_out : AttemptStatus.submitted,
    );
  }

  private async finalizeIfExpired(
    attempt: AttemptWithAnswers,
  ): Promise<AttemptDetailDto> {
    if (attempt.status !== AttemptStatus.in_progress) {
      return this.toDetail(attempt, true);
    }
    if (!this.isExpired(attempt)) {
      return this.toDetail(attempt, false);
    }
    return this.gradeAndClose(attempt, AttemptStatus.timed_out);
  }

  /**
   * Cron / ops: chốt mọi Attempt `in_progress` đã quá `startedAt + durationMinutes`.
   * Đi cùng `gradeAndClose` với GET/nộp; idempotent nhờ claim `status = in_progress`.
   */
  async finalizeExpiredInProgress(): Promise<number> {
    const inProgress = await this.prisma.attempt.findMany({
      where: { status: AttemptStatus.in_progress },
      include: this.attemptInclude(),
    });

    let finalized = 0;
    for (const attempt of inProgress) {
      if (!this.isExpired(attempt)) continue;
      try {
        const claimed = await this.claimAndGrade(
          attempt,
          AttemptStatus.timed_out,
        );
        if (claimed) finalized += 1;
      } catch (err) {
        this.logger.error(
          `Failed to finalize expired attempt ${attempt.id}`,
          err instanceof Error ? err.stack : err,
        );
      }
    }
    return finalized;
  }

  private isExpired(attempt: {
    startedAt: Date;
    durationMinutes: number;
  }): boolean {
    return Date.now() >= this.endsAt(attempt).getTime();
  }

  private endsAt(attempt: { startedAt: Date; durationMinutes: number }): Date {
    return new Date(
      attempt.startedAt.getTime() + attempt.durationMinutes * 60_000,
    );
  }

  private async gradeAndClose(
    attempt: AttemptWithAnswers,
    status: AttemptStatus,
  ): Promise<AttemptDetailDto> {
    await this.claimAndGrade(attempt, status);
    const fresh = await this.prisma.attempt.findUniqueOrThrow({
      where: { id: attempt.id },
      include: this.attemptInclude(),
    });
    return this.toDetail(fresh, true);
  }

  /**
   * Một lần chấm + đóng. Claim bằng `updateMany` `status = in_progress` trước
   * khi ghi điểm — job và nút Nộp không double-grade.
   * @returns true nếu process này chốt được lượt.
   */
  private async claimAndGrade(
    attempt: AttemptWithAnswers,
    status: AttemptStatus,
  ): Promise<boolean> {
    let autoGradedScore = 0;
    let autoGradedMax = 0;
    let hasUngradedEssay = false;

    const answerPatches = attempt.answers.map((ans) => {
      if (ans.type === QuestionType.essay) {
        hasUngradedEssay = true;
        return {
          id: ans.id,
          data: {
            isCorrect: null as boolean | null,
            pointsAwarded: null as number | null,
          },
        };
      }
      const max = ans.pointsPossible;
      autoGradedMax += max;
      const isCorrect =
        ans.choiceIndex != null && ans.choiceIndex === ans.correctIndex;
      const pointsAwarded = isCorrect ? max : 0;
      autoGradedScore += pointsAwarded;
      return { id: ans.id, data: { isCorrect, pointsAwarded } };
    });

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.attempt.updateMany({
        where: { id: attempt.id, status: AttemptStatus.in_progress },
        data: {
          status,
          submittedAt: new Date(),
          autoGradedScore,
          autoGradedMax,
          hasUngradedEssay,
        },
      });
      if (claimed.count === 0) return false;
      for (const patch of answerPatches) {
        await tx.attemptAnswer.update({
          where: { id: patch.id },
          data: patch.data,
        });
      }
      return true;
    });
  }

  /**
   * Hàng đợi chấm tự luận của một lần giao: chỉ câu tự luận chưa chấm của
   * lượt làm MỚI NHẤT mỗi học sinh. Lượt cũ không vào hàng đợi (acceptance #1/#2/#6).
   * Bài tập ôn nhẹ không tạo Attempt nên tự động không xuất hiện (#3).
   */
  async getGradingQueue(
    classId: string,
    assignmentId: string,
  ): Promise<EssayGradingQueueDto> {
    const item = await this.prisma.classContentItem.findFirst({
      where: { id: assignmentId, classId },
      include: { lesson: true },
    });
    if (!item) {
      throw new NotFoundException('Assignment not found');
    }

    const latestAttempts = await this.prisma.attempt.findMany({
      where: { assignmentId, assignment: { classId } },
      orderBy: [{ studentId: 'asc' }, { startedAt: 'desc' }],
      distinct: ['studentId'],
      include: {
        student: { select: { fullName: true } },
        answers: { orderBy: { order: 'asc' } },
      },
    });

    const attemptCounts = await this.prisma.attempt.groupBy({
      by: ['studentId'],
      where: { assignmentId, assignment: { classId } },
      _count: { _all: true },
    });
    const countByStudent = new Map(
      attemptCounts.map((row) => [row.studentId, row._count._all]),
    );

    const items: EssayGradingQueueItemDto[] = [];
    for (const attempt of latestAttempts) {
      if (!attempt.hasUngradedEssay) continue;
      attempt.answers.forEach((ans, index) => {
        if (ans.type !== QuestionType.essay) return;
        if (ans.pointsAwarded !== null) return;
        items.push({
          attemptAnswerId: ans.id,
          attemptId: attempt.id,
          studentId: attempt.studentId,
          studentName: attempt.student.fullName,
          studentAttemptCount: countByStudent.get(attempt.studentId) ?? 1,
          attemptSubmittedAt: attempt.submittedAt ?? attempt.startedAt,
          questionOrder: index + 1,
          totalQuestions: attempt.answers.length,
          questionContent: ans.content,
          difficultyLabel: ans.difficultyLabel,
          pointsPossible: ans.pointsPossible,
          answerGuide: ans.answerGuide,
          essayAnswer: ans.essayAnswer,
        });
      });
    }

    items.sort(
      (a, b) =>
        a.attemptSubmittedAt.getTime() - b.attemptSubmittedAt.getTime() ||
        a.studentName.localeCompare(b.studentName, 'vi') ||
        a.questionOrder - b.questionOrder,
    );

    return {
      classId,
      assignmentId,
      title: item.lesson?.title ?? '',
      totalPending: items.length,
      items,
    };
  }

  /**
   * Thống kê một lần giao: điểm lượt cao nhất đã chấm xong mỗi HS,
   * không gộp lớp khác dù cùng đề. Lượt hasUngradedEssay không vào tổng hợp.
   */
  async getPracticeStats(
    classId: string,
    assignmentId: string,
  ): Promise<PracticeStatsDto> {
    const item = await this.prisma.classContentItem.findFirst({
      where: { id: assignmentId, classId },
      include: { lesson: true, class: { select: { name: true } } },
    });
    if (!item) {
      throw new NotFoundException('Assignment not found');
    }

    const roster = await this.prisma.studentClass.findMany({
      where: { classId, status: StudentClassStatus.active },
      include: { student: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const closedStatuses: AttemptStatus[] = [
      AttemptStatus.submitted,
      AttemptStatus.timed_out,
    ];
    const attempts = await this.prisma.attempt.findMany({
      where: {
        assignmentId,
        assignment: { classId },
        status: { in: closedStatuses },
      },
      include: {
        answers: { orderBy: { order: 'asc' } },
      },
      orderBy: { startedAt: 'asc' },
    });

    const attemptsByStudent = new Map<string, typeof attempts>();
    for (const attempt of attempts) {
      const list = attemptsByStudent.get(attempt.studentId) ?? [];
      list.push(attempt);
      attemptsByStudent.set(attempt.studentId, list);
    }

    const students: PracticeStatsStudentRowDto[] = roster.map((row) => {
      const studentAttempts = attemptsByStudent.get(row.studentId) ?? [];
      const graded = studentAttempts.filter((a) => !a.hasUngradedEssay);
      const best = this.pickBestGradedAttempt(graded);

      if (best) {
        const totals = this.attemptTotals(best);
        return {
          studentId: row.studentId,
          studentName: row.student.fullName,
          score: totals.score,
          scoreMax: totals.scoreMax,
          attemptCount: studentAttempts.length,
          durationMs: this.attemptDurationMs(best),
          status: 'graded',
        };
      }

      if (studentAttempts.length > 0) {
        const latest = studentAttempts[studentAttempts.length - 1];
        return {
          studentId: row.studentId,
          studentName: row.student.fullName,
          score: null,
          scoreMax: null,
          attemptCount: studentAttempts.length,
          durationMs: this.attemptDurationMs(latest),
          status: 'pending_essay',
        };
      }

      return {
        studentId: row.studentId,
        studentName: row.student.fullName,
        score: null,
        scoreMax: null,
        attemptCount: 0,
        durationMs: null,
        status: 'not_started',
      };
    });

    students.sort((a, b) => {
      const scoreA = a.score ?? -1;
      const scoreB = b.score ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.studentName.localeCompare(b.studentName, 'vi');
    });

    const gradedRows = students.filter((s) => s.status === 'graded');
    const averageScore =
      gradedRows.length === 0
        ? null
        : Math.round(
            (gradedRows.reduce((sum, s) => sum + (s.score ?? 0), 0) /
              gradedRows.length) *
              10,
          ) / 10;

    const questions = this.buildQuestionRates(
      item.lessonId,
      roster.map((r) => r.studentId),
      attemptsByStudent,
    );

    return {
      classId,
      assignmentId,
      title: item.lesson?.title ?? '',
      className: item.class.name,
      openAt: item.openAt,
      durationMinutes: item.durationMinutes,
      submittedCount: students.filter((s) => s.attemptCount > 0).length,
      rosterCount: roster.length,
      averageScore,
      pendingEssayCount: students.filter((s) => s.status === 'pending_essay')
        .length,
      questions: await questions,
      students,
    };
  }

  /**
   * Chấm 1 câu tự luận. Chỉ chấp nhận câu thuộc lượt làm mới nhất của học sinh
   * (lượt cũ trả 404 — acceptance #2/#6). Điểm theo thang điểm snapshot của câu.
   */
  async gradeEssayAnswer(
    classId: string,
    assignmentId: string,
    attemptAnswerId: string,
    dto: GradeEssayAnswerDto,
  ): Promise<void> {
    const answer = await this.prisma.attemptAnswer.findUnique({
      where: { id: attemptAnswerId },
      include: {
        attempt: { include: { assignment: true } },
      },
    });
    if (
      !answer ||
      answer.attempt.assignmentId !== assignmentId ||
      answer.attempt.assignment.classId !== classId ||
      answer.type !== QuestionType.essay
    ) {
      throw new NotFoundException('Essay answer not found');
    }

    const latest = await this.prisma.attempt.findFirst({
      where: {
        assignmentId,
        studentId: answer.attempt.studentId,
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    if (!latest || latest.id !== answer.attemptId) {
      // Lượt cũ: tra cứu được nhưng không chấm trong hàng đợi.
      throw new NotFoundException('Essay answer not found');
    }

    if (dto.pointsAwarded > answer.pointsPossible) {
      throw new BadRequestException(
        `Điểm chấm không được vượt quá ${answer.pointsPossible}`,
      );
    }

    await this.prisma.attemptAnswer.update({
      where: { id: attemptAnswerId },
      data: {
        pointsAwarded: dto.pointsAwarded,
        // Tự luận chấm theo thang điểm, không phải đúng/sai — giữ isCorrect null.
        isCorrect: null,
        feedback: dto.feedback?.trim() ? dto.feedback : null,
      },
    });

    const remaining = await this.prisma.attemptAnswer.count({
      where: {
        attemptId: answer.attemptId,
        type: QuestionType.essay,
        pointsAwarded: null,
      },
    });
    if (remaining === 0) {
      await this.prisma.attempt.update({
        where: { id: answer.attemptId },
        data: { hasUngradedEssay: false },
      });
    }
  }

  /** Tổng điểm attempt = MCQ autoGradedScore + tổng pointsAwarded essay. */
  private attemptTotals(attempt: {
    autoGradedScore: number | null;
    autoGradedMax: number | null;
    answers: Array<{
      pointsAwarded: number | null;
      pointsPossible: number;
      type: QuestionType;
    }>;
  }): { score: number; scoreMax: number } {
    const essayAwarded = attempt.answers
      .filter((a) => a.type === QuestionType.essay)
      .reduce((sum, a) => sum + (a.pointsAwarded ?? 0), 0);
    const essayMax = attempt.answers
      .filter((a) => a.type === QuestionType.essay)
      .reduce((sum, a) => sum + a.pointsPossible, 0);
    return {
      score: (attempt.autoGradedScore ?? 0) + essayAwarded,
      scoreMax: (attempt.autoGradedMax ?? 0) + essayMax,
    };
  }

  private pickBestGradedAttempt<
    T extends {
      submittedAt: Date | null;
      startedAt: Date;
      autoGradedScore: number | null;
      autoGradedMax: number | null;
      answers: Array<{
        pointsAwarded: number | null;
        pointsPossible: number;
        type: QuestionType;
      }>;
    },
  >(graded: T[]): T | null {
    if (graded.length === 0) return null;
    return graded.toSorted((a, b) => {
      const scoreDiff =
        this.attemptTotals(b).score - this.attemptTotals(a).score;
      if (scoreDiff !== 0) return scoreDiff;
      const timeA = (a.submittedAt ?? a.startedAt).getTime();
      const timeB = (b.submittedAt ?? b.startedAt).getTime();
      return timeB - timeA;
    })[0];
  }

  private attemptDurationMs(attempt: {
    startedAt: Date;
    submittedAt: Date | null;
  }): number | null {
    if (!attempt.submittedAt) return null;
    return Math.max(
      0,
      attempt.submittedAt.getTime() - attempt.startedAt.getTime(),
    );
  }

  /** Essay đúng khi đạt đủ điểm câu — isCorrect luôn null với tự luận. */
  private isAnswerCorrect(ans: {
    isCorrect: boolean | null;
    pointsAwarded: number | null;
    pointsPossible: number;
    type: QuestionType;
  }): boolean {
    if (ans.type === QuestionType.essay) {
      return (
        ans.pointsAwarded != null && ans.pointsAwarded === ans.pointsPossible
      );
    }
    return ans.isCorrect === true;
  }

  private async buildQuestionRates(
    lessonId: string | null,
    rosterStudentIds: string[],
    attemptsByStudent: Map<
      string,
      Array<{
        hasUngradedEssay: boolean;
        submittedAt: Date | null;
        startedAt: Date;
        autoGradedScore: number | null;
        autoGradedMax: number | null;
        answers: Array<{
          questionId: string;
          order: number;
          isCorrect: boolean | null;
          pointsAwarded: number | null;
          pointsPossible: number;
          type: QuestionType;
        }>;
      }>
    >,
  ): Promise<PracticeStatsQuestionRateDto[]> {
    const blueprint = new Map<string, { order: number; type: QuestionType }>();

    if (lessonId) {
      const links = await this.prisma.questionLink.findMany({
        where: { lessonId, question: { deletedAt: null } },
        include: { question: { select: { id: true, type: true } } },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      });
      links.forEach((link, index) => {
        blueprint.set(link.questionId, {
          order: index + 1,
          type: link.question.type,
        });
      });
    }

    const tallies = new Map<
      string,
      { correctCount: number; sampleCount: number }
    >();

    for (const studentId of rosterStudentIds) {
      const graded = (attemptsByStudent.get(studentId) ?? []).filter(
        (a) => !a.hasUngradedEssay,
      );
      const best = this.pickBestGradedAttempt(graded);
      if (!best) continue;
      for (const ans of best.answers) {
        if (!blueprint.has(ans.questionId)) {
          blueprint.set(ans.questionId, {
            order: ans.order + 1,
            type: ans.type,
          });
        }
        const row = tallies.get(ans.questionId) ?? {
          correctCount: 0,
          sampleCount: 0,
        };
        row.sampleCount += 1;
        if (this.isAnswerCorrect(ans)) row.correctCount += 1;
        tallies.set(ans.questionId, row);
      }
    }

    return [...blueprint.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([questionId, meta]) => {
        const tally = tallies.get(questionId) ?? {
          correctCount: 0,
          sampleCount: 0,
        };
        return {
          questionId,
          order: meta.order,
          type: meta.type,
          correctCount: tally.correctCount,
          sampleCount: tally.sampleCount,
          correctRate:
            tally.sampleCount === 0
              ? 0
              : Math.round((tally.correctCount / tally.sampleCount) * 1000) /
                1000,
        };
      });
  }

  private async loadOwned(
    classId: string,
    attemptId: string,
    studentId: string,
  ): Promise<AttemptWithAnswers> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: this.attemptInclude(),
    });
    if (!attempt || attempt.studentId !== studentId) {
      throw new NotFoundException('Attempt not found');
    }
    if (attempt.assignment.classId !== classId) {
      throw new NotFoundException('Attempt not found');
    }
    await this.topicService.getPracticeAssignmentForStudent(
      classId,
      attempt.assignmentId,
      studentId,
    );
    return attempt;
  }

  private attemptInclude() {
    return {
      assignment: { include: { lesson: true } },
      answers: {
        orderBy: { order: 'asc' as const },
      },
    };
  }

  private toDetail(
    attempt: AttemptWithAnswers,
    reveal: boolean,
  ): AttemptDetailDto {
    const endsAt = this.endsAt(attempt);
    const remainingMs = Math.max(0, endsAt.getTime() - Date.now());
    const questions: AttemptQuestionDto[] = attempt.answers.map((ans) => {
      const base: AttemptQuestionDto = {
        questionId: ans.questionId,
        order: ans.order,
        pointsPossible: ans.pointsPossible,
        type: ans.type,
        content: ans.content,
        options: Array.isArray(ans.options) ? (ans.options as string[]) : null,
        choiceIndex: ans.choiceIndex,
        essayAnswer: ans.essayAnswer,
        markedForReview: ans.markedForReview,
      };
      if (reveal) {
        base.correctIndex = ans.correctIndex;
        base.isCorrect = ans.isCorrect;
        base.pointsAwarded = ans.pointsAwarded;
        base.explanation = ans.explanation;
        base.answerGuide = ans.answerGuide;
      }
      return base;
    });

    const scoreMax = attempt.answers.reduce(
      (sum, ans) => sum + ans.pointsPossible,
      0,
    );

    return {
      id: attempt.id,
      assignmentId: attempt.assignmentId,
      classId: attempt.assignment.classId,
      title: attempt.assignment.lesson?.title ?? '',
      status: attempt.status,
      startedAt: attempt.startedAt,
      durationMinutes: attempt.durationMinutes,
      endsAt,
      remainingMs,
      submittedAt: attempt.submittedAt,
      autoGradedScore: attempt.autoGradedScore,
      autoGradedMax: attempt.autoGradedMax,
      scoreMax,
      hasUngradedEssay: attempt.hasUngradedEssay,
      questions,
    };
  }
}

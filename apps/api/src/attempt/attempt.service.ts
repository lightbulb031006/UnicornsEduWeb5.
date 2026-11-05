import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/client';
import {
  AttemptScoring,
  AttemptStatus,
  QuestionSlot,
  QuestionType,
  StudentClassStatus,
} from 'generated/enums';
import { LmsProfileService } from 'src/lms-profile/lms-profile.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CourseContentService } from 'src/course-content/course-content.service';
import type {
  AssignmentLobbyDto,
  AttemptAudioPlayDto,
  AttemptDetailDto,
  AttemptQuestionDto,
  GradeEssayAnswerDto,
  PracticeStatsDto,
  PracticeStatsQuestionRateDto,
  PracticeStatsStudentRowDto,
  SaveAttemptAnswerItemDto,
  StaffAttemptDetailDto,
  StaffStudentAttemptsDto,
} from 'src/dtos/attempt.dto';
import {
  ATTEMPT_TOTAL_POINTS,
  questionWeight,
  splitTotalPoints,
  splitTotalPointsByWeight,
} from './split-total-points';
import {
  autoGradedMaxOf,
  gradeAnswers,
  itQuestionPoints,
  normalizeTrueFalseChoices,
  tfChoicesOf,
} from './grading';
import { blankFieldsOf, parseBlankAnswerKey } from './fill-blank';
import { assertExamForm, examGroupRank, orderExamLinks } from './exam-form';
import {
  orderingKeyOf,
  groupByMaterial,
  setSlotOf,
  shuffleMaterialBlocks,
  shuffleOrderingCards,
  shuffleQuestionOptions,
  shuffleWithinGroups,
} from './shuffle';
import {
  assignmentDurationMinutes,
  isAssignmentClosed,
} from './assignment-window';
import { resolveAudioRefs } from 'src/question/audio-asset.service';
import { attemptAudioView } from './audio-play';

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
    private readonly lmsProfile: LmsProfileService = new LmsProfileService(),
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
      include: {
        answers: {
          select: {
            type: true,
            slot: true,
            pointsPossible: true,
            pointsAwarded: true,
          },
        },
      },
    });
    const closeAt = item.closeAt;
    const closed = isAssignmentClosed(closeAt);
    return {
      assignmentId: item.id,
      classId,
      lessonId: item.lessonId ?? '',
      title: item.lesson!.title,
      durationMinutes: assignmentDurationMinutes(item) as number,
      openAt: item.openAt,
      closeAt,
      closed,
      attempts: attempts.map((a) => ({
        id: a.id,
        status: a.status,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        autoGradedScore: a.autoGradedScore,
        autoGradedMax: a.autoGradedMax,
        scoreMax: this.scoreMaxOf(a),
        // Điểm hiện ngay sau khi nộp / hết giờ, không chờ hạn lần giao.
        ...this.releasedScores(a, true),
        hasUngradedEssay: a.hasUngradedEssay,
        scoring: a.scoring,
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
    // Lượt đang làm dở vẫn chạy hết giờ riêng; chỉ chặn lượt mới sau hạn.
    if (isAssignmentClosed(item.closeAt)) {
      throw new ForbiddenException('Đã hết hạn làm bài.');
    }

    const lessonId = item.lessonId;
    if (!lessonId) {
      throw new BadRequestException('Assignment has no lesson');
    }
    const rawLinks = await this.prisma.questionLink.findMany({
      where: { lessonId, question: { deletedAt: null } },
      include: {
        question: { include: { difficultyLevel: true, sharedMaterial: true } },
      },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
    if (rawLinks.length === 0) {
      throw new BadRequestException(
        'Đề chưa có câu hỏi, không thể bắt đầu làm bài.',
      );
    }
    const scoring = this.currentScoring();
    const isIt = scoring === AttemptScoring.absolute_it;
    const examLinks = isIt ? orderExamLinks(rawLinks) : rawLinks;
    if (isIt) {
      assertExamForm(examLinks);
    }
    // Đảo câu: đề IT giữ khung Phần I → bắt buộc → TC1 → TC2, xáo trong nhóm.
    // Hồ sơ khác: Bộ câu hỏi là một khối liền nhau theo thứ tự bộ, xáo cả khối.
    const shuffle = item.shuffleQuestions;
    const materialOf = (link: (typeof examLinks)[number]) =>
      setSlotOf(link.question);
    const links = isIt
      ? shuffle
        ? shuffleWithinGroups(examLinks, (link) => examGroupRank(link))
        : examLinks
      : shuffle
        ? shuffleMaterialBlocks(examLinks, materialOf)
        : groupByMaterial(examLinks, materialOf);
    const pointsByIndex =
      scoring === AttemptScoring.absolute_it
        ? links.map((link) => itQuestionPoints(link.question.type))
        : this.lmsProfile.config.questionWeights
          ? // JP: chia 100 theo trọng số câu-trong-tiết, chốt vào snapshot.
            splitTotalPointsByWeight(
              ATTEMPT_TOTAL_POINTS,
              links.map((link) => questionWeight(link.points)),
            )
          : splitTotalPoints(ATTEMPT_TOTAL_POINTS, links.length);

    const startedAt = new Date();
    try {
      const created = await this.prisma.attempt.create({
        data: {
          assignmentId: item.id,
          studentId,
          startedAt,
          durationMinutes: assignmentDurationMinutes(item) as number,
          status: AttemptStatus.in_progress,
          scoring,
          answers: {
            create: links.map((link, index) => {
              // Câu sắp xếp luôn xáo thẻ (kể cả khi tắt Đảo câu) — không thì lộ đáp án.
              const shuffled =
                link.question.type === QuestionType.ordering
                  ? {
                      ...shuffleOrderingCards(
                        Array.isArray(link.question.options)
                          ? (link.question.options as string[])
                          : [],
                      ),
                      correctIndex: null,
                      tfAnswerKey: [],
                    }
                  : shuffle
                    ? shuffleQuestionOptions(link.question)
                    : null;
              return {
                questionId: link.questionId,
                order: index,
                pointsPossible: pointsByIndex[index],
                slot: link.slot,
                tfAnswerKey: shuffled?.tfAnswerKey ?? link.question.tfAnswerKey,
                type: link.question.type,
                content: link.question.content,
                options: shuffled
                  ? shuffled.options
                  : link.question.options === null
                    ? Prisma.JsonNull
                    : (link.question.options as Prisma.InputJsonValue),
                correctIndex: shuffled
                  ? shuffled.correctIndex
                  : link.question.correctIndex,
                optionOrder: shuffled?.optionOrder ?? [],
                explanation: link.question.explanation,
                answerGuide: link.question.answerGuide,
                essayInputSize: link.question.essayInputSize,
                tfLabelStyle: link.question.tfLabelStyle,
                blankAnswerKey:
                  link.question.blankAnswerKey === null
                    ? Prisma.JsonNull
                    : (link.question.blankAnswerKey as Prisma.InputJsonValue),
                difficultyLabel: link.question.difficultyLevel.name,
                sharedMaterialId: link.question.sharedMaterialId,
                sharedMaterialContent:
                  link.question.sharedMaterial?.content ?? null,
                audioId: link.question.audioId,
                sharedMaterialAudioId:
                  link.question.sharedMaterial?.audioId ?? null,
              };
            }),
          },
        },
        include: this.attemptInclude(),
      });
      return await this.toDetail(created, false);
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

  /**
   * Học sinh bấm phát audio trong lượt đang làm. Audio có giới hạn: trừ một lượt
   * nguyên tử ở DB (tải lại trang không hồi lượt), hết lượt → 409.
   */
  async playAudio(
    classId: string,
    attemptId: string,
    studentId: string,
    audioId: string,
  ): Promise<AttemptAudioPlayDto> {
    const attempt = await this.loadOwned(classId, attemptId, studentId);
    if (
      attempt.status !== AttemptStatus.in_progress ||
      this.isExpired(attempt)
    ) {
      throw new ConflictException('Lượt làm đã kết thúc.');
    }
    const inSnapshot = attempt.answers.some(
      (a) => a.audioId === audioId || a.sharedMaterialAudioId === audioId,
    );
    const ref = inSnapshot
      ? (await resolveAudioRefs(this.prisma, [audioId])).get(audioId)
      : undefined;
    if (!ref) throw new NotFoundException('Audio không thuộc lượt làm này.');
    if (ref.maxPlays === null) {
      return { url: ref.url, maxPlays: null, playsUsed: 0 };
    }
    await this.prisma.attemptAudioPlay.createMany({
      data: [{ attemptId, audioId }],
      skipDuplicates: true,
    });
    const { count } = await this.prisma.attemptAudioPlay.updateMany({
      where: { attemptId, audioId, playCount: { lt: ref.maxPlays } },
      data: { playCount: { increment: 1 } },
    });
    if (count === 0) {
      throw new ConflictException('Đã hết lượt nghe audio này.');
    }
    const { playCount } = await this.prisma.attemptAudioPlay.findUniqueOrThrow({
      where: { attemptId_audioId: { attemptId, audioId } },
      select: { playCount: true },
    });
    return { url: ref.url, maxPlays: ref.maxPlays, playsUsed: playCount };
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
              ...(item.tfChoices !== undefined
                ? { tfChoices: normalizeTrueFalseChoices(item.tfChoices) }
                : {}),
              ...(item.blankAnswers !== undefined
                ? {
                    blankAnswers:
                      item.blankAnswers === null
                        ? Prisma.JsonNull
                        : item.blankAnswers.map((a) =>
                            typeof a === 'string' ? a : null,
                          ),
                  }
                : {}),
              ...(item.orderAnswer !== undefined
                ? { orderAnswer: item.orderAnswer ?? [] }
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
    const graded = gradeAnswers(attempt.answers, attempt.scoring);
    const answerPatches = graded.patches.map(({ id, ...data }) => ({
      id,
      data,
    }));
    const { autoGradedScore, autoGradedMax, hasUngradedEssay, electiveVoided } =
      graded;

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.attempt.updateMany({
        where: { id: attempt.id, status: AttemptStatus.in_progress },
        data: {
          status,
          submittedAt: new Date(),
          autoGradedScore,
          autoGradedMax,
          hasUngradedEssay,
          electiveVoided,
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
   * Kết quả một lần giao: điểm mỗi học sinh = lượt đã chấm xong gần nhất (theo
   * giờ nộp), không gộp lớp khác dù cùng đề. Lượt còn tự luận chưa chấm bị bỏ
   * qua — dùng lượt đã chấm trước đó.
   */
  async getPracticeStats(
    classId: string,
    assignmentId: string,
  ): Promise<PracticeStatsDto> {
    const item = await this.findAssignmentOrThrow(classId, assignmentId);

    const roster = await this.prisma.studentClass.findMany({
      where: { classId, status: StudentClassStatus.active },
      include: { student: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Cả lượt đang làm: để đánh số lượt và biết học sinh đang làm lại.
    const attempts = await this.prisma.attempt.findMany({
      where: { assignmentId, assignment: { classId } },
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
      const all = attemptsByStudent.get(row.studentId) ?? [];
      const closed = all.filter((a) => a.status !== AttemptStatus.in_progress);
      const latestClosed = closed.at(-1) ?? null;
      const scored = this.latestScoredAttempt(closed);
      const totals = scored ? this.attemptTotals(scored) : null;
      const shown = scored ?? latestClosed;
      return {
        studentId: row.studentId,
        studentName: row.student.fullName,
        score: totals?.score ?? null,
        scoreMax: totals?.scoreMax ?? null,
        scoredAttemptNo: scored ? all.indexOf(scored) + 1 : null,
        latestAttemptNo: latestClosed ? all.indexOf(latestClosed) + 1 : null,
        attemptCount: closed.length,
        durationMs: shown ? this.attemptDurationMs(shown) : null,
        status: this.studentRowStatus(all, latestClosed, scored),
      };
    });

    students.sort((a, b) => {
      const scoreA = a.score ?? -1;
      const scoreB = b.score ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.studentName.localeCompare(b.studentName, 'vi');
    });

    const scoredRows = students.filter((s) => s.score !== null);
    const averageScore =
      scoredRows.length === 0
        ? null
        : Math.round(
            (scoredRows.reduce((sum, s) => sum + (s.score ?? 0), 0) /
              scoredRows.length) *
              10,
          ) / 10;

    const latestAttempt = attempts.at(-1);
    const latestScoring = latestAttempt?.scoring ?? this.currentScoring();
    const latestScoreMax = latestAttempt
      ? this.scoreMaxOf(latestAttempt)
      : null;

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
      durationMinutes: assignmentDurationMinutes(item),
      submittedCount: students.filter((s) => s.attemptCount > 0).length,
      rosterCount: roster.length,
      averageScore,
      scoring: latestScoring,
      scoreMax: latestScoreMax,
      pendingEssayCount: students.filter((s) => s.status === 'pending_essay')
        .length,
      questions: await questions,
      students,
    };
  }

  /**
   * Các lượt đã nộp của một học sinh cho bộ chọn lượt (mới nhất trước).
   * Lượt đang làm không xem được nên không có trong danh sách.
   */
  async listStudentAttemptsForStaff(
    classId: string,
    assignmentId: string,
    studentId: string,
  ): Promise<StaffStudentAttemptsDto> {
    const item = await this.findAssignmentOrThrow(classId, assignmentId);
    const student = await this.prisma.studentInfo.findUnique({
      where: { id: studentId },
      select: { fullName: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const all = await this.prisma.attempt.findMany({
      where: { assignmentId, studentId, assignment: { classId } },
      include: {
        answers: {
          select: {
            type: true,
            slot: true,
            pointsPossible: true,
            pointsAwarded: true,
          },
        },
      },
      orderBy: { startedAt: 'asc' },
    });
    const closed = all.filter((a) => a.status !== AttemptStatus.in_progress);
    const scored = this.latestScoredAttempt(closed);
    const latest = all.at(-1);

    return {
      classId,
      assignmentId,
      title: item.lesson?.title ?? '',
      studentId,
      studentName: student.fullName,
      scoring: latest?.scoring ?? this.currentScoring(),
      inProgress: latest?.status === AttemptStatus.in_progress,
      attempts: closed
        .map((a) => ({
          id: a.id,
          no: all.indexOf(a) + 1,
          status: a.status as 'submitted' | 'timed_out',
          startedAt: a.startedAt,
          submittedAt: a.submittedAt,
          score: this.attemptTotals(a).score,
          scoreMax: this.scoreMaxOf(a),
          hasUngradedEssay: a.hasUngradedEssay,
          isScored: a === scored,
          gradable: this.isGradable(a, latest),
        }))
        .reverse(),
    };
  }

  /** Bài làm một lượt đã nộp cho phía dạy: kèm đáp án, điểm và id câu để chấm. */
  async getAttemptForStaff(
    classId: string,
    assignmentId: string,
    attemptId: string,
  ): Promise<StaffAttemptDetailDto> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        ...this.attemptInclude(),
        student: { select: { fullName: true } },
      },
    });
    if (
      !attempt ||
      attempt.assignmentId !== assignmentId ||
      attempt.assignment.classId !== classId ||
      attempt.assignment.lesson?.archivedAt ||
      // Lượt làm dở không xem được (chưa có bài để đọc / chấm).
      attempt.status === AttemptStatus.in_progress
    ) {
      throw new NotFoundException('Attempt not found');
    }

    const siblings = await this.prisma.attempt.findMany({
      where: { assignmentId, studentId: attempt.studentId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        hasUngradedEssay: true,
      },
      orderBy: { startedAt: 'asc' },
    });
    const closed = siblings.filter(
      (a) => a.status !== AttemptStatus.in_progress,
    );
    const scored = this.latestScoredAttempt(closed);

    const detail = await this.toDetail(attempt, true);
    return {
      ...detail,
      studentId: attempt.studentId,
      studentName: attempt.student.fullName,
      no: siblings.findIndex((a) => a.id === attempt.id) + 1,
      isScored: scored?.id === attempt.id,
      gradable: this.isGradable(attempt, siblings.at(-1)),
      // toDetail giữ nguyên thứ tự `answers` nên ghép id theo vị trí.
      questions: detail.questions.map((q, i) => ({
        ...q,
        attemptAnswerId: attempt.answers[i].id,
      })),
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
      answer.attempt.status === AttemptStatus.in_progress ||
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
      // Lượt cũ (hoặc học sinh đã bắt đầu lượt mới): chỉ xem, không chấm.
      throw new NotFoundException('Essay answer not found');
    }

    if (dto.pointsAwarded > answer.pointsPossible) {
      throw new BadRequestException(
        `Điểm chấm không được vượt quá ${answer.pointsPossible}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Khoá dòng attempt: hai gia sư chấm hai câu cuối song song sẽ chạy nối
      // tiếp, lần sau đếm thấy câu của lần trước — không kẹt hasUngradedEssay.
      await tx.$queryRaw`SELECT id FROM attempts WHERE id = ${answer.attemptId} FOR UPDATE`;

      await tx.attemptAnswer.update({
        where: { id: attemptAnswerId },
        data: {
          pointsAwarded: dto.pointsAwarded,
          // Tự luận chấm theo thang điểm, không phải đúng/sai — giữ isCorrect null.
          isCorrect: null,
          feedback: dto.feedback?.trim() ? dto.feedback : null,
        },
      });

      const remaining = await tx.attemptAnswer.count({
        where: {
          attemptId: answer.attemptId,
          type: QuestionType.essay,
          pointsAwarded: null,
        },
      });
      if (remaining === 0) {
        await tx.attempt.update({
          where: { id: answer.attemptId },
          data: { hasUngradedEssay: false },
        });
      }
    });
  }

  /** Tổng điểm tối đa: phần tự chấm (một nhóm tự chọn) + tự luận. */
  private scoreMaxOf(attempt: {
    scoring: AttemptScoring;
    answers: Array<{
      pointsPossible: number;
      type: QuestionType;
      slot: QuestionSlot;
    }>;
  }): number {
    const essayMax = attempt.answers
      .filter((a) => a.type === QuestionType.essay)
      .reduce((sum, a) => sum + a.pointsPossible, 0);
    return autoGradedMaxOf(attempt.answers, attempt.scoring) + essayMax;
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

  /**
   * Điểm học sinh được thấy: trắc nghiệm + tự luận đã chấm. Chưa công bố → null.
   * Lượt đang làm chưa có điểm. Tự luận còn câu chưa chấm vẫn cộng phần đã
   * chấm; FE kèm nhãn "chờ chấm" theo `hasUngradedEssay`.
   */
  private releasedScores(
    attempt: {
      status: AttemptStatus;
      autoGradedScore: number | null;
      autoGradedMax: number | null;
      answers: Array<{
        pointsAwarded: number | null;
        pointsPossible: number;
        type: QuestionType;
      }>;
    },
    released: boolean,
  ): { essayScore: number | null; score: number | null } {
    if (!released || attempt.status === AttemptStatus.in_progress) {
      return { essayScore: null, score: null };
    }
    const essays = attempt.answers.filter((a) => a.type === QuestionType.essay);
    return {
      essayScore:
        essays.length > 0
          ? essays.reduce((sum, a) => sum + (a.pointsAwarded ?? 0), 0)
          : null,
      score: this.attemptTotals(attempt).score,
    };
  }

  /**
   * Lượt đang tính điểm: lượt đã chấm xong có giờ nộp muộn nhất. Lượt còn tự
   * luận chưa chấm bị bỏ qua (quay về lượt đã chấm trước đó).
   */
  private latestScoredAttempt<
    T extends {
      status: AttemptStatus;
      hasUngradedEssay: boolean;
      submittedAt: Date | null;
      startedAt: Date;
    },
  >(attempts: T[]): T | null {
    const time = (a: T) => (a.submittedAt ?? a.startedAt).getTime();
    let best: T | null = null;
    for (const a of attempts) {
      if (a.status === AttemptStatus.in_progress || a.hasUngradedEssay)
        continue;
      if (!best || time(a) >= time(best)) best = a;
    }
    return best;
  }

  /** Chỉ chấm được lượt mới nhất (kể cả so với lượt đang làm) có câu tự luận. */
  private isGradable(
    attempt: {
      id: string;
      status: AttemptStatus;
      answers: Array<{ type: QuestionType }>;
    },
    latest: { id: string } | undefined,
  ): boolean {
    return (
      attempt.status !== AttemptStatus.in_progress &&
      latest?.id === attempt.id &&
      attempt.answers.some((a) => a.type === QuestionType.essay)
    );
  }

  private studentRowStatus(
    all: Array<{ status: AttemptStatus }>,
    latestClosed: { hasUngradedEssay: boolean } | null,
    scored: unknown,
  ): PracticeStatsStudentRowDto['status'] {
    if (all.at(-1)?.status === AttemptStatus.in_progress) return 'in_progress';
    if (latestClosed?.hasUngradedEssay) return 'pending_essay';
    if (scored) return 'graded';
    return 'not_started';
  }

  private async findAssignmentOrThrow(classId: string, assignmentId: string) {
    const item = await this.prisma.classContentItem.findFirst({
      where: { id: assignmentId, classId },
      include: { lesson: true, class: { select: { name: true } } },
    });
    if (!item || item.lesson?.archivedAt) {
      throw new NotFoundException('Assignment not found');
    }
    return item;
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
        status: AttemptStatus;
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
      const scored = this.latestScoredAttempt(
        attemptsByStudent.get(studentId) ?? [],
      );
      if (!scored) continue;
      for (const ans of scored.answers) {
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

  private currentScoring(): AttemptScoring {
    return this.lmsProfile.config.scoring === 'absolute_it'
      ? AttemptScoring.absolute_it
      : AttemptScoring.equal_100;
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

  private async toDetail(
    attempt: AttemptWithAnswers,
    reveal: boolean,
  ): Promise<AttemptDetailDto> {
    // Audio theo bản chụp; URL ký mới mỗi lần tải bài (signed URL ngắn hạn).
    const audio = await resolveAudioRefs(
      this.prisma,
      attempt.answers.flatMap((a) => [a.audioId, a.sharedMaterialAudioId]),
    );
    const limited = [...audio.values()].some((a) => a.maxPlays !== null);
    const plays = limited
      ? await this.prisma.attemptAudioPlay.findMany({
          where: { attemptId: attempt.id },
          select: { audioId: true, playCount: true },
        })
      : [];
    const playsOf = new Map(plays.map((p) => [p.audioId, p.playCount]));
    const inProgress = attempt.status === AttemptStatus.in_progress;
    const audioOf = (id: string | null) => {
      const ref = id ? audio.get(id) : undefined;
      return ref
        ? attemptAudioView(
            {
              id: ref.id,
              url: ref.url,
              maxPlays: ref.maxPlays,
              allowSeek: ref.allowSeek,
            },
            playsOf.get(ref.id) ?? 0,
            inProgress,
          )
        : null;
    };
    const endsAt = this.endsAt(attempt);
    // Kết quả công bố ngay khi lượt của chính học sinh đã nộp / hết giờ (#229).
    const closeAt = attempt.assignment.closeAt;
    const resultsReleased = attempt.status !== AttemptStatus.in_progress;
    const remainingMs = Math.max(0, endsAt.getTime() - Date.now());
    const questions: AttemptQuestionDto[] = attempt.answers.map((ans) => {
      const base: AttemptQuestionDto = {
        questionId: ans.questionId,
        order: ans.order,
        pointsPossible: ans.pointsPossible,
        type: ans.type,
        slot: ans.slot,
        content: ans.content,
        options: Array.isArray(ans.options) ? (ans.options as string[]) : null,
        essayInputSize: ans.essayInputSize,
        choiceIndex: ans.choiceIndex,
        tfChoices: tfChoicesOf(ans.type, ans.tfChoices),
        tfLabelStyle: ans.tfLabelStyle,
        ...blankFieldsOf(ans.type, ans.blankAnswerKey, ans.blankAnswers),
        orderAnswer:
          ans.type === QuestionType.ordering ? ans.orderAnswer : null,
        sharedMaterial:
          ans.sharedMaterialId && ans.sharedMaterialContent !== null
            ? {
                id: ans.sharedMaterialId,
                content: ans.sharedMaterialContent,
                audio: audioOf(ans.sharedMaterialAudioId),
              }
            : null,
        audio: audioOf(ans.audioId),
        essayAnswer: ans.essayAnswer,
        markedForReview: ans.markedForReview,
      };
      if (reveal && resultsReleased) {
        base.correctIndex = ans.correctIndex;
        base.tfAnswerKey =
          ans.type === QuestionType.true_false_group ||
          ans.type === QuestionType.true_false
            ? ans.tfAnswerKey
            : null;
        base.blankAnswerKey =
          ans.type === QuestionType.fill_blank
            ? parseBlankAnswerKey(ans.blankAnswerKey)
            : null;
        base.orderingKey =
          ans.type === QuestionType.ordering
            ? orderingKeyOf(base.options ?? [], ans.optionOrder)
            : null;
        base.isCorrect = ans.isCorrect;
        base.pointsAwarded = ans.pointsAwarded;
        base.feedback = ans.type === QuestionType.essay ? ans.feedback : null;
        base.explanation = ans.explanation;
        base.answerGuide = ans.answerGuide;
      }
      return base;
    });

    const scoreMax = this.scoreMaxOf(attempt);

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
      autoGradedScore: resultsReleased ? attempt.autoGradedScore : null,
      autoGradedMax: resultsReleased ? attempt.autoGradedMax : null,
      scoreMax,
      ...this.releasedScores(attempt, resultsReleased),
      hasUngradedEssay: attempt.hasUngradedEssay,
      scoring: attempt.scoring,
      electiveVoided: resultsReleased ? attempt.electiveVoided : false,
      electiveGroupNames: {
        elective_1: attempt.assignment.lesson?.elective1Name ?? null,
        elective_2: attempt.assignment.lesson?.elective2Name ?? null,
      },
      closeAt,
      resultsReleased,
      questions,
    };
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('../../generated/client', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(message: string, { code }: { code: string }) {
        super(message);
        this.code = code;
      }
    },
  },
}));
jest.mock('../course-content/course-content.service', () => ({
  CourseContentService: class CourseContentServiceMock {},
}));

import { AttemptService } from './attempt.service';
import { AttemptStatus, QuestionType } from 'generated/enums';

describe('AttemptService', () => {
  let service: AttemptService;
  let prisma: Record<string, any>;
  let topicService: { getPracticeAssignmentForStudent: jest.Mock };

  const assignment = {
    id: 'cci-1',
    classId: 'cls-1',
    lessonId: 'topic-1',
    durationMinutes: 10,
    openAt: new Date(Date.now() - 1000),
    lesson: { id: 'topic-1', kind: 'practice', title: 'Đề A' },
  };

  function makeAttempt(over: Record<string, unknown> = {}) {
    return {
      id: 'att-1',
      assignmentId: 'cci-1',
      studentId: 'stu-1',
      startedAt: new Date(Date.now() - 1000),
      durationMinutes: 10,
      submittedAt: null,
      status: AttemptStatus.in_progress,
      autoGradedScore: null,
      autoGradedMax: null,
      hasUngradedEssay: false,
      assignment,
      answers: [
        {
          id: 'ans-1',
          attemptId: 'att-1',
          questionId: 'q-mcq',
          order: 0,
          pointsPossible: 50,
          type: QuestionType.single_choice,
          content: '2+2?',
          options: ['1', '4', '3'],
          correctIndex: 1,
          explanation: 'four',
          answerGuide: null,
          difficultyLabel: 'Nhận biết',
          choiceIndex: 1,
          essayAnswer: null,
          markedForReview: false,
          isCorrect: null,
          pointsAwarded: null,
        },
        {
          id: 'ans-2',
          attemptId: 'att-1',
          questionId: 'q-essay',
          order: 1,
          pointsPossible: 50,
          type: QuestionType.essay,
          content: 'Why?',
          options: null,
          correctIndex: null,
          explanation: null,
          answerGuide: 'guide',
          difficultyLabel: 'Vận dụng cao',
          choiceIndex: null,
          essayAnswer: 'because',
          markedForReview: false,
          isCorrect: null,
          pointsAwarded: null,
        },
      ],
      ...over,
    };
  }

  beforeEach(() => {
    prisma = {
      attempt: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        groupBy: jest.fn(),
      },
      attemptAnswer: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      classContentItem: { findFirst: jest.fn() },
      studentClass: { findMany: jest.fn() },
      questionLink: { findMany: jest.fn() },
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
        }
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg;
      }),
    };
    topicService = {
      getPracticeAssignmentForStudent: jest.fn().mockResolvedValue(assignment),
    };
    service = new AttemptService(prisma as never, topicService as never);
  });

  it('start resumes in_progress instead of creating another', async () => {
    const existing = makeAttempt();
    prisma.attempt.findFirst.mockResolvedValue(existing);
    const result = await service.start('cls-1', 'cci-1', 'stu-1');
    expect(prisma.attempt.create).not.toHaveBeenCalled();
    expect(result.id).toBe('att-1');
    expect(result.status).toBe(AttemptStatus.in_progress);
    expect(result.questions[0].correctIndex).toBeUndefined();
  });

  it('start creates a new attempt linked to assignmentId', async () => {
    prisma.attempt.findFirst.mockResolvedValue(null);
    prisma.questionLink.findMany.mockResolvedValue([
      {
        questionId: 'q-mcq',
        order: 0,
        points: 2,
        question: {
          type: QuestionType.single_choice,
          content: '2+2?',
          options: ['1', '4', '3'],
          correctIndex: 1,
          explanation: 'four',
          answerGuide: null,
          difficultyLevel: { name: 'Nhận biết' },
        },
      },
    ]);
    const created = makeAttempt({ answers: [makeAttempt().answers[0]] });
    prisma.attempt.create.mockResolvedValue(created);

    const result = await service.start('cls-1', 'cci-1', 'stu-1');
    expect(prisma.attempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignmentId: 'cci-1',
          studentId: 'stu-1',
          durationMinutes: 10,
          answers: expect.objectContaining({
            create: [
              expect.objectContaining({
                questionId: 'q-mcq',
                pointsPossible: 100,
                correctIndex: 1,
                type: QuestionType.single_choice,
              }),
            ],
          }),
        }),
      }),
    );
    expect(result.assignmentId).toBe('cci-1');
    expect(result.scoreMax).toBe(50);
  });

  it('start N=0 trả lỗi tiếng Việt, không tạo Attempt', async () => {
    prisma.attempt.findFirst.mockResolvedValue(null);
    prisma.questionLink.findMany.mockResolvedValue([]);
    await expect(service.start('cls-1', 'cci-1', 'stu-1')).rejects.toThrow(
      'Đề chưa có câu hỏi, không thể bắt đầu làm bài.',
    );
    expect(prisma.attempt.create).not.toHaveBeenCalled();
  });

  it('start chia 100/N (bỏ points tay trên link) và snapshot đề', async () => {
    prisma.attempt.findFirst.mockResolvedValue(null);
    prisma.questionLink.findMany.mockResolvedValue([
      {
        questionId: 'q1',
        order: 0,
        points: 9,
        question: {
          type: QuestionType.single_choice,
          content: 'A?',
          options: ['x', 'y', 'z'],
          correctIndex: 0,
          explanation: null,
          answerGuide: null,
          difficultyLevel: { name: 'NB' },
        },
      },
      {
        questionId: 'q2',
        order: 1,
        points: 1,
        question: {
          type: QuestionType.single_choice,
          content: 'B?',
          options: ['a', 'b'],
          correctIndex: 1,
          explanation: null,
          answerGuide: null,
          difficultyLevel: { name: 'TH' },
        },
      },
      {
        questionId: 'q3',
        order: 2,
        points: 99,
        question: {
          type: QuestionType.essay,
          content: 'C?',
          options: null,
          correctIndex: null,
          explanation: null,
          answerGuide: 'barem',
          difficultyLevel: { name: 'VD' },
        },
      },
    ]);
    prisma.attempt.create.mockResolvedValue(makeAttempt());

    await service.start('cls-1', 'cci-1', 'stu-1');
    const createArg = prisma.attempt.create.mock.calls[0][0];
    const createdAnswers = createArg.data.answers.create;
    expect(createdAnswers.map((a: { pointsPossible: number }) => a.pointsPossible)).toEqual(
      [34, 33, 33],
    );
    expect(
      createdAnswers.reduce(
        (sum: number, a: { pointsPossible: number }) => sum + a.pointsPossible,
        0,
      ),
    ).toBe(100);
    expect(createdAnswers[0]).toMatchObject({
      options: ['x', 'y', 'z'],
      correctIndex: 0,
      content: 'A?',
    });
    expect(createdAnswers[2]).toMatchObject({
      type: QuestionType.essay,
      answerGuide: 'barem',
    });
  });

  it('submit grades MCQ and leaves essay ungraded without cancelling', async () => {
    const row = makeAttempt();
    prisma.attempt.findUnique.mockResolvedValue(row);
    const closed = makeAttempt({
      status: AttemptStatus.submitted,
      submittedAt: new Date(),
      autoGradedScore: 50,
      autoGradedMax: 50,
      hasUngradedEssay: true,
      answers: [
        { ...row.answers[0], isCorrect: true, pointsAwarded: 50 },
        { ...row.answers[1], isCorrect: null, pointsAwarded: null },
      ],
    });
    prisma.attempt.findUniqueOrThrow.mockResolvedValue(closed);

    const result = await service.submit('cls-1', 'att-1', 'stu-1');
    expect(result.status).toBe(AttemptStatus.submitted);
    expect(prisma.attempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'att-1', status: AttemptStatus.in_progress },
        data: expect.objectContaining({
          status: AttemptStatus.submitted,
          autoGradedScore: 50,
          autoGradedMax: 50,
          hasUngradedEssay: true,
        }),
      }),
    );
    expect(result.questions[0].correctIndex).toBe(1);
    expect(result.scoreMax).toBe(100);
  });

  it('saveAnswers persists markedForReview and returns it in detail', async () => {
    const row = makeAttempt();
    prisma.attempt.findUnique.mockResolvedValue(row);
    const updated = makeAttempt({
      answers: [
        { ...row.answers[0], markedForReview: true },
        row.answers[1],
      ],
    });
    prisma.attempt.findUnique
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(updated);

    const result = await service.saveAnswers('cls-1', 'att-1', 'stu-1', [
      { questionId: 'q-mcq', markedForReview: true },
    ]);

    expect(prisma.attemptAnswer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          attemptId_questionId: {
            attemptId: 'att-1',
            questionId: 'q-mcq',
          },
        },
        data: { markedForReview: true },
      }),
    );
    expect(result.questions[0].markedForReview).toBe(true);
    expect(result.questions[1].markedForReview).toBe(false);
  });

  it('gradeAndClose chấm theo snapshot, không theo Question live', async () => {
    const row = makeAttempt({
      answers: [
        {
          ...makeAttempt().answers[0],
          choiceIndex: 1,
          correctIndex: 1,
        },
        makeAttempt().answers[1],
      ],
    });
    prisma.attempt.findUnique.mockResolvedValue(row);
    prisma.attempt.findUniqueOrThrow.mockResolvedValue(
      makeAttempt({
        status: AttemptStatus.submitted,
        submittedAt: new Date(),
        autoGradedScore: 50,
        autoGradedMax: 50,
        hasUngradedEssay: true,
      }),
    );

    await service.submit('cls-1', 'att-1', 'stu-1');
    expect(prisma.attempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          autoGradedScore: 50,
          autoGradedMax: 50,
        }),
      }),
    );
  });

  it('sửa correctIndex sau start không đổi điểm lượt đó', async () => {
    const row = makeAttempt({
      answers: [
        {
          ...makeAttempt().answers[0],
          choiceIndex: 1,
          // Snapshot lúc start là 0; staff đảo live sang 1 sau đó.
          correctIndex: 0,
        },
        makeAttempt().answers[1],
      ],
    });
    prisma.attempt.findUnique.mockResolvedValue(row);
    prisma.attempt.findUniqueOrThrow.mockResolvedValue(
      makeAttempt({
        status: AttemptStatus.submitted,
        submittedAt: new Date(),
        autoGradedScore: 0,
        autoGradedMax: 50,
        hasUngradedEssay: true,
      }),
    );

    await service.submit('cls-1', 'att-1', 'stu-1');
    expect(prisma.attempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          autoGradedScore: 0,
          autoGradedMax: 50,
        }),
      }),
    );
  });

  it('GET after duration expires times out and still grades', async () => {
    const row = makeAttempt({
      startedAt: new Date(Date.now() - 20 * 60 * 1000),
      durationMinutes: 10,
    });
    prisma.attempt.findUnique.mockResolvedValue(row);
    const closed = makeAttempt({
      status: AttemptStatus.timed_out,
      submittedAt: new Date(),
      autoGradedScore: 50,
      autoGradedMax: 50,
      hasUngradedEssay: true,
    });
    prisma.attempt.findUniqueOrThrow.mockResolvedValue(closed);

    const result = await service.get('cls-1', 'att-1', 'stu-1');
    expect(prisma.attempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'att-1', status: AttemptStatus.in_progress },
        data: expect.objectContaining({ status: AttemptStatus.timed_out }),
      }),
    );
    expect(result.status).toBe(AttemptStatus.timed_out);
  });

  describe('finalizeExpiredInProgress', () => {
    function expiredAttempt(over: Record<string, unknown> = {}) {
      return makeAttempt({
        startedAt: new Date(Date.now() - 20 * 60 * 1000),
        durationMinutes: 10,
        ...over,
      });
    }

    it('chốt Attempt quá giờ thành timed_out và chấm MCQ', async () => {
      const row = expiredAttempt();
      prisma.attempt.findMany.mockResolvedValue([row]);
      prisma.attempt.findUniqueOrThrow.mockResolvedValue(
        expiredAttempt({
          status: AttemptStatus.timed_out,
          submittedAt: new Date(),
          autoGradedScore: 50,
          autoGradedMax: 50,
          hasUngradedEssay: true,
        }),
      );

      const count = await service.finalizeExpiredInProgress();
      expect(count).toBe(1);
      expect(prisma.attempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att-1', status: AttemptStatus.in_progress },
          data: expect.objectContaining({
            status: AttemptStatus.timed_out,
            autoGradedScore: 50,
            autoGradedMax: 50,
            hasUngradedEssay: true,
          }),
        }),
      );
      expect(prisma.attemptAnswer.update).toHaveBeenCalled();
    });

    it('chạy lần 2 không đổi gì (idempotent)', async () => {
      prisma.attempt.findMany
        .mockResolvedValueOnce([expiredAttempt()])
        .mockResolvedValueOnce([]);
      prisma.attempt.findUniqueOrThrow.mockResolvedValue(
        expiredAttempt({ status: AttemptStatus.timed_out }),
      );

      expect(await service.finalizeExpiredInProgress()).toBe(1);
      expect(await service.finalizeExpiredInProgress()).toBe(0);
      expect(prisma.attempt.updateMany).toHaveBeenCalledTimes(1);
    });

    it('0 bản ghi không nổ và trả 0', async () => {
      prisma.attempt.findMany.mockResolvedValue([]);
      await expect(service.finalizeExpiredInProgress()).resolves.toBe(0);
      expect(prisma.attempt.updateMany).not.toHaveBeenCalled();
    });

    it('bỏ qua lượt còn hạn; không claim khi học sinh đã nộp', async () => {
      const live = makeAttempt({
        startedAt: new Date(Date.now() - 1000),
        durationMinutes: 10,
      });
      prisma.attempt.findMany.mockResolvedValue([live]);
      expect(await service.finalizeExpiredInProgress()).toBe(0);
      expect(prisma.attempt.updateMany).not.toHaveBeenCalled();

      prisma.attempt.findMany.mockResolvedValue([expiredAttempt()]);
      prisma.attempt.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.finalizeExpiredInProgress()).toBe(0);
      expect(prisma.attemptAnswer.update).not.toHaveBeenCalled();
    });
  });

  it('lobby delegates openAt/expiry to CourseContentService', async () => {
    prisma.attempt.findMany.mockResolvedValue([]);
    await service.getLobby('cls-1', 'cci-1', 'stu-1');
    expect(topicService.getPracticeAssignmentForStudent).toHaveBeenCalledWith(
      'cls-1',
      'cci-1',
      'stu-1',
    );
  });

  describe('getGradingQueue', () => {
    it('chỉ lấy câu tự luận chưa chấm; distinct theo studentId (lượt mới nhất)', async () => {
      prisma.classContentItem.findFirst.mockResolvedValue(assignment);
      prisma.attempt.groupBy.mockResolvedValue([
        { studentId: 'stu-1', _count: { _all: 3 } },
      ]);
      prisma.attempt.findMany.mockResolvedValue([
        makeAttempt({
          id: 'att-latest',
          submittedAt: new Date('2026-09-05T20:14:00Z'),
          hasUngradedEssay: true,
          student: { fullName: 'Phạm Gia Huy' },
          answers: [
            makeAttempt().answers[0],
            {
              ...makeAttempt().answers[1],
              pointsAwarded: null,
            },
          ],
        }),
      ]);

      const result = await service.getGradingQueue('cls-1', 'cci-1');
      expect(prisma.attempt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ distinct: ['studentId'] }),
      );
      expect(result.totalPending).toBe(1);
      expect(result.items[0]).toMatchObject({
        studentName: 'Phạm Gia Huy',
        studentAttemptCount: 3,
        difficultyLabel: 'Vận dụng cao',
        questionOrder: 2,
        totalQuestions: 2,
        pointsPossible: 50,
      });
    });

    it('bỏ qua attempt không còn tự luận chờ chấm', async () => {
      prisma.classContentItem.findFirst.mockResolvedValue(assignment);
      prisma.attempt.groupBy.mockResolvedValue([]);
      prisma.attempt.findMany.mockResolvedValue([
        makeAttempt({ hasUngradedEssay: false }),
      ]);
      const result = await service.getGradingQueue('cls-1', 'cci-1');
      expect(result.items).toHaveLength(0);
    });
  });

  describe('gradeEssayAnswer', () => {
    function essayAnswerRow(over: Record<string, unknown> = {}) {
      return {
        id: 'ans-2',
        attemptId: 'att-latest',
        pointsPossible: 50,
        type: QuestionType.essay,
        attempt: {
          id: 'att-latest',
          studentId: 'stu-1',
          assignmentId: 'cci-1',
          assignment: { classId: 'cls-1' },
        },
        ...over,
      };
    }

    it('từ chối chấm lượt cũ (không phải lượt mới nhất) với 404', async () => {
      prisma.attemptAnswer.findUnique.mockResolvedValue(essayAnswerRow());
      prisma.attempt.findFirst.mockResolvedValue({ id: 'att-newer' });
      await expect(
        service.gradeEssayAnswer('cls-1', 'cci-1', 'ans-2', {
          pointsAwarded: 3,
        }),
      ).rejects.toThrow('Essay answer not found');
      expect(prisma.attemptAnswer.update).not.toHaveBeenCalled();
    });

    it('chặn điểm vượt thang điểm câu', async () => {
      prisma.attemptAnswer.findUnique.mockResolvedValue(essayAnswerRow());
      prisma.attempt.findFirst.mockResolvedValue({ id: 'att-latest' });
      await expect(
        service.gradeEssayAnswer('cls-1', 'cci-1', 'ans-2', {
          pointsAwarded: 99,
        }),
      ).rejects.toThrow('không được vượt quá 50');
    });

    it('lưu điểm + feedback, gỡ hasUngradedEssay khi hết câu chờ', async () => {
      prisma.attemptAnswer.findUnique.mockResolvedValue(essayAnswerRow());
      prisma.attempt.findFirst.mockResolvedValue({ id: 'att-latest' });
      prisma.attemptAnswer.count.mockResolvedValue(0);

      await service.gradeEssayAnswer('cls-1', 'cci-1', 'ans-2', {
        pointsAwarded: 4,
        feedback: '  tốt  ',
      });

      expect(prisma.attemptAnswer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pointsAwarded: 4,
            isCorrect: null,
            feedback: '  tốt  ',
          }),
        }),
      );
      expect(prisma.attempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { hasUngradedEssay: false },
        }),
      );
    });

    it('giữ hasUngradedEssay khi vẫn còn câu tự luận chờ', async () => {
      prisma.attemptAnswer.findUnique.mockResolvedValue(essayAnswerRow());
      prisma.attempt.findFirst.mockResolvedValue({ id: 'att-latest' });
      prisma.attemptAnswer.count.mockResolvedValue(2);

      await service.gradeEssayAnswer('cls-1', 'cci-1', 'ans-2', {
        pointsAwarded: 4,
      });
      expect(prisma.attempt.update).not.toHaveBeenCalled();
    });
  });

  describe('getPracticeStats', () => {
    const assignmentWithClass = {
      ...assignment,
      class: { name: '12A3' },
    };

    function closedAttempt(over: Record<string, unknown> = {}) {
      return makeAttempt({
        status: AttemptStatus.submitted,
        submittedAt: new Date('2026-09-05T20:14:00Z'),
        autoGradedScore: 50,
        autoGradedMax: 50,
        hasUngradedEssay: false,
        answers: [
          {
            ...makeAttempt().answers[0],
            isCorrect: true,
            pointsAwarded: 50,
          },
          {
            ...makeAttempt().answers[1],
            pointsAwarded: 50,
          },
        ],
        ...over,
      });
    }

    it('điểm = lượt cao nhất đã chấm xong; lượt chờ chấm không vào trung bình', async () => {
      prisma.classContentItem.findFirst.mockResolvedValue(assignmentWithClass);
      prisma.studentClass.findMany.mockResolvedValue([
        { studentId: 'stu-1', student: { id: 'stu-1', fullName: 'An' } },
        { studentId: 'stu-2', student: { id: 'stu-2', fullName: 'Bình' } },
        { studentId: 'stu-3', student: { id: 'stu-3', fullName: 'Chi' } },
      ]);
      prisma.questionLink.findMany.mockResolvedValue([
        {
          questionId: 'q-mcq',
          order: 0,
          question: { id: 'q-mcq', type: QuestionType.single_choice },
        },
        {
          questionId: 'q-essay',
          order: 1,
          question: { id: 'q-essay', type: QuestionType.essay },
        },
      ]);
      prisma.attempt.findMany.mockResolvedValue([
        closedAttempt({
          id: 'att-low',
          studentId: 'stu-1',
          autoGradedScore: 0,
          answers: [
            {
              ...makeAttempt().answers[0],
              isCorrect: false,
              pointsAwarded: 0,
            },
            {
              ...makeAttempt().answers[1],
              pointsAwarded: 20,
            },
          ],
        }),
        closedAttempt({ id: 'att-best', studentId: 'stu-1' }),
        closedAttempt({
          id: 'att-pending',
          studentId: 'stu-2',
          hasUngradedEssay: true,
          answers: [
            {
              ...makeAttempt().answers[0],
              isCorrect: true,
              pointsAwarded: 50,
            },
            {
              ...makeAttempt().answers[1],
              pointsAwarded: null,
            },
          ],
        }),
      ]);

      const result = await service.getPracticeStats('cls-1', 'cci-1');
      expect(prisma.attempt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assignmentId: 'cci-1',
            assignment: { classId: 'cls-1' },
          }),
        }),
      );
      expect(result.submittedCount).toBe(2);
      expect(result.rosterCount).toBe(3);
      expect(result.pendingEssayCount).toBe(1);
      expect(result.averageScore).toBe(100);
      const an = result.students.find((s) => s.studentId === 'stu-1');
      expect(an).toMatchObject({
        score: 100,
        scoreMax: 100,
        status: 'graded',
        attemptCount: 2,
      });
      const binh = result.students.find((s) => s.studentId === 'stu-2');
      expect(binh).toMatchObject({
        score: null,
        status: 'pending_essay',
        attemptCount: 1,
      });
      const chi = result.students.find((s) => s.studentId === 'stu-3');
      expect(chi).toMatchObject({ status: 'not_started', score: null });
      expect(result.questions[0].correctCount).toBe(1);
      expect(result.questions[0].sampleCount).toBe(1);
      expect(result.questions[1].correctCount).toBe(1);
    });
  });
});

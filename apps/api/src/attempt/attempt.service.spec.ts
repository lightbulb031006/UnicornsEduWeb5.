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
jest.mock('../storage/supabase-storage', () => ({
  tryGetSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrls: (paths: string[]) =>
          Promise.resolve({
            data: paths.map((path) => ({
              path,
              signedUrl: `signed:${path}`,
              error: null,
            })),
            error: null,
          }),
      }),
    },
  }),
}));
jest.mock('../course-content/course-content.service', () => ({
  CourseContentService: class CourseContentServiceMock {},
}));

import { AttemptService } from './attempt.service';
import {
  AttemptScoring,
  AttemptStatus,
  QuestionSlot,
  QuestionType,
} from 'generated/enums';
import { lmsProfileConfig } from '../lms-profile/lms-profile';

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
    closeAt: new Date(Date.now() + 24 * 60 * 60_000),
    lesson: { id: 'topic-1', kind: 'practice', title: 'Đề A' },
  };
  /** Lần giao đã qua hạn làm bài (closeAt) → chặn bắt đầu lượt mới. */
  const pastAssignment = {
    ...assignment,
    openAt: new Date(Date.now() - 2 * 60 * 60_000),
    closeAt: new Date(Date.now() - 60_000),
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
      $queryRaw: jest.fn().mockResolvedValue([]),
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

  it('start ENG chia 100/N (bỏ trọng số trên link) và snapshot đề', async () => {
    const engService = new AttemptService(
      prisma as never,
      topicService as never,
      { config: lmsProfileConfig('eng'), isIt: false } as never,
    );
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

    await engService.start('cls-1', 'cci-1', 'stu-1');
    const createArg = prisma.attempt.create.mock.calls[0][0];
    const createdAnswers = createArg.data.answers.create;
    expect(
      createdAnswers.map((a: { pointsPossible: number }) => a.pointsPossible),
    ).toEqual([34, 33, 33]);
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

  it('start JP chia 100 theo trọng số câu-trong-tiết (null = 1)', async () => {
    prisma.attempt.findFirst.mockResolvedValue(null);
    const link = (
      questionId: string,
      order: number,
      points: number | null,
    ) => ({
      questionId,
      order,
      points,
      question: {
        type: QuestionType.single_choice,
        content: `${questionId}?`,
        options: ['a', 'b'],
        correctIndex: 0,
        explanation: null,
        answerGuide: null,
        difficultyLevel: { name: 'NB' },
      },
    });
    prisma.questionLink.findMany.mockResolvedValue([
      link('q1', 0, null),
      link('q2', 1, 2),
      link('q3', 2, 1),
    ]);
    prisma.attempt.create.mockResolvedValue(makeAttempt());

    await service.start('cls-1', 'cci-1', 'stu-1');
    const createdAnswers =
      prisma.attempt.create.mock.calls[0][0].data.answers.create;
    expect(
      createdAnswers.map((a: { pointsPossible: number }) => a.pointsPossible),
    ).toEqual([25, 50, 25]);
  });

  it('submit grades MCQ and leaves essay ungraded without cancelling', async () => {
    const row = makeAttempt();
    prisma.attempt.findUnique.mockResolvedValue(row);
    const closed = makeAttempt({
      assignment: pastAssignment,
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
    expect(result.resultsReleased).toBe(true);
  });

  it('submit trước hạn lần giao: hiện điểm và đáp án ngay', async () => {
    const row = makeAttempt();
    prisma.attempt.findUnique.mockResolvedValue(row);
    prisma.attempt.findUniqueOrThrow.mockResolvedValue(
      makeAttempt({
        status: AttemptStatus.submitted,
        submittedAt: new Date(),
        autoGradedScore: 50,
        autoGradedMax: 50,
        electiveVoided: true,
        answers: [
          { ...row.answers[0], isCorrect: true, pointsAwarded: 50 },
          row.answers[1],
        ],
      }),
    );

    const result = await service.submit('cls-1', 'att-1', 'stu-1');
    expect(result.status).toBe(AttemptStatus.submitted);
    expect(result.resultsReleased).toBe(true);
    expect(result.closeAt).toEqual(assignment.closeAt);
    expect(result.autoGradedScore).toBe(50);
    expect(result.autoGradedMax).toBe(50);
    expect(result.questions[0].choiceIndex).toBe(1);
    expect(result.questions[0].correctIndex).toBe(1);
    expect(result.questions[0].isCorrect).toBe(true);
    expect(result.questions[0].pointsAwarded).toBe(50);
  });

  it('start sau hạn lần giao: 403, không tạo lượt mới', async () => {
    topicService.getPracticeAssignmentForStudent.mockResolvedValue(
      pastAssignment,
    );
    prisma.attempt.findFirst.mockResolvedValue(null);
    await expect(service.start('cls-1', 'cci-1', 'stu-1')).rejects.toThrow(
      'Đã hết hạn làm bài.',
    );
    expect(prisma.attempt.create).not.toHaveBeenCalled();
  });

  it('start sau hạn vẫn trả lượt đang làm dở', async () => {
    topicService.getPracticeAssignmentForStudent.mockResolvedValue(
      pastAssignment,
    );
    prisma.attempt.findFirst.mockResolvedValue(makeAttempt());
    const result = await service.start('cls-1', 'cci-1', 'stu-1');
    expect(result.status).toBe(AttemptStatus.in_progress);
  });

  it('saveAnswers persists markedForReview and returns it in detail', async () => {
    const row = makeAttempt();
    prisma.attempt.findUnique.mockResolvedValue(row);
    const updated = makeAttempt({
      answers: [{ ...row.answers[0], markedForReview: true }, row.answers[1]],
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

  describe('hồ sơ IT (absolute_it)', () => {
    let itService: AttemptService;
    const tfQuestion = (content: string) => ({
      type: QuestionType.true_false_group,
      content,
      options: ['a', 'b', 'c', 'd'],
      correctIndex: null,
      tfAnswerKey: [true, false, true, false],
      explanation: null,
      answerGuide: null,
      difficultyLevel: { name: 'TH' },
    });
    const scQuestion = {
      type: QuestionType.single_choice,
      content: 'MC?',
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 0,
      tfAnswerKey: [],
      explanation: null,
      answerGuide: null,
      difficultyLevel: { name: 'NB' },
    };

    beforeEach(() => {
      itService = new AttemptService(
        prisma as never,
        topicService as never,
        { config: lmsProfileConfig('it'), isIt: true } as never,
      );
      prisma.attempt.findFirst.mockResolvedValue(null);
      prisma.attempt.create.mockResolvedValue(makeAttempt());
    });

    it('start: 0,25đ trắc nghiệm / 1đ Đúng/Sai, sắp Phần I → bắt buộc → TC1 → TC2', async () => {
      prisma.questionLink.findMany.mockResolvedValue([
        {
          questionId: 'e2',
          order: 0,
          points: null,
          slot: QuestionSlot.elective_2,
          question: tfQuestion('E2'),
        },
        {
          questionId: 'r1',
          order: 1,
          points: null,
          slot: QuestionSlot.required,
          question: tfQuestion('R1'),
        },
        {
          questionId: 'e1',
          order: 2,
          points: null,
          slot: QuestionSlot.elective_1,
          question: tfQuestion('E1'),
        },
        {
          questionId: 'm1',
          order: 3,
          points: null,
          slot: QuestionSlot.required,
          question: scQuestion,
        },
      ]);

      await itService.start('cls-1', 'cci-1', 'stu-1');
      const createArg = prisma.attempt.create.mock.calls[0][0];
      expect(createArg.data.scoring).toBe(AttemptScoring.absolute_it);
      const answers = createArg.data.answers.create;
      expect(answers.map((a: { questionId: string }) => a.questionId)).toEqual([
        'm1',
        'r1',
        'e1',
        'e2',
      ]);
      expect(
        answers.map((a: { pointsPossible: number }) => a.pointsPossible),
      ).toEqual([25, 100, 100, 100]);
      expect(answers[2]).toMatchObject({
        slot: QuestionSlot.elective_1,
        tfAnswerKey: [true, false, true, false],
      });
    });

    it('start có đảo câu: giữ khung nhóm, xáo trong nhóm, đáp án theo thứ tự hiển thị', async () => {
      topicService.getPracticeAssignmentForStudent.mockResolvedValue({
        ...assignment,
        shuffleQuestions: true,
      });
      const mc = (id: string, correctIndex: number) => ({
        questionId: id,
        order: 0,
        points: null,
        slot: QuestionSlot.required,
        question: {
          ...scQuestion,
          content: id,
          options: ['A0', 'A1', 'A2', 'A3'],
          correctIndex,
        },
      });
      prisma.questionLink.findMany.mockResolvedValue([
        {
          questionId: 'e2',
          order: 0,
          points: null,
          slot: QuestionSlot.elective_2,
          question: tfQuestion('E2'),
        },
        mc('m1', 0),
        {
          questionId: 'r1',
          order: 1,
          points: null,
          slot: QuestionSlot.required,
          question: tfQuestion('R1'),
        },
        mc('m2', 1),
        mc('m3', 2),
        {
          questionId: 'e1',
          order: 2,
          points: null,
          slot: QuestionSlot.elective_1,
          question: tfQuestion('E1'),
        },
      ]);

      await itService.start('cls-1', 'cci-1', 'stu-1');
      const answers = prisma.attempt.create.mock.calls[0][0].data.answers
        .create as {
        questionId: string;
        order: number;
        options: string[];
        correctIndex: number | null;
        tfAnswerKey: boolean[];
        optionOrder: number[];
      }[];
      const ids = answers.map((a) => a.questionId);
      expect(ids.slice(0, 3).sort()).toEqual(['m1', 'm2', 'm3']);
      expect(ids.slice(3)).toEqual(['r1', 'e1', 'e2']);
      expect(answers.map((a) => a.order)).toEqual([0, 1, 2, 3, 4, 5]);
      const original = { m1: 0, m2: 1, m3: 2 } as Record<string, number>;
      for (const a of answers) {
        expect([...a.optionOrder].sort()).toEqual([0, 1, 2, 3]);
        if (a.questionId.startsWith('m')) {
          // Phương án đúng vẫn là phương án gốc, chỉ đổi vị trí.
          expect(a.options[a.correctIndex as number]).toBe(
            `A${original[a.questionId]}`,
          );
        } else {
          expect(a.tfAnswerKey).toEqual(
            a.optionOrder.map((i) => [true, false, true, false][i]),
          );
        }
      }
    });

    it('start có đảo câu nhưng phương án nhắc vị trí → giữ thứ tự phương án', async () => {
      topicService.getPracticeAssignmentForStudent.mockResolvedValue({
        ...assignment,
        shuffleQuestions: true,
      });
      prisma.questionLink.findMany.mockResolvedValue([
        {
          questionId: 'm1',
          order: 0,
          points: null,
          slot: QuestionSlot.required,
          question: {
            ...scQuestion,
            options: [
              'Nhận dạng giọng nói',
              'Dịch máy',
              'Xe tự lái',
              'Không có lĩnh vực nào ở trên',
            ],
            correctIndex: 3,
          },
        },
      ]);
      await itService.start('cls-1', 'cci-1', 'stu-1');
      const [a] = prisma.attempt.create.mock.calls[0][0].data.answers.create;
      expect(a.optionOrder).toEqual([]);
      expect(a.correctIndex).toBe(3);
    });

    it('start chặn đề sai form (thiếu Tự chọn 2)', async () => {
      prisma.questionLink.findMany.mockResolvedValue([
        {
          questionId: 'e1',
          order: 0,
          points: null,
          slot: QuestionSlot.elective_1,
          question: tfQuestion('E1'),
        },
      ]);
      await expect(itService.start('cls-1', 'cci-1', 'stu-1')).rejects.toThrow(
        'Đề sai form',
      );
      expect(prisma.attempt.create).not.toHaveBeenCalled();
    });
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

  it('lobby trước hạn: vẫn hiện điểm các lượt, closed = false', async () => {
    prisma.attempt.findMany.mockResolvedValue([
      makeAttempt({
        status: AttemptStatus.submitted,
        autoGradedScore: 50,
        autoGradedMax: 50,
      }),
    ]);
    const lobby = await service.getLobby('cls-1', 'cci-1', 'stu-1');
    expect(lobby.closed).toBe(false);
    expect(lobby.attempts[0].autoGradedScore).toBe(50);
    expect(lobby.attempts[0].autoGradedMax).toBe(50);
  });

  it('lobby sau hạn: closed = true', async () => {
    topicService.getPracticeAssignmentForStudent.mockResolvedValue(
      pastAssignment,
    );
    prisma.attempt.findMany.mockResolvedValue([
      makeAttempt({
        status: AttemptStatus.submitted,
        autoGradedScore: 50,
        autoGradedMax: 50,
      }),
    ]);
    const lobby = await service.getLobby('cls-1', 'cci-1', 'stu-1');
    expect(lobby.closed).toBe(true);
    expect(lobby.attempts[0].autoGradedScore).toBe(50);
  });

  it('lobby sau hạn: cộng điểm tự luận đã chấm vào tổng điểm', async () => {
    topicService.getPracticeAssignmentForStudent.mockResolvedValue(
      pastAssignment,
    );
    const row = makeAttempt();
    prisma.attempt.findMany.mockResolvedValue([
      makeAttempt({
        status: AttemptStatus.submitted,
        autoGradedScore: 50,
        autoGradedMax: 50,
        answers: [
          { ...row.answers[0], pointsAwarded: 50 },
          { ...row.answers[1], pointsAwarded: 30 },
        ],
      }),
    ]);
    const lobby = await service.getLobby('cls-1', 'cci-1', 'stu-1');
    expect(lobby.attempts[0].essayScore).toBe(30);
    expect(lobby.attempts[0].score).toBe(80);
    expect(lobby.attempts[0].scoreMax).toBe(100);
  });

  it('lobby trước hạn: hiện cả điểm tự luận đã chấm', async () => {
    const row = makeAttempt();
    prisma.attempt.findMany.mockResolvedValue([
      makeAttempt({
        status: AttemptStatus.submitted,
        autoGradedScore: 50,
        autoGradedMax: 50,
        answers: [row.answers[0], { ...row.answers[1], pointsAwarded: 30 }],
      }),
    ]);
    const lobby = await service.getLobby('cls-1', 'cci-1', 'stu-1');
    expect(lobby.attempts[0].essayScore).toBe(30);
    expect(lobby.attempts[0].score).toBe(80);
  });

  it('chi tiết sau hạn: trả điểm tổng gồm tự luận và nhận xét gia sư', async () => {
    topicService.getPracticeAssignmentForStudent.mockResolvedValue(
      pastAssignment,
    );
    const row = makeAttempt();
    prisma.attempt.findUnique.mockResolvedValue(
      makeAttempt({
        assignment: pastAssignment,
        status: AttemptStatus.submitted,
        submittedAt: new Date(),
        autoGradedScore: 50,
        autoGradedMax: 50,
        answers: [
          { ...row.answers[0], isCorrect: true, pointsAwarded: 50 },
          {
            ...row.answers[1],
            pointsAwarded: 40,
            feedback: 'Lập luận tốt',
          },
        ],
      }),
    );

    const result = await service.get('cls-1', 'att-1', 'stu-1');
    expect(result.resultsReleased).toBe(true);
    expect(result.essayScore).toBe(40);
    expect(result.score).toBe(90);
    expect(result.questions[1].pointsAwarded).toBe(40);
    expect(result.questions[1].feedback).toBe('Lập luận tốt');
    expect(result.questions[0].feedback).toBeNull();
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

  it('404 khi tiết của lần giao đã lưu trữ', async () => {
    prisma.classContentItem.findFirst.mockResolvedValue({
      ...assignment,
      lesson: { ...assignment.lesson, archivedAt: new Date() },
    });

    await expect(service.getPracticeStats('cls-1', 'cci-1')).rejects.toThrow(
      'Assignment not found',
    );
    await expect(
      service.listStudentAttemptsForStaff('cls-1', 'cci-1', 'stu-1'),
    ).rejects.toThrow('Assignment not found');
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

    it('từ chối chấm câu thuộc lượt đang làm với 404', async () => {
      prisma.attemptAnswer.findUnique.mockResolvedValue(
        essayAnswerRow({
          attempt: {
            ...essayAnswerRow().attempt,
            status: AttemptStatus.in_progress,
          },
        }),
      );
      prisma.attempt.findFirst.mockResolvedValue({ id: 'att-latest' });
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

    const at = (minute: number) =>
      new Date(`2026-09-05T20:${String(minute).padStart(2, '0')}:00Z`);
    const lowAnswers = [
      { ...makeAttempt().answers[0], isCorrect: false, pointsAwarded: 0 },
      { ...makeAttempt().answers[1], pointsAwarded: 20 },
    ];
    const pendingAnswers = [
      { ...makeAttempt().answers[0], isCorrect: true, pointsAwarded: 50 },
      { ...makeAttempt().answers[1], pointsAwarded: null },
    ];

    it('điểm = lượt đã chấm xong gần nhất; lượt chờ chấm quay về lượt đã chấm trước', async () => {
      prisma.classContentItem.findFirst.mockResolvedValue(assignmentWithClass);
      prisma.studentClass.findMany.mockResolvedValue([
        { studentId: 'stu-1', student: { id: 'stu-1', fullName: 'An' } },
        { studentId: 'stu-2', student: { id: 'stu-2', fullName: 'Bình' } },
        { studentId: 'stu-3', student: { id: 'stu-3', fullName: 'Chi' } },
        { studentId: 'stu-4', student: { id: 'stu-4', fullName: 'Dũng' } },
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
        // An: lượt 1 được 100, lượt 2 (gần nhất) được 20 → điểm 20.
        closedAttempt({
          id: 'att-a1',
          studentId: 'stu-1',
          startedAt: at(0),
          submittedAt: at(5),
        }),
        closedAttempt({
          id: 'att-a2',
          studentId: 'stu-1',
          startedAt: at(10),
          submittedAt: at(15),
          autoGradedScore: 0,
          answers: lowAnswers,
        }),
        // Bình: lượt 2 chờ chấm → điểm vẫn của lượt 1.
        closedAttempt({
          id: 'att-b1',
          studentId: 'stu-2',
          startedAt: at(1),
          submittedAt: at(6),
        }),
        closedAttempt({
          id: 'att-b2',
          studentId: 'stu-2',
          startedAt: at(11),
          submittedAt: at(16),
          hasUngradedEssay: true,
          answers: pendingAnswers,
        }),
        // Chi: chỉ có lượt đang làm.
        makeAttempt({ id: 'att-c1', studentId: 'stu-3', startedAt: at(20) }),
      ]);

      const result = await service.getPracticeStats('cls-1', 'cci-1');
      expect(prisma.attempt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { assignmentId: 'cci-1', assignment: { classId: 'cls-1' } },
        }),
      );
      expect(result.submittedCount).toBe(2);
      expect(result.rosterCount).toBe(4);
      expect(result.pendingEssayCount).toBe(1);
      expect(result.averageScore).toBe(60);
      expect(
        result.students.find((s) => s.studentId === 'stu-1'),
      ).toMatchObject({
        score: 20,
        scoreMax: 100,
        status: 'graded',
        attemptCount: 2,
        scoredAttemptNo: 2,
        latestAttemptNo: 2,
      });
      expect(
        result.students.find((s) => s.studentId === 'stu-2'),
      ).toMatchObject({
        score: 100,
        status: 'pending_essay',
        attemptCount: 2,
        scoredAttemptNo: 1,
        latestAttemptNo: 2,
      });
      expect(
        result.students.find((s) => s.studentId === 'stu-3'),
      ).toMatchObject({ status: 'in_progress', score: null, attemptCount: 0 });
      expect(
        result.students.find((s) => s.studentId === 'stu-4'),
      ).toMatchObject({
        status: 'not_started',
        score: null,
        latestAttemptNo: null,
      });
      // Tỉ lệ đúng trên lượt đang tính điểm: An sai (att-a2), Bình đúng (att-b1).
      expect(result.questions[0]).toMatchObject({
        correctCount: 1,
        sampleCount: 2,
      });
    });

    it('học sinh đang làm lượt mới: trạng thái in_progress, giữ điểm lượt đã chấm', async () => {
      prisma.classContentItem.findFirst.mockResolvedValue(assignmentWithClass);
      prisma.studentClass.findMany.mockResolvedValue([
        { studentId: 'stu-1', student: { id: 'stu-1', fullName: 'An' } },
      ]);
      prisma.questionLink.findMany.mockResolvedValue([]);
      prisma.attempt.findMany.mockResolvedValue([
        closedAttempt({ id: 'att-1', startedAt: at(0), submittedAt: at(5) }),
        makeAttempt({ id: 'att-2', startedAt: at(10) }),
      ]);

      const result = await service.getPracticeStats('cls-1', 'cci-1');
      expect(result.students[0]).toMatchObject({
        status: 'in_progress',
        score: 100,
        scoredAttemptNo: 1,
        attemptCount: 1,
      });
      expect(result.pendingEssayCount).toBe(0);
    });
  });

  describe('xem bài làm phía dạy', () => {
    const at = (minute: number) =>
      new Date(`2026-09-05T20:${String(minute).padStart(2, '0')}:00Z`);

    beforeEach(() => {
      prisma.studentInfo = { findUnique: jest.fn() };
      prisma.classContentItem.findFirst.mockResolvedValue({
        ...assignment,
        class: { name: '12A3' },
      });
    });

    it('liệt kê lượt đã nộp mới nhất trước; chỉ lượt mới nhất có tự luận chấm được', async () => {
      prisma.studentInfo.findUnique.mockResolvedValue({ fullName: 'An' });
      prisma.attempt.findMany.mockResolvedValue([
        makeAttempt({
          id: 'att-1',
          status: AttemptStatus.submitted,
          startedAt: at(0),
          submittedAt: at(5),
          autoGradedScore: 50,
          autoGradedMax: 50,
        }),
        makeAttempt({
          id: 'att-2',
          status: AttemptStatus.timed_out,
          startedAt: at(10),
          submittedAt: at(20),
          autoGradedScore: 0,
          autoGradedMax: 50,
          hasUngradedEssay: true,
        }),
      ]);

      const result = await service.listStudentAttemptsForStaff(
        'cls-1',
        'cci-1',
        'stu-1',
      );
      expect(result.studentName).toBe('An');
      expect(result.inProgress).toBe(false);
      expect(result.attempts.map((a) => [a.id, a.no])).toEqual([
        ['att-2', 2],
        ['att-1', 1],
      ]);
      expect(result.attempts[0]).toMatchObject({
        gradable: true,
        isScored: false,
        hasUngradedEssay: true,
      });
      expect(result.attempts[1]).toMatchObject({
        gradable: false,
        isScored: true,
        score: 50,
      });
    });

    it('học sinh đang làm lượt mới → không lượt nào chấm được, lượt làm dở bị ẩn', async () => {
      prisma.studentInfo.findUnique.mockResolvedValue({ fullName: 'An' });
      prisma.attempt.findMany.mockResolvedValue([
        makeAttempt({
          id: 'att-1',
          status: AttemptStatus.submitted,
          startedAt: at(0),
          submittedAt: at(5),
          hasUngradedEssay: true,
        }),
        makeAttempt({ id: 'att-2', startedAt: at(10) }),
      ]);

      const result = await service.listStudentAttemptsForStaff(
        'cls-1',
        'cci-1',
        'stu-1',
      );
      expect(result.inProgress).toBe(true);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].gradable).toBe(false);
    });

    it('404 khi học sinh không tồn tại', async () => {
      prisma.studentInfo.findUnique.mockResolvedValue(null);
      await expect(
        service.listStudentAttemptsForStaff('cls-1', 'cci-1', 'stu-x'),
      ).rejects.toThrow('Student not found');
    });

    it('chi tiết lượt: kèm đáp án + attemptAnswerId theo đúng câu', async () => {
      prisma.attempt.findUnique.mockResolvedValue(
        makeAttempt({
          id: 'att-1',
          status: AttemptStatus.submitted,
          submittedAt: at(5),
          startedAt: at(0),
          hasUngradedEssay: true,
          student: { fullName: 'An' },
        }),
      );
      prisma.attempt.findMany.mockResolvedValue([
        {
          id: 'att-1',
          status: AttemptStatus.submitted,
          startedAt: at(0),
          submittedAt: at(5),
          hasUngradedEssay: true,
        },
      ]);

      const result = await service.getAttemptForStaff(
        'cls-1',
        'cci-1',
        'att-1',
      );
      expect(result).toMatchObject({
        studentName: 'An',
        no: 1,
        gradable: true,
        isScored: false,
        resultsReleased: true,
      });
      expect(result.questions.map((q) => q.attemptAnswerId)).toEqual([
        'ans-1',
        'ans-2',
      ]);
      expect(result.questions[0].correctIndex).toBe(1);
    });

    it('404 với lượt đang làm hoặc lượt của lần giao khác', async () => {
      prisma.attempt.findUnique.mockResolvedValue(
        makeAttempt({ student: { fullName: 'An' } }),
      );
      await expect(
        service.getAttemptForStaff('cls-1', 'cci-1', 'att-1'),
      ).rejects.toThrow('Attempt not found');

      prisma.attempt.findUnique.mockResolvedValue(
        makeAttempt({
          status: AttemptStatus.submitted,
          assignmentId: 'cci-other',
          student: { fullName: 'An' },
        }),
      );
      await expect(
        service.getAttemptForStaff('cls-1', 'cci-1', 'att-1'),
      ).rejects.toThrow('Attempt not found');
    });
  });

  describe('playAudio (giới hạn nghe)', () => {
    const audioAnswer = (over: Record<string, unknown> = {}) =>
      makeAttempt({
        answers: [
          {
            ...makeAttempt().answers[0],
            audioId: null,
            sharedMaterialAudioId: 'au-1',
          },
        ],
        ...over,
      });
    const limitedAudio = {
      id: 'au-1',
      storagePath: 'course-1/au-1.mp3',
      originalName: 'bai-nghe.mp3',
      maxPlays: 2,
      allowSeek: false,
    };

    beforeEach(() => {
      prisma.audioAsset = {
        findMany: jest.fn().mockResolvedValue([limitedAudio]),
      };
      prisma.attemptAudioPlay = {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ playCount: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      };
      prisma.attempt.findUnique.mockResolvedValue(audioAnswer());
    });

    it('bấm phát: đếm một lần và trả URL', async () => {
      const result = await service.playAudio('cls-1', 'att-1', 'stu-1', 'au-1');
      expect(prisma.attemptAudioPlay.updateMany).toHaveBeenCalledWith({
        where: { attemptId: 'att-1', audioId: 'au-1', playCount: { lt: 2 } },
        data: { playCount: { increment: 1 } },
      });
      expect(result).toEqual({
        url: 'signed:course-1/au-1.mp3',
        maxPlays: 2,
        playsUsed: 1,
      });
    });

    it('hết lượt: server từ chối (tải lại trang không hồi lượt)', async () => {
      prisma.attemptAudioPlay.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.playAudio('cls-1', 'att-1', 'stu-1', 'au-1'),
      ).rejects.toThrow('Đã hết lượt nghe audio này.');
    });

    it('audio không giới hạn: không đếm', async () => {
      prisma.audioAsset.findMany.mockResolvedValue([
        { ...limitedAudio, maxPlays: null },
      ]);
      const result = await service.playAudio('cls-1', 'att-1', 'stu-1', 'au-1');
      expect(prisma.attemptAudioPlay.updateMany).not.toHaveBeenCalled();
      expect(result.url).toBe('signed:course-1/au-1.mp3');
    });

    it('audio không thuộc lượt làm → 404', async () => {
      await expect(
        service.playAudio('cls-1', 'att-1', 'stu-1', 'au-khac'),
      ).rejects.toThrow('Audio không thuộc lượt làm này.');
    });

    it('lượt đã nộp → từ chối, không đếm', async () => {
      prisma.attempt.findUnique.mockResolvedValue(
        audioAnswer({ status: AttemptStatus.submitted }),
      );
      await expect(
        service.playAudio('cls-1', 'att-1', 'stu-1', 'au-1'),
      ).rejects.toThrow('Lượt làm đã kết thúc');
      expect(prisma.attemptAudioPlay.updateMany).not.toHaveBeenCalled();
    });

    it('chi tiết lượt đang làm giấu URL audio giới hạn, kèm số lần đã nghe', async () => {
      prisma.attemptAudioPlay.findMany.mockResolvedValue([
        { audioId: 'au-1', playCount: 1 },
      ]);
      prisma.attempt.findUnique.mockResolvedValue(
        makeAttempt({
          answers: [{ ...makeAttempt().answers[0], audioId: 'au-1' }],
        }),
      );
      const detail = await service.get('cls-1', 'att-1', 'stu-1');
      expect(detail.questions[0].audio).toEqual({
        id: 'au-1',
        url: null,
        maxPlays: 2,
        allowSeek: false,
        playsUsed: 1,
      });
    });
  });
});

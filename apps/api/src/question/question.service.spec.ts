jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ActionHistoryService } from 'src/action-history/action-history.service';
import { QuestionService } from './question.service';
import {
  EssayInputSizeDto,
  QuestionSkillDto,
  QuestionTypeDto,
  TrueFalseLabelStyleDto,
} from 'src/dtos/question.dto';

/** Typed wrapper around expect.objectContaining to avoid no-unsafe-assignment */
function contains<T>(obj: T): T {
  return expect.objectContaining(obj) as T;
}

describe('QuestionService', () => {
  let service: QuestionService;
  const mockPrisma = {
    question: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    sharedMaterial: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    audioAsset: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    questionLink: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    lessonQuiz: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    module: {
      findUnique: jest.fn(),
    },
    courseDifficultyLevel: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const mockActionHistory = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };
  const mockCourseAccess = {
    resolveActor: jest.fn(),
    assertCanWriteCourseQuestions: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma),
    );
    // Default: cross-course validation passes
    mockPrisma.module.findUnique.mockResolvedValue({ courseId: 'c1' });
    mockPrisma.courseDifficultyLevel.findUnique.mockResolvedValue({
      courseId: 'c1',
    });
    mockCourseAccess.resolveActor.mockResolvedValue({
      userId: 'u1',
      staffId: 'staff-1',
      roles: ['assistant'],
      isAdminUser: true,
    });
    mockCourseAccess.assertCanWriteCourseQuestions.mockResolvedValue(undefined);
    service = new QuestionService(
      mockPrisma as never,
      mockActionHistory as unknown as ActionHistoryService,
      mockCourseAccess as never,
    );
  });

  const actor = { userId: 'u1', userEmail: 'test@example.com' };

  describe('list', () => {
    it('returns questions with default pagination', async () => {
      mockPrisma.question.findMany.mockResolvedValue([]);
      const result = await service.list({});
      expect(mockPrisma.question.findMany).toHaveBeenCalledWith(
        contains({ where: { deletedAt: null }, skip: 0, take: 20 }),
      );
      expect(result).toEqual([]);
    });

    it('applies moduleId filter', async () => {
      mockPrisma.question.findMany.mockResolvedValue([]);
      await service.list({ moduleId: 'ch1' });
      expect(mockPrisma.question.findMany).toHaveBeenCalledWith(
        contains({ where: contains({ moduleId: 'ch1' }) }),
      );
    });

    it('applies search filter', async () => {
      mockPrisma.question.findMany.mockResolvedValue([]);
      await service.list({ search: 'math' });
      expect(mockPrisma.question.findMany).toHaveBeenCalledWith(
        contains({
          where: contains({
            content: { contains: 'math', mode: 'insensitive' },
          }),
        }),
      );
    });
  });

  describe('get', () => {
    it('returns question by id', async () => {
      const q = { id: 'q1', deletedAt: null };
      mockPrisma.question.findUnique.mockResolvedValue(q);
      const result = await service.get('q1');
      expect(result).toEqual({ ...q, audio: null });
    });

    it('throws NotFoundException for missing question', async () => {
      mockPrisma.question.findUnique.mockResolvedValue(null);
      await expect(service.get('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for soft-deleted question', async () => {
      mockPrisma.question.findUnique.mockResolvedValue({
        id: 'q1',
        deletedAt: new Date(),
      });
      await expect(service.get('q1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const baseDto = {
      courseId: 'c1',
      moduleId: 'ch1',
      difficultyLevelId: 'd1',
      content: '<p>Test?</p>',
      skills: [QuestionSkillDto.vocabulary],
    };

    it('JP: rejects create without any skill', async () => {
      await expect(
        service.create(
          { ...baseDto, skills: [], type: QuestionTypeDto.essay },
          actor,
        ),
      ).rejects.toThrow('Câu hỏi phải chọn ít nhất một kỹ năng.');
      expect(mockPrisma.question.create).not.toHaveBeenCalled();
    });

    it('creates a single_choice question', async () => {
      const dto = {
        ...baseDto,
        type: QuestionTypeDto.single_choice,
        options: ['A', 'B'],
        correctIndex: 0,
      };
      mockPrisma.question.create.mockResolvedValue({ id: 'q1', ...dto });
      const result = await service.create(dto, actor);
      expect(mockPrisma.question.create).toHaveBeenCalled();
      expect(mockActionHistory.recordCreate).toHaveBeenCalledWith(
        expect.anything(),
        contains({ entityType: 'question', entityId: 'q1' }),
      );
      expect(result.id).toBe('q1');
    });

    it('creates an essay question', async () => {
      const dto = {
        ...baseDto,
        type: QuestionTypeDto.essay,
      };
      mockPrisma.question.create.mockResolvedValue({ id: 'q2', ...dto });
      await service.create(dto, actor);
      expect(mockActionHistory.recordCreate).toHaveBeenCalled();
    });

    it('rejects create when actor cannot write the course bank', async () => {
      mockCourseAccess.assertCanWriteCourseQuestions.mockRejectedValue(
        new ForbiddenException('denied'),
      );
      const dto = {
        ...baseDto,
        type: QuestionTypeDto.essay,
      };
      await expect(service.create(dto, actor)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects single_choice with < 2 options', async () => {
      const dto = {
        ...baseDto,
        type: QuestionTypeDto.single_choice,
        options: ['A'],
        correctIndex: 0,
      };
      await expect(service.create(dto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects single_choice with > 6 options', async () => {
      const dto = {
        ...baseDto,
        type: QuestionTypeDto.single_choice,
        options: ['1', '2', '3', '4', '5', '6', '7'],
        correctIndex: 0,
      };
      await expect(service.create(dto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects single_choice with out-of-bounds correctIndex', async () => {
      const dto = {
        ...baseDto,
        type: QuestionTypeDto.single_choice,
        options: ['A', 'B'],
        correctIndex: 5,
      };
      await expect(service.create(dto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects single_choice without correctIndex', async () => {
      const dto = {
        ...baseDto,
        type: QuestionTypeDto.single_choice,
        options: ['A', 'B'],
      };
      await expect(service.create(dto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects essay with options', async () => {
      const dto = {
        ...baseDto,
        type: QuestionTypeDto.essay,
        options: ['A', 'B'],
      };
      await expect(service.create(dto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects create when chapter belongs to different course', async () => {
      mockPrisma.module.findUnique.mockResolvedValue({ courseId: 'other' });
      const dto = {
        ...baseDto,
        type: QuestionTypeDto.essay,
      };
      await expect(service.create(dto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects create when difficulty level belongs to different course', async () => {
      mockPrisma.courseDifficultyLevel.findUnique.mockResolvedValue({
        courseId: 'other',
      });
      const dto = {
        ...baseDto,
        type: QuestionTypeDto.essay,
      };
      await expect(service.create(dto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('updates an existing question', async () => {
      const existing = {
        id: 'q1',
        type: QuestionTypeDto.single_choice,
        options: ['A', 'B'],
        correctIndex: 0,
        skills: [QuestionSkillDto.grammar],
        deletedAt: null,
      };
      mockPrisma.question.findUnique.mockResolvedValue(existing);
      mockPrisma.question.update.mockResolvedValue({
        ...existing,
        content: 'updated',
      });

      await service.update('q1', { content: 'updated' }, actor);
      expect(mockPrisma.question.update).toHaveBeenCalled();
      expect(mockActionHistory.recordUpdate).toHaveBeenCalled();
    });

    it('JP: old question without skills must pick one when edited', async () => {
      const existing = {
        id: 'q1',
        type: QuestionTypeDto.essay,
        options: null,
        correctIndex: null,
        tfAnswerKey: [],
        skills: [],
        deletedAt: null,
      };
      mockPrisma.question.findUnique.mockResolvedValue(existing);
      mockPrisma.question.update.mockResolvedValue(existing);

      await expect(
        service.update('q1', { content: 'updated' }, actor),
      ).rejects.toThrow('Câu hỏi phải chọn ít nhất một kỹ năng.');
      await service.update(
        'q1',
        { content: 'updated', skills: [QuestionSkillDto.reading] },
        actor,
      );
      expect(mockPrisma.question.update).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException for missing question', async () => {
      mockPrisma.question.findUnique.mockResolvedValue(null);
      await expect(service.update('nonexistent', {}, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for soft-deleted question', async () => {
      mockPrisma.question.findUnique.mockResolvedValue({
        id: 'q1',
        deletedAt: new Date(),
      });
      await expect(service.update('q1', {}, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('validates options count on update for single_choice', async () => {
      const existing = {
        id: 'q1',
        type: QuestionTypeDto.single_choice,
        options: ['A', 'B'],
        correctIndex: 0,
        deletedAt: null,
      };
      mockPrisma.question.findUnique.mockResolvedValue(existing);

      await expect(
        service.update('q1', { options: ['only-one'] }, actor),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('soft-deletes a question', async () => {
      const q = { id: 'q1', deletedAt: null };
      mockPrisma.question.findUnique.mockResolvedValue(q);
      mockPrisma.questionLink.findMany.mockResolvedValue([]);
      mockPrisma.question.update.mockResolvedValue({
        ...q,
        deletedAt: new Date(),
      });

      await service.delete('q1', actor);
      const deletedAtMatcher = expect.any(Date) as unknown as Date;
      expect(mockPrisma.question.update).toHaveBeenCalledWith(
        contains({
          where: { id: 'q1' },
          data: contains({ deletedAt: deletedAtMatcher }),
        }),
      );
      expect(mockActionHistory.recordDelete).toHaveBeenCalled();
    });

    it('throws NotFoundException for missing question', async () => {
      mockPrisma.question.findUnique.mockResolvedValue(null);
      await expect(service.delete('nonexistent', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when question is linked to topics', async () => {
      mockPrisma.question.findUnique.mockResolvedValue({
        id: 'q1',
        deletedAt: null,
      });
      mockPrisma.questionLink.findMany.mockResolvedValue([
        { lessonId: 't1', questionId: 'q1' },
      ]);

      await expect(service.delete('q1', actor)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.question.update).not.toHaveBeenCalled();
    });
  });

  describe('bulkCreate', () => {
    const baseBulkDto = {
      courseId: 'c1',
      moduleId: 'ch1',
      questions: [
        {
          type: QuestionTypeDto.single_choice as const,
          content: '<p>Q1?</p>',
          options: ['A', 'B', 'C'],
          correctIndex: 1,
          difficultyLevelId: 'd1',
          skills: [QuestionSkillDto.reading],
        },
        {
          type: QuestionTypeDto.essay as const,
          content: '<p>Q2?</p>',
          difficultyLevelId: 'd1',
          skills: [QuestionSkillDto.reading],
        },
      ],
    };

    it('JP: rejects a bulk item without any skill', async () => {
      const dto = {
        ...baseBulkDto,
        questions: [{ ...baseBulkDto.questions[1], skills: undefined }],
      };

      await expect(service.bulkCreate(dto, actor)).rejects.toThrow(
        'Câu 1: Câu hỏi phải chọn ít nhất một kỹ năng.',
      );
      expect(mockPrisma.question.create).not.toHaveBeenCalled();
    });

    it('JP: saves every question type with its type-specific fields', async () => {
      const dto = {
        ...baseBulkDto,
        questions: [
          {
            type: QuestionTypeDto.true_false as const,
            content: '<p>日本の首都は東京です。</p>',
            tfAnswerKey: [true],
            tfLabelStyle: TrueFalseLabelStyleDto.dung_sai,
            difficultyLevelId: 'd1',
            skills: [QuestionSkillDto.reading],
          },
          {
            type: QuestionTypeDto.fill_blank as const,
            content: '<p>[[___]]に起きて、[[___]]に寝ます。</p>',
            blankAnswerKey: [['七時', '7時'], ['十一時']],
            difficultyLevelId: 'd1',
            skills: [QuestionSkillDto.grammar],
          },
          {
            type: QuestionTypeDto.ordering as const,
            content: '<p>正しい順に並べてください。</p>',
            options: ['わたしは', '毎朝', 'コーヒーを', '飲みます'],
            difficultyLevelId: 'd1',
            skills: [QuestionSkillDto.grammar],
          },
          {
            type: QuestionTypeDto.essay as const,
            content: '<p>名前を書いてください。</p>',
            essayInputSize: EssayInputSizeDto.short,
            difficultyLevelId: 'd1',
            skills: [QuestionSkillDto.writing],
          },
        ],
      };
      mockPrisma.question.create.mockResolvedValue({ id: 'q' });

      await service.bulkCreate(dto, actor);

      const data = mockPrisma.question.create.mock.calls.map(
        ([arg]: [{ data: Record<string, unknown> }]) => arg.data,
      );
      expect(data[0]).toMatchObject({
        tfAnswerKey: [true],
        tfLabelStyle: 'dung_sai',
      });
      expect(data[1]).toMatchObject({
        blankAnswerKey: [['七時', '7時'], ['十一時']],
      });
      expect(data[2]).toMatchObject({
        options: ['わたしは', '毎朝', 'コーヒーを', '飲みます'],
      });
      expect(data[3]).toMatchObject({ essayInputSize: 'short' });
    });

    it('rejects tfLabelStyle on a non true_false bulk item', async () => {
      const dto = {
        ...baseBulkDto,
        questions: [
          {
            ...baseBulkDto.questions[1],
            tfLabelStyle: TrueFalseLabelStyleDto.dung_sai,
          },
        ],
      };

      await expect(service.bulkCreate(dto, actor)).rejects.toThrow(
        'Câu 1: Chỉ Câu Đúng/Sai có kiểu nhãn.',
      );
      expect(mockPrisma.question.create).not.toHaveBeenCalled();
    });

    it('creates multiple questions in a transaction', async () => {
      mockPrisma.question.create
        .mockResolvedValueOnce({ id: 'q1', ...baseBulkDto.questions[0] })
        .mockResolvedValueOnce({ id: 'q2', ...baseBulkDto.questions[1] });

      const result = await service.bulkCreate(baseBulkDto, actor);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.question.create).toHaveBeenCalledTimes(2);
      expect(mockActionHistory.recordCreate).toHaveBeenCalledTimes(2);
      expect(result.count).toBe(2);
    });

    it('rejects when chapter belongs to different course', async () => {
      mockPrisma.module.findUnique.mockResolvedValue({ courseId: 'other' });

      await expect(service.bulkCreate(baseBulkDto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when difficulty level belongs to different course', async () => {
      mockPrisma.courseDifficultyLevel.findUnique.mockResolvedValue({
        courseId: 'other',
      });

      await expect(service.bulkCreate(baseBulkDto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects single_choice with correctIndex out of bounds', async () => {
      const dto = {
        ...baseBulkDto,
        questions: [
          {
            type: QuestionTypeDto.single_choice as const,
            content: '<p>Bad?</p>',
            options: ['A', 'B'],
            correctIndex: 5,
            difficultyLevelId: 'd1',
          },
        ],
      };

      await expect(service.bulkCreate(dto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects single_choice with < 2 options', async () => {
      const dto = {
        ...baseBulkDto,
        questions: [
          {
            type: QuestionTypeDto.single_choice as const,
            content: '<p>Bad?</p>',
            options: ['A'],
            correctIndex: 0,
            difficultyLevelId: 'd1',
          },
        ],
      };

      await expect(service.bulkCreate(dto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects single_choice with > 6 options', async () => {
      const dto = {
        ...baseBulkDto,
        questions: [
          {
            type: QuestionTypeDto.single_choice as const,
            content: '<p>Bad?</p>',
            options: ['1', '2', '3', '4', '5', '6', '7'],
            correctIndex: 0,
            difficultyLevelId: 'd1',
          },
        ],
      };

      await expect(service.bulkCreate(dto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects essay with options', async () => {
      const dto = {
        ...baseBulkDto,
        questions: [
          {
            type: QuestionTypeDto.essay as const,
            content: '<p>Bad?</p>',
            options: ['A', 'B'],
            difficultyLevelId: 'd1',
          },
        ],
      };

      await expect(service.bulkCreate(dto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty content', async () => {
      const dto = {
        ...baseBulkDto,
        questions: [
          {
            type: QuestionTypeDto.essay as const,
            content: '   ',
            difficultyLevelId: 'd1',
          },
        ],
      };

      await expect(service.bulkCreate(dto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
  describe('Bộ câu hỏi', () => {
    const dto = {
      courseId: 'c1',
      moduleId: 'ch1',
      difficultyLevelId: 'd1',
      content: '<p>Q</p>',
      skills: [QuestionSkillDto.listening],
      type: QuestionTypeDto.essay,
    };
    const inSet = {
      id: 'q1',
      courseId: 'c1',
      moduleId: 'ch1',
      type: QuestionTypeDto.essay,
      options: null,
      correctIndex: null,
      tfAnswerKey: [],
      skills: [QuestionSkillDto.listening],
      sharedMaterialId: 'set1',
      setPosition: 0,
      audioId: null,
      deletedAt: null,
    };

    beforeEach(() => {
      mockPrisma.sharedMaterial.findUnique.mockResolvedValue({
        courseId: 'c1',
        moduleId: 'ch1',
      });
      mockPrisma.question.aggregate.mockResolvedValue({
        _max: { setPosition: 2 },
      });
      mockPrisma.questionLink.findMany.mockResolvedValue([]);
      mockPrisma.lessonQuiz.findMany.mockResolvedValue([]);
    });

    it('câu mới vào bộ xếp cuối bộ', async () => {
      mockPrisma.question.create.mockResolvedValue({ id: 'q9' });
      await service.createInSet('set1', dto, actor);
      expect(mockPrisma.question.create).toHaveBeenCalledWith({
        data: contains({ sharedMaterialId: 'set1', setPosition: 3 }),
      });
    });

    it('câu mới vào bộ vào luôn mọi tiết đang dùng bộ, ngay sau câu cuối của bộ, trọng số 1', async () => {
      mockPrisma.question.create.mockResolvedValue({ id: 'q9' });
      // Tiết t1 có bộ ở order 3–4 (câu lẻ ở 5); tiết t2 có bộ ở order 0.
      mockPrisma.questionLink.findMany.mockResolvedValue([
        { lessonId: 't1', order: 3 },
        { lessonId: 't1', order: 4 },
        { lessonId: 't2', order: 0 },
      ]);

      await service.createInSet('set1', dto, actor);

      expect(mockPrisma.questionLink.updateMany).toHaveBeenCalledWith({
        where: { lessonId: 't1', order: { gt: 4 } },
        data: { order: { increment: 1 } },
      });
      expect(mockPrisma.questionLink.create).toHaveBeenCalledWith({
        data: { lessonId: 't1', questionId: 'q9', order: 5, points: null },
      });
      expect(mockPrisma.questionLink.create).toHaveBeenCalledWith({
        data: { lessonId: 't2', questionId: 'q9', order: 1, points: null },
      });
      // Lượt đã bắt đầu đọc snapshot attempt_answers — không bị đụng tới.
      expect(mockPrisma).not.toHaveProperty('attemptAnswer');
    });

    it('câu mới vào bộ vào luôn mọi bài ôn đang dùng bộ, ngay sau câu cuối của bộ', async () => {
      mockPrisma.question.create.mockResolvedValue({ id: 'q9' });
      mockPrisma.lessonQuiz.findMany.mockResolvedValue([
        { lessonId: 'l1', order: 0 },
        { lessonId: 'l1', order: 1 },
      ]);

      await service.createInSet('set1', dto, actor);

      expect(mockPrisma.lessonQuiz.updateMany).toHaveBeenCalledWith({
        where: { lessonId: 'l1', order: { gt: 1 } },
        data: { order: { increment: 1 } },
      });
      expect(mockPrisma.lessonQuiz.create).toHaveBeenCalledWith({
        data: { lessonId: 'l1', questionId: 'q9', order: 2 },
      });
    });

    it('câu lẻ mới không vào tiết nào', async () => {
      mockPrisma.question.create.mockResolvedValue({ id: 'q9' });
      await service.create(dto, actor);
      expect(mockPrisma.questionLink.create).not.toHaveBeenCalled();
    });

    it('xoá câu của bộ thì câu biến khỏi mọi tiết dùng bộ', async () => {
      mockPrisma.question.findUnique.mockResolvedValue(inSet);
      mockPrisma.questionLink.findMany.mockResolvedValue([
        { lessonId: 't1', questionId: 'q1' },
      ]);
      mockPrisma.question.update.mockResolvedValue(inSet);

      await service.delete('q1', actor);

      expect(mockPrisma.questionLink.deleteMany).toHaveBeenCalledWith({
        where: { questionId: 'q1' },
      });
      expect(mockPrisma.question.update).toHaveBeenCalled();
    });

    it('xoá câu của bộ thì câu biến khỏi mọi bài ôn dùng bộ', async () => {
      mockPrisma.question.findUnique.mockResolvedValue(inSet);
      mockPrisma.question.update.mockResolvedValue(inSet);

      await service.delete('q1', actor);

      expect(mockPrisma.lessonQuiz.deleteMany).toHaveBeenCalledWith({
        where: { questionId: 'q1' },
      });
    });

    it('câu tạo trong bộ nhận chuyên đề của bộ', async () => {
      mockPrisma.question.create.mockResolvedValue({ id: 'q9' });
      await service.createInSet('set1', { ...dto, moduleId: 'ch2' }, actor);
      expect(mockPrisma.question.create).toHaveBeenCalledWith({
        data: contains({ moduleId: 'ch1', sharedMaterialId: 'set1' }),
      });
    });

    it('tạo câu không gắn thẳng vào bộ được — phải qua luồng của bộ', async () => {
      await expect(
        service.create({ ...dto, sharedMaterialId: 'set1' }, actor),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.question.create).not.toHaveBeenCalled();
    });

    it('sửa câu không đổi bộ được — phải chuyển vào / ra bộ', async () => {
      mockPrisma.question.findUnique.mockResolvedValue(inSet);
      await expect(
        service.update('q1', { sharedMaterialId: null }, actor),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('q1', { sharedMaterialId: 'set2' }, actor),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.question.update).not.toHaveBeenCalled();
    });
  });

  describe('audio của câu', () => {
    const dto = {
      courseId: 'c1',
      moduleId: 'ch1',
      difficultyLevelId: 'd1',
      content: '<p>Q</p>',
      skills: [QuestionSkillDto.listening],
      type: QuestionTypeDto.essay,
      audioId: 'a1',
    };

    beforeEach(() => {
      mockPrisma.audioAsset.findUnique.mockResolvedValue({ courseId: 'c1' });
      mockPrisma.question.count.mockResolvedValue(0);
      mockPrisma.sharedMaterial.count.mockResolvedValue(0);
      mockPrisma.question.create.mockResolvedValue({ id: 'q9', audioId: 'a1' });
    });

    it('audio đã dùng ở câu khác → 400', async () => {
      mockPrisma.question.count.mockResolvedValue(1);
      await expect(service.create(dto, actor)).rejects.toThrow(
        'Audio đã dùng ở chỗ khác — tải bản mới.',
      );
      expect(mockPrisma.question.create).not.toHaveBeenCalled();
    });

    it('audio đã dùng ở phần đầu bộ → 400', async () => {
      mockPrisma.sharedMaterial.count.mockResolvedValue(1);
      await expect(service.create(dto, actor)).rejects.toThrow(
        'Audio đã dùng ở chỗ khác — tải bản mới.',
      );
    });

    it('audio mới tải chưa dùng ở đâu → gắn được', async () => {
      await service.create(dto, actor);
      expect(mockPrisma.question.create).toHaveBeenCalled();
    });
  });
});

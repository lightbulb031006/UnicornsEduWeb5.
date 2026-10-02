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
import { QuestionTypeDto } from 'src/dtos/question.dto';

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
    },
    questionLink: {
      findMany: jest.fn(),
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
      expect(result).toEqual(q);
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
    };

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
        },
        {
          type: QuestionTypeDto.essay as const,
          content: '<p>Q2?</p>',
          difficultyLevelId: 'd1',
        },
      ],
    };

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
});

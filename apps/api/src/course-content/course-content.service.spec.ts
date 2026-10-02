/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

jest.mock('../../generated/client', () => ({}));

jest.mock('../action-history/action-history.service', () => ({
  ActionHistoryService: class ActionHistoryServiceMock {},
}));

import { CourseContentService } from './course-content.service';
import { CourseAccessService } from '../class/course-access.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from 'generated/enums';

describe('CourseContentService — ClassContent methods', () => {
  let service: CourseContentService;
  let mockPrisma: Record<string, any>;

  const adminActor = {
    userId: 'user-admin-1',
    userEmail: 'admin@test.com',
    roleType: UserRole.admin,
  };

  beforeEach(() => {
    mockPrisma = {
      class: { findUnique: jest.fn() },
      staffInfo: { findFirst: jest.fn(), findUnique: jest.fn() },
      classTeacher: { findFirst: jest.fn() },
      courseLessonPlanMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      studentClass: { findFirst: jest.fn() },
      course: { findUnique: jest.fn() },
      module: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      lesson: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      classContentItem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      classTimelineItem: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(
        (fnOrArray: ((tx: any) => Promise<any>) | any[]) => {
          if (typeof fnOrArray === 'function') return fnOrArray(mockPrisma);
          return Promise.all(fnOrArray);
        },
      ),
    };

    service = new CourseContentService(
      mockPrisma as any,
      {} as any,
      new CourseAccessService(mockPrisma as any),
    );
  });

  // ─── createClassContentItem ───

  describe('createClassContentItem', () => {
    it('should create a new topic for class when no topicId provided', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.aggregate.mockResolvedValue({
        _max: { sortOrder: 1 },
      });
      mockPrisma.lesson.create.mockResolvedValue({
        id: 'topic-new',
        kind: 'theory',
        classId: 'cls-1',
        title: 'New topic',
      });
      mockPrisma.classContentItem.create.mockResolvedValue({
        id: 'cci-1',
        lessonId: 'topic-new',
        kind: 'lesson',
        sortOrder: 2,
        classId: 'cls-1',
        lesson: {
          title: 'New topic',
          kind: 'theory',
          classId: 'cls-1',
          module: null,
          quizzes: [],
        },
      });

      const result = await service.createClassContentItem(
        'cls-1',
        { title: 'New topic', kind: 'theory' as any },
        adminActor,
      );

      expect(result.title).toBe('New topic');
      expect(result.source).toBe('class');
      expect(mockPrisma.lesson.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            classId: 'cls-1',
            title: 'New topic',
          }),
        }),
      );
      expect(mockPrisma.classContentItem.create).toHaveBeenCalled();
    });

    it('should add an existing topic to class content', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 'topic-existing',
        title: 'Existing topic',
        kind: 'practice',
        courseId: 'course-1',
        classId: null,
      });
      mockPrisma.classContentItem.findUnique.mockResolvedValue(null);
      mockPrisma.classContentItem.aggregate.mockResolvedValue({
        _max: { sortOrder: 5 },
      });
      mockPrisma.classContentItem.create.mockResolvedValue({
        id: 'cci-2',
        lessonId: 'topic-existing',
        kind: 'lesson',
        sortOrder: 6,
        classId: 'cls-1',
        lesson: {
          title: 'Existing topic',
          kind: 'practice',
          classId: null,
          module: { title: 'Ch 1' },
          quizzes: [{ id: 'l1' }, { id: 'l2' }],
        },
      });

      const result = await service.createClassContentItem(
        'cls-1',
        {
          lessonId: 'topic-existing',
          openAt: '2026-09-07T13:00:00.000Z',
          durationMinutes: 60,
        },
        adminActor,
      );

      expect(result.title).toBe('Existing topic');
      expect(result.source).toBe('course');
      expect(result.moduleTitle).toBe('Ch 1');
      expect(mockPrisma.classContentItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lessonId: 'topic-existing',
            openAt: new Date('2026-09-07T13:00:00.000Z'),
            durationMinutes: 60,
          }),
        }),
      );
    });

    it('should throw if topicId already in class content', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: 'topic-1' });
      mockPrisma.classContentItem.findUnique.mockResolvedValue({
        id: 'existing',
      });

      await expect(
        service.createClassContentItem(
          'cls-1',
          { lessonId: 'topic-1' },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if title missing when creating new topic', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });

      await expect(
        service.createClassContentItem('cls-1', { title: '  ' }, adminActor),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject practice assignment without durationMinutes', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 'topic-practice',
        kind: 'practice',
      });
      mockPrisma.classContentItem.findUnique.mockResolvedValue(null);

      await expect(
        service.createClassContentItem(
          'cls-1',
          { lessonId: 'topic-practice' },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.classContentItem.create).not.toHaveBeenCalled();
    });

    it('defaults openAt to server now when practice is created without openAt', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 'topic-practice',
        kind: 'practice',
      });
      mockPrisma.classContentItem.findUnique.mockResolvedValue(null);
      mockPrisma.classContentItem.aggregate.mockResolvedValue({
        _max: { sortOrder: 0 },
      });
      mockPrisma.classContentItem.create.mockResolvedValue({
        id: 'cci-now',
        lessonId: 'topic-practice',
        kind: 'lesson',
        sortOrder: 1,
        classId: 'cls-1',
        openAt: new Date(),
        durationMinutes: 60,
        lesson: {
          title: 'Practice',
          kind: 'practice',
          classId: null,
          module: null,
          quizzes: [],
        },
      });

      const before = Date.now();
      await service.createClassContentItem(
        'cls-1',
        { lessonId: 'topic-practice', durationMinutes: 60 },
        adminActor,
      );
      const after = Date.now();

      const created = mockPrisma.classContentItem.create.mock.calls[0][0];
      expect(created.data.durationMinutes).toBe(60);
      expect(created.data.openAt).toBeInstanceOf(Date);
      expect(created.data.openAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(created.data.openAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('rejects durationMinutes of 0 on create', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 'topic-practice',
        kind: 'practice',
      });
      mockPrisma.classContentItem.findUnique.mockResolvedValue(null);

      await expect(
        service.createClassContentItem(
          'cls-1',
          { lessonId: 'topic-practice', durationMinutes: 0 },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.classContentItem.create).not.toHaveBeenCalled();
    });

    it('should not write schedule onto a theory topic row', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.aggregate.mockResolvedValue({
        _max: { sortOrder: 0 },
      });
      mockPrisma.lesson.create.mockResolvedValue({
        id: 'topic-theory',
        kind: 'theory',
        classId: 'cls-1',
        title: 'Theory',
      });
      mockPrisma.classContentItem.create.mockResolvedValue({
        id: 'cci-t',
        lessonId: 'topic-theory',
        kind: 'lesson',
        sortOrder: 1,
        classId: 'cls-1',
        openAt: null,
        durationMinutes: null,
        lesson: {
          title: 'Theory',
          kind: 'theory',
          classId: 'cls-1',
          module: null,
          quizzes: [],
        },
      });

      await service.createClassContentItem(
        'cls-1',
        {
          title: 'Theory',
          kind: 'theory' as any,
          openAt: '2026-09-07T13:00:00.000Z',
          durationMinutes: 60,
        },
        adminActor,
      );

      expect(mockPrisma.lesson.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            openAt: expect.anything(),
            durationMinutes: expect.anything(),
          }),
        }),
      );
      expect(mockPrisma.classContentItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            openAt: null,
            durationMinutes: null,
          }),
        }),
      );
    });

    it('runs create + timeline append inside one $transaction', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.lesson.create.mockResolvedValue({
        id: 'topic-new',
        kind: 'theory',
        classId: 'cls-1',
        title: 'New topic',
      });
      mockPrisma.classContentItem.aggregate.mockResolvedValue({
        _max: { sortOrder: -1 },
      });
      mockPrisma.classContentItem.create.mockResolvedValue({
        id: 'cci-1',
        lessonId: 'topic-new',
        kind: 'lesson',
        sortOrder: 0,
        classId: 'cls-1',
        lesson: {
          title: 'New topic',
          kind: 'theory',
          classId: 'cls-1',
          module: null,
          quizzes: [],
        },
      });

      await service.createClassContentItem(
        'cls-1',
        { title: 'New topic', kind: 'theory' as any },
        adminActor,
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
    });

    it('rolls back when timeline append fails mid-create — no leftover topic or content item', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'cls-1',
        timelineCustomOrder: false,
      });

      const committed = {
        topics: [] as unknown[],
        items: [] as unknown[],
        timeline: [] as unknown[],
      };

      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
          const staging = {
            topics: [] as unknown[],
            items: [] as unknown[],
            timeline: [] as unknown[],
          };
          const tx = {
            lesson: {
              create: jest.fn(async (args: { data: { title: string } }) => {
                const row = {
                  id: 'topic-new',
                  kind: 'theory',
                  classId: 'cls-1',
                  title: args.data.title,
                };
                staging.topics.push(row);
                return row;
              }),
            },
            classContentItem: {
              aggregate: jest.fn().mockResolvedValue({
                _max: { sortOrder: -1 },
              }),
              create: jest.fn(async (args: { data: Record<string, unknown> }) => {
                const row = {
                  id: 'cci-orphan',
                  ...args.data,
                  lesson: {
                    title: 'New topic',
                    kind: 'theory',
                    classId: 'cls-1',
                    module: null,
                    quizzes: [],
                  },
                };
                staging.items.push(row);
                return row;
              }),
              findUnique: jest.fn().mockResolvedValue(null),
            },
            class: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'cls-1',
                timelineCustomOrder: false,
              }),
            },
            classTimelineItem: {
              aggregate: jest
                .fn()
                .mockResolvedValue({ _max: { sortOrder: -1 } }),
              create: jest.fn(async () => {
                throw new Error('timeline write failed');
              }),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
            },
          };
          try {
            const result = await fn(tx);
            committed.topics = staging.topics;
            committed.items = staging.items;
            committed.timeline = staging.timeline;
            return result;
          } catch (error) {
            throw error;
          }
        },
      );

      await expect(
        service.createClassContentItem(
          'cls-1',
          { title: 'New topic', kind: 'theory' as any },
          adminActor,
        ),
      ).rejects.toThrow('timeline write failed');

      expect(committed.topics).toHaveLength(0);
      expect(committed.items).toHaveLength(0);
      expect(committed.timeline).toHaveLength(0);
    });
  });

  // ─── listClassContentItems ───

  describe('listClassContentItems', () => {
    it('should return mapped DTOs', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.findMany.mockResolvedValue([
        {
          id: 'cci-1',
          lessonId: 't1',
          kind: 'lesson',
          sortOrder: 0,
          classId: 'cls-1',
          lesson: {
            title: 'Topic A',
            kind: 'theory',
            classId: 'cls-1',
            module: null,
            quizzes: [],
          },
        },
        {
          id: 'cci-2',
          lessonId: 't2',
          kind: 'lesson',
          sortOrder: 1,
          classId: 'cls-1',
          lesson: {
            title: 'Topic B',
            kind: 'practice',
            classId: 'course-1',
            module: { title: 'Ch 2' },
            quizzes: [{}],
          },
        },
      ]);

      const result = await service.listClassContentItems('cls-1', adminActor);

      expect(result).toHaveLength(2);
      expect(result[0].source).toBe('class');
      expect(result[0].kindLabel).toBe('Tiết lý thuyết');
      expect(result[1].source).toBe('course');
      expect(result[1].kindLabel).toBe('Tiết thực hành');
      expect(result[1].moduleTitle).toBe('Ch 2');
    });
  });

  // ─── reorderClassContentItems ───

  describe('reorderClassContentItems', () => {
    it('should reject if any ID does not belong to class', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.findMany.mockResolvedValue([{ id: 'cci-1' }]);

      await expect(
        service.reorderClassContentItems(
          'cls-1',
          ['cci-1', 'cci-foreign'],
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update sortOrder for all owned IDs', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.findMany
        .mockResolvedValueOnce([{ id: 'cci-1' }, { id: 'cci-2' }])
        .mockResolvedValueOnce([
          {
            id: 'cci-1',
            lessonId: 't1',
            kind: 'lesson',
            sortOrder: 0,
            classId: 'cls-1',
            lesson: {
              title: 'A',
              kind: 'theory',
              classId: 'cls-1',
              module: null,
              quizzes: [],
            },
          },
          {
            id: 'cci-2',
            lessonId: 't2',
            kind: 'lesson',
            sortOrder: 1,
            classId: 'cls-1',
            lesson: {
              title: 'B',
              kind: 'theory',
              classId: 'cls-1',
              module: null,
              quizzes: [],
            },
          },
        ]);
      mockPrisma.classContentItem.update.mockResolvedValue({});

      await service.reorderClassContentItems(
        'cls-1',
        ['cci-2', 'cci-1'],
        adminActor,
      );

      expect(mockPrisma.classContentItem.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.classContentItem.update).toHaveBeenCalledWith({
        where: { id: 'cci-2' },
        data: { sortOrder: 0 },
      });
      expect(mockPrisma.classContentItem.update).toHaveBeenCalledWith({
        where: { id: 'cci-1' },
        data: { sortOrder: 1 },
      });
    });
  });

  // ─── deleteClassContentItem ───

  describe('deleteClassContentItem', () => {
    it('hides the class content item and timeline row without deleting topic or attempts', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.findUnique.mockResolvedValue({
        id: 'cci-1',
        classId: 'cls-1',
        hiddenAt: null,
      });
      mockPrisma.classContentItem.update.mockResolvedValue({});
      mockPrisma.classTimelineItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.classContentItem.findMany.mockResolvedValue([]);

      await service.deleteClassContentItem('cls-1', 'cci-1', adminActor);

      expect(mockPrisma.classContentItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cci-1' },
          data: expect.objectContaining({
            hiddenByStaffId: 'staff-1',
          }),
        }),
      );
      expect(mockPrisma.classTimelineItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { classContentItemId: 'cci-1' },
        }),
      );
      expect(mockPrisma.classContentItem.delete).not.toHaveBeenCalled();
      expect(mockPrisma.lesson.delete).not.toHaveBeenCalled();
    });

    it('does not delete a course topic when hiding', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.findUnique.mockResolvedValue({
        id: 'cci-2',
        classId: 'cls-1',
        hiddenAt: null,
      });
      mockPrisma.classContentItem.update.mockResolvedValue({});
      mockPrisma.classTimelineItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.classContentItem.findMany.mockResolvedValue([]);

      await service.deleteClassContentItem('cls-1', 'cci-2', adminActor);

      expect(mockPrisma.lesson.delete).not.toHaveBeenCalled();
    });

    it('should throw if item not found or belongs to different class', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteClassContentItem('cls-1', 'cci-missing', adminActor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('restoreClassContentItem', () => {
    it('clears hidden flags on content and timeline', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.findUnique.mockResolvedValue({
        id: 'cci-1',
        classId: 'cls-1',
        hiddenAt: new Date(),
      });
      mockPrisma.classContentItem.update.mockResolvedValue({});
      mockPrisma.classTimelineItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.classContentItem.findMany.mockResolvedValue([]);

      await service.restoreClassContentItem('cls-1', 'cci-1', adminActor);

      expect(mockPrisma.classContentItem.update).toHaveBeenCalledWith({
        where: { id: 'cci-1' },
        data: { hiddenAt: null, hiddenByStaffId: null },
      });
      expect(mockPrisma.classTimelineItem.updateMany).toHaveBeenCalledWith({
        where: { classContentItemId: 'cci-1' },
        data: { hiddenAt: null, hiddenByStaffId: null },
      });
    });
  });

  describe('updateClassContentSchedule', () => {
    it('updates openAt/durationMinutes on this class only, not the topic', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.findUnique.mockResolvedValue({
        id: 'cci-a',
        classId: 'cls-1',
        lessonId: 'shared-topic',
        lesson: {
          kind: 'practice',
          title: 'Đề chung',
          classId: null,
          module: null,
          quizzes: [],
        },
      });
      mockPrisma.classContentItem.update.mockResolvedValue({
        id: 'cci-a',
        classId: 'cls-1',
        lessonId: 'shared-topic',
        kind: 'lesson',
        sortOrder: 0,
        openAt: new Date('2026-09-08T10:00:00.000Z'),
        durationMinutes: 90,
        lesson: {
          kind: 'practice',
          title: 'Đề chung',
          classId: null,
          module: null,
          quizzes: [],
        },
      });

      const result = await service.updateClassContentSchedule(
        'cls-1',
        'cci-a',
        { openAt: '2026-09-08T10:00:00.000Z', durationMinutes: 90 },
        adminActor,
      );

      expect(result.openAt).toEqual(new Date('2026-09-08T10:00:00.000Z'));
      expect(result.durationMinutes).toBe(90);
      expect(mockPrisma.lesson.update).not.toHaveBeenCalled();
      expect(mockPrisma.classContentItem.update).toHaveBeenCalledWith({
        where: { id: 'cci-a' },
        data: {
          openAt: new Date('2026-09-08T10:00:00.000Z'),
          durationMinutes: 90,
        },
        include: { lesson: { include: { module: true } } },
      });
    });

    it('rejects durationMinutes of 0', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.findUnique.mockResolvedValue({
        id: 'cci-a',
        classId: 'cls-1',
        lesson: { kind: 'practice', title: 'Đề chung', classId: null },
      });

      await expect(
        service.updateClassContentSchedule(
          'cls-1',
          'cci-a',
          { openAt: '2026-09-08T10:07:00.000Z', durationMinutes: 0 },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.classContentItem.update).not.toHaveBeenCalled();
    });

    it('requires openAt on schedule update', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.findUnique.mockResolvedValue({
        id: 'cci-a',
        classId: 'cls-1',
        lesson: { kind: 'practice', title: 'Đề chung', classId: null },
      });

      await expect(
        service.updateClassContentSchedule(
          'cls-1',
          'cci-a',
          { durationMinutes: 45 } as any,
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.classContentItem.update).not.toHaveBeenCalled();
    });

    it('preserves off-grid openAt minutes such as 10:07', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.findUnique.mockResolvedValue({
        id: 'cci-a',
        classId: 'cls-1',
        lessonId: 'shared-topic',
        lesson: {
          kind: 'practice',
          title: 'Đề chung',
          classId: null,
          module: null,
          quizzes: [],
        },
      });
      mockPrisma.classContentItem.update.mockResolvedValue({
        id: 'cci-a',
        classId: 'cls-1',
        lessonId: 'shared-topic',
        kind: 'lesson',
        sortOrder: 0,
        openAt: new Date('2026-09-08T10:07:00.000Z'),
        durationMinutes: 45,
        lesson: {
          kind: 'practice',
          title: 'Đề chung',
          classId: null,
          module: null,
          quizzes: [],
        },
      });

      await service.updateClassContentSchedule(
        'cls-1',
        'cci-a',
        { openAt: '2026-09-08T10:07:00.000Z', durationMinutes: 45 },
        adminActor,
      );

      expect(mockPrisma.classContentItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            openAt: new Date('2026-09-08T10:07:00.000Z'),
            durationMinutes: 45,
          },
        }),
      );
    });

    it('rejects schedule updates on theory content', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.classContentItem.findUnique.mockResolvedValue({
        id: 'cci-t',
        classId: 'cls-1',
        lesson: { kind: 'theory', title: 'LT', classId: 'cls-1' },
      });

      await expect(
        service.updateClassContentSchedule(
          'cls-1',
          'cci-t',
          { openAt: '2026-09-08T10:00:00.000Z', durationMinutes: 45 },
          adminActor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.classContentItem.update).not.toHaveBeenCalled();
    });
  });

  describe('getAssignedLessonForStudent', () => {
    it('blocks practice before openAt', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.studentClass.findFirst.mockResolvedValue({
        id: 'sc-1',
        class: { contentAccessExpiresAt: null },
      });
      mockPrisma.classContentItem.findUnique.mockResolvedValue({
        lesson: { id: 't-practice', kind: 'practice', title: 'Đề' },
        openAt: new Date(Date.now() + 60 * 60 * 1000),
        durationMinutes: 60,
      });

      await expect(
        service.getAssignedLessonForStudent('cls-1', 't-practice', 'stu-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns 404 when the lần giao is hidden', async () => {
      mockPrisma.studentClass.findFirst.mockResolvedValue({
        id: 'sc-1',
        class: { contentAccessExpiresAt: null },
      });
      mockPrisma.classContentItem.findUnique.mockResolvedValue({
        lesson: { id: 't-practice', kind: 'practice', title: 'Đề' },
        openAt: new Date(Date.now() - 60 * 60 * 1000),
        hiddenAt: new Date(),
      });

      await expect(
        service.getAssignedLessonForStudent('cls-1', 't-practice', 'stu-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows practice after openAt', async () => {
      const lesson = { id: 't-practice', kind: 'practice', title: 'Đề' };
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'cls-1' });
      mockPrisma.studentClass.findFirst.mockResolvedValue({
        id: 'sc-1',
        class: { contentAccessExpiresAt: null },
      });
      mockPrisma.classContentItem.findUnique.mockResolvedValue({
        lesson,
        openAt: new Date(Date.now() - 60 * 1000),
        durationMinutes: 60,
      });

      const result = await service.getAssignedLessonForStudent(
        'cls-1',
        't-practice',
        'stu-1',
      );
      expect(result.id).toBe('t-practice');
    });
  });

  describe('getPracticeAssignmentForStudent', () => {
    it('reuses openAt block', async () => {
      mockPrisma.studentClass.findFirst.mockResolvedValue({
        id: 'sc-1',
        class: { contentAccessExpiresAt: null },
      });
      mockPrisma.classContentItem.findFirst.mockResolvedValue({
        id: 'cci-1',
        lessonId: 't-practice',
        durationMinutes: 60,
        openAt: new Date(Date.now() + 60 * 60 * 1000),
        lesson: { id: 't-practice', kind: 'practice', title: 'Đề' },
      });

      await expect(
        service.getPracticeAssignmentForStudent('cls-1', 'cci-1', 'stu-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects theory assignments', async () => {
      mockPrisma.studentClass.findFirst.mockResolvedValue({
        id: 'sc-1',
        class: { contentAccessExpiresAt: null },
      });
      mockPrisma.classContentItem.findFirst.mockResolvedValue({
        id: 'cci-1',
        lessonId: 't-th',
        durationMinutes: null,
        openAt: null,
        lesson: { id: 't-th', kind: 'theory', title: 'LT' },
      });

      await expect(
        service.getPracticeAssignmentForStudent('cls-1', 'cci-1', 'stu-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── listClassContentForStudent ───

  describe('listClassContentForStudent', () => {
    it('should return content for enrolled student', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'cls-1',
        contentAccessExpiresAt: null,
      });
      mockPrisma.studentClass.findFirst.mockResolvedValue({ id: 'sc-1' });
      mockPrisma.classContentItem.findMany.mockResolvedValue([
        {
          id: 'cci-1',
          lessonId: 't1',
          kind: 'lesson',
          sortOrder: 0,
          classId: 'cls-1',
          lesson: {
            title: 'Topic A',
            kind: 'theory',
            classId: 'cls-1',
            module: null,
            quizzes: [],
          },
        },
      ]);

      const result = await service.listClassContentForStudent('cls-1', 'stu-1');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Topic A');
      expect(result[0].isOpen).toBe(true);
      expect(mockPrisma.classContentItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { classId: 'cls-1', hiddenAt: null },
        }),
      );
    });

    it('marks locked practice assignments as not open without hiding them', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'cls-1',
        contentAccessExpiresAt: null,
      });
      mockPrisma.studentClass.findFirst.mockResolvedValue({ id: 'sc-1' });
      mockPrisma.classContentItem.findMany.mockResolvedValue([
        {
          id: 'cci-p',
          lessonId: 't-p',
          kind: 'lesson',
          sortOrder: 0,
          classId: 'cls-1',
          openAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          durationMinutes: 45,
          lesson: {
            title: 'Đề khóa',
            kind: 'practice',
            classId: null,
            module: null,
            quizzes: [],
          },
        },
      ]);

      const result = await service.listClassContentForStudent('cls-1', 'stu-1');
      expect(result[0].isOpen).toBe(false);
      expect(result[0].durationMinutes).toBe(45);
    });

    it('should throw if not enrolled', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'cls-1',
        contentAccessExpiresAt: null,
      });
      mockPrisma.studentClass.findFirst.mockResolvedValue(null);

      await expect(
        service.listClassContentForStudent('cls-1', 'stu-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if class content access expired', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'cls-1',
        contentAccessExpiresAt: new Date('2020-01-01'),
      });
      mockPrisma.studentClass.findFirst.mockResolvedValue({ id: 'sc-1' });

      await expect(
        service.listClassContentForStudent('cls-1', 'stu-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── QuestionLink CRUD (Practice Topic / Đề) ───

  describe('QuestionLink CRUD', () => {
    const practiceTopic = {
      id: 'topic-practice-1',
      kind: 'practice',
      courseId: 'course-1',
      moduleId: 'ch-1',
      classId: null,
      title: 'Đề thi thử',
    };

    const theoryTopic = {
      id: 'topic-theory-1',
      kind: 'theory',
      courseId: 'course-1',
      moduleId: 'ch-1',
      classId: null,
      title: 'Chuyên đề lý thuyết',
    };

    const mockQuestion = {
      id: 'q-1',
      courseId: 'course-1',
      moduleId: 'ch-1',
      difficultyLevelId: 'dl-1',
      type: 'single_choice',
      content: 'Câu hỏi test',
      options: ['A', 'B', 'C'],
      correctIndex: 0,
      explanation: null,
      answerGuide: null,
      deletedAt: null,
    };

    const mockLink = {
      id: 'link-1',
      lessonId: 'topic-practice-1',
      questionId: 'q-1',
      order: 0,
      points: 10,
      question: mockQuestion,
    };

    beforeEach(() => {
      mockPrisma.questionLink = {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      };
      mockPrisma.question = {
        findUnique: jest.fn(),
      };
    });

    // ─── getQuestionsByLessonId ───

    describe('getQuestionsByLessonId', () => {
      it('should return questions for a practice topic', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.questionLink.findMany.mockResolvedValue([mockLink]);

        const result = await service.getQuestionsByLessonId(
          'topic-practice-1',
          adminActor,
        );

        expect(result).toHaveLength(1);
        expect(result[0].questionId).toBe('q-1');
        expect(result[0].points).toBe(10);
      });

      it('should throw if topic not found', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(null);

        await expect(
          service.getQuestionsByLessonId('topic-missing', adminActor),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw if topic is not practice', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(theoryTopic);

        await expect(
          service.getQuestionsByLessonId('topic-theory-1', adminActor),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw if topic has no courseId and no classId', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue({
          ...practiceTopic,
          courseId: null,
          classId: null,
        });

        await expect(
          service.getQuestionsByLessonId('topic-practice-1', adminActor),
        ).rejects.toThrow(BadRequestException);
      });

      it('should resolve course from class for class-owned practice topics', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue({
          ...practiceTopic,
          courseId: null,
          classId: 'cls-1',
        });
        mockPrisma.class.findUnique.mockResolvedValue({ courseId: 'course-1' });
        mockPrisma.questionLink.findMany.mockResolvedValue([mockLink]);

        const result = await service.getQuestionsByLessonId(
          'topic-class-1',
          adminActor,
        );
        expect(result).toHaveLength(1);
        expect(mockPrisma.class.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'cls-1' } }),
        );
      });
    });

    // ─── addQuestionToLesson ───

    describe('addQuestionToLesson', () => {
      it('should link a question to a practice topic', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);
        mockPrisma.questionLink.findUnique.mockResolvedValue(null);
        mockPrisma.questionLink.aggregate.mockResolvedValue({
          _max: { order: 1 },
        });
        mockPrisma.questionLink.create.mockResolvedValue(mockLink);

        const result = await service.addQuestionToLesson(
          'topic-practice-1',
          { questionId: 'q-1', points: 10 },
          adminActor,
        );

        expect(result.questionId).toBe('q-1');
        expect(result.points).toBe(10);
        expect(mockPrisma.questionLink.create).toHaveBeenCalled();
      });

      it('should link a question onto a class-owned practice topic via the class course', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue({
          ...practiceTopic,
          courseId: null,
          classId: 'cls-1',
        });
        mockPrisma.class.findUnique.mockResolvedValue({
          id: 'cls-1',
          courseId: 'course-1',
        });
        mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);
        mockPrisma.questionLink.findUnique.mockResolvedValue(null);
        mockPrisma.questionLink.aggregate.mockResolvedValue({
          _max: { order: 0 },
        });
        mockPrisma.questionLink.create.mockResolvedValue(mockLink);

        const result = await service.addQuestionToLesson(
          'topic-class-1',
          { questionId: 'q-1', points: 10 },
          adminActor,
        );

        expect(result.questionId).toBe('q-1');
      });

      it('should forbid a teacher from linking questions onto a course-level đề', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.staffInfo.findUnique.mockResolvedValue({
          id: 'staff-1',
          roles: ['teacher'],
        });
        mockPrisma.courseLessonPlanMember.findUnique.mockResolvedValue(null);

        await expect(
          service.addQuestionToLesson(
            'topic-practice-1',
            { questionId: 'q-1' },
            {
              userId: 'user-teacher',
              userEmail: 't@test.com',
              roleType: UserRole.staff,
            },
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw if question not found', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.question.findUnique.mockResolvedValue(null);

        await expect(
          service.addQuestionToLesson(
            'topic-practice-1',
            { questionId: 'q-missing' },
            adminActor,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw if question is soft-deleted', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.question.findUnique.mockResolvedValue({
          ...mockQuestion,
          deletedAt: new Date(),
        });

        await expect(
          service.addQuestionToLesson(
            'topic-practice-1',
            { questionId: 'q-1' },
            adminActor,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw if question belongs to different course', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.question.findUnique.mockResolvedValue({
          ...mockQuestion,
          courseId: 'course-999',
        });

        await expect(
          service.addQuestionToLesson(
            'topic-practice-1',
            { questionId: 'q-1' },
            adminActor,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw if question already linked', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);
        mockPrisma.questionLink.findUnique.mockResolvedValue(mockLink);

        await expect(
          service.addQuestionToLesson(
            'topic-practice-1',
            { questionId: 'q-1' },
            adminActor,
          ),
        ).rejects.toThrow(BadRequestException);
      });
    });

    // ─── updateQuestionLink ───

    describe('updateQuestionLink', () => {
      it('should update order and points', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.questionLink.findUnique.mockResolvedValue(mockLink);
        mockPrisma.questionLink.update.mockResolvedValue({
          ...mockLink,
          points: 20,
          order: 3,
        });

        const result = await service.updateQuestionLink(
          'topic-practice-1',
          'link-1',
          { points: 20, order: 3 },
          adminActor,
        );

        expect(result.points).toBe(20);
        expect(result.order).toBe(3);
      });

      it('should throw if link not found', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.questionLink.findUnique.mockResolvedValue(null);

        await expect(
          service.updateQuestionLink(
            'topic-practice-1',
            'link-missing',
            { points: 20 },
            adminActor,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw if link belongs to different topic', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.questionLink.findUnique.mockResolvedValue({
          ...mockLink,
          lessonId: 'topic-other',
        });

        await expect(
          service.updateQuestionLink(
            'topic-practice-1',
            'link-1',
            { points: 20 },
            adminActor,
          ),
        ).rejects.toThrow(NotFoundException);
      });
    });

    // ─── removeQuestionFromLesson ───

    describe('removeQuestionFromLesson', () => {
      it('should delete the link', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.questionLink.findUnique.mockResolvedValue(mockLink);
        mockPrisma.questionLink.delete.mockResolvedValue({});

        await service.removeQuestionFromLesson(
          'topic-practice-1',
          'link-1',
          adminActor,
        );

        expect(mockPrisma.questionLink.delete).toHaveBeenCalledWith({
          where: { id: 'link-1' },
        });
      });

      it('should throw if link not found', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.questionLink.findUnique.mockResolvedValue(null);

        await expect(
          service.removeQuestionFromLesson(
            'topic-practice-1',
            'link-missing',
            adminActor,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw if link belongs to different topic', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.questionLink.findUnique.mockResolvedValue({
          ...mockLink,
          lessonId: 'topic-other',
        });

        await expect(
          service.removeQuestionFromLesson(
            'topic-practice-1',
            'link-1',
            adminActor,
          ),
        ).rejects.toThrow(NotFoundException);
      });
    });

    // ─── reorderQuestionLinks ───

    describe('reorderQuestionLinks', () => {
      it('should update sortOrder for all owned IDs', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.questionLink.findMany
          .mockResolvedValueOnce([{ id: 'link-1' }, { id: 'link-2' }])
          .mockResolvedValueOnce([]);
        mockPrisma.questionLink.update.mockResolvedValue({});

        await service.reorderQuestionLinks(
          'topic-practice-1',
          ['link-2', 'link-1'],
          adminActor,
        );

        expect(mockPrisma.questionLink.update).toHaveBeenCalledTimes(2);
        expect(mockPrisma.questionLink.update).toHaveBeenCalledWith({
          where: { id: 'link-2' },
          data: { order: 0 },
        });
        expect(mockPrisma.questionLink.update).toHaveBeenCalledWith({
          where: { id: 'link-1' },
          data: { order: 1 },
        });
      });

      it('should throw if any ID does not belong to topic', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.questionLink.findMany.mockResolvedValue([{ id: 'link-1' }]);

        await expect(
          service.reorderQuestionLinks(
            'topic-practice-1',
            ['link-1', 'link-foreign'],
            adminActor,
          ),
        ).rejects.toThrow(BadRequestException);
      });
    });

    // ─── getQuestionLinkSummary ───

    describe('getQuestionLinkSummary', () => {
      it('should return total questions and points', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.questionLink.aggregate.mockResolvedValue({
          _count: { id: 3 },
          _sum: { points: 30 },
        });

        const result = await service.getQuestionLinkSummary('topic-practice-1');

        expect(result.totalQuestions).toBe(3);
        expect(result.totalPoints).toBe(30);
      });

      it('should return 0 points when no questions linked', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(practiceTopic);
        mockPrisma.questionLink.aggregate.mockResolvedValue({
          _count: { id: 0 },
          _sum: { points: null },
        });

        const result = await service.getQuestionLinkSummary('topic-practice-1');

        expect(result.totalQuestions).toBe(0);
        expect(result.totalPoints).toBe(0);
      });
    });

    // ─── isLessonAssignedToClass ───

    describe('isLessonAssignedToClass', () => {
      it('should return true when topic is in class content', async () => {
        mockPrisma.classContentItem.count.mockResolvedValue(2);

        const result = await service.isLessonAssignedToClass('topic-practice-1');

        expect(result).toBe(true);
      });

      it('should return false when topic is not in any class', async () => {
        mockPrisma.classContentItem.count.mockResolvedValue(0);

        const result = await service.isLessonAssignedToClass('topic-practice-1');

        expect(result).toBe(false);
      });
    });
  });

  describe('Lecture Quiz', () => {
    let quizService: CourseContentService;
    let mockActionHistory: Record<string, any>;

    const adminActor = {
      userId: 'user-admin-1',
      userEmail: 'admin@test.com',
      roleType: UserRole.admin,
    };

    const mockLecture = {
      id: 'lecture-1',
      kind: 'theory',
      courseId: 'course-1',
      classId: null,
      title: 'Bài học 1',
      videoUrl: null,
      content: null,
    };

    const mockQuestion = {
      id: 'q-1',
      courseId: 'course-1',
      type: 'single_choice',
      content: 'Câu hỏi test',
      options: ['A', 'B', 'C'],
      correctIndex: 0,
      explanation: null,
      answerGuide: null,
      deletedAt: null,
    };

    const mockQuizLink = {
      id: 'quiz-1',
      lessonId: 'lecture-1',
      questionId: 'q-1',
      order: 0,
      question: mockQuestion,
    };

    beforeEach(() => {
      mockPrisma.lesson = {
        findUnique: jest.fn(),
      };
      mockPrisma.question = {
        findMany: jest.fn(),
      };
      mockPrisma.lessonQuiz = {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      };
      mockPrisma.lessonQuizAnswer = {
        upsert: jest.fn(),
        findMany: jest.fn(),
      };
      mockActionHistory = {
        recordCreate: jest.fn().mockResolvedValue(undefined),
        recordDelete: jest.fn().mockResolvedValue(undefined),
      };
      quizService = new CourseContentService(
        mockPrisma as any,
        mockActionHistory as any,
        new CourseAccessService(mockPrisma as any),
      );
    });

    describe('linkQuizQuestions', () => {
      it('should link questions not already linked and record audit history', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(mockLecture);
        mockPrisma.question.findMany.mockResolvedValue([mockQuestion]);
        mockPrisma.lessonQuiz.aggregate.mockResolvedValue({
          _max: { order: null },
        });
        mockPrisma.lessonQuiz.findUnique.mockResolvedValue(null);
        mockPrisma.lessonQuiz.create.mockResolvedValue(mockQuizLink);

        await quizService.linkQuizQuestions('lecture-1', ['q-1'], adminActor);

        expect(mockPrisma.lessonQuiz.create).toHaveBeenCalledWith({
          data: { lessonId: 'lecture-1', questionId: 'q-1', order: 0 },
        });
        expect(mockActionHistory.recordCreate).toHaveBeenCalledTimes(1);
      });

      it('should throw if lecture not found', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(null);

        await expect(
          quizService.linkQuizQuestions('lecture-missing', ['q-1'], adminActor),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw if some questions do not belong to lecture course', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(mockLecture);
        mockPrisma.question.findMany.mockResolvedValue([]);

        await expect(
          quizService.linkQuizQuestions('lecture-1', ['q-foreign'], adminActor),
        ).rejects.toThrow(BadRequestException);
      });

      it('should skip questions already linked without creating duplicates', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(mockLecture);
        mockPrisma.question.findMany.mockResolvedValue([mockQuestion]);
        mockPrisma.lessonQuiz.aggregate.mockResolvedValue({
          _max: { order: 0 },
        });
        mockPrisma.lessonQuiz.findUnique.mockResolvedValue(mockQuizLink);

        await quizService.linkQuizQuestions('lecture-1', ['q-1'], adminActor);

        expect(mockPrisma.lessonQuiz.create).not.toHaveBeenCalled();
      });
    });

    describe('unlinkQuizQuestion', () => {
      it('should delete the link and record audit history', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(mockLecture);
        mockPrisma.lessonQuiz.findUnique.mockResolvedValue(mockQuizLink);
        mockPrisma.lessonQuiz.delete.mockResolvedValue({});

        await quizService.unlinkQuizQuestion('lecture-1', 'q-1', adminActor);

        expect(mockPrisma.lessonQuiz.delete).toHaveBeenCalledWith({
          where: {
            lessonId_questionId: { lessonId: 'lecture-1', questionId: 'q-1' },
          },
        });
        expect(mockActionHistory.recordDelete).toHaveBeenCalledTimes(1);
      });

      it('should throw if link not found', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(mockLecture);
        mockPrisma.lessonQuiz.findUnique.mockResolvedValue(null);

        await expect(
          quizService.unlinkQuizQuestion('lecture-1', 'q-missing', adminActor),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('submitQuizAnswers', () => {
      it('should upsert answers and return them with correctIndex for review', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(mockLecture);
        mockPrisma.lessonQuiz.findMany.mockResolvedValue([
          { questionId: 'q-1' },
        ]);
        mockPrisma.lessonQuizAnswer.upsert.mockResolvedValue({});
        mockPrisma.lessonQuizAnswer.findMany.mockResolvedValue([
          {
            id: 'ans-1',
            questionId: 'q-1',
            choiceIndex: 0,
            question: mockQuestion,
          },
        ]);

        const result = await quizService.submitQuizAnswers(
          'lecture-1',
          'student-1',
          [{ questionId: 'q-1', choiceIndex: 0, essayAnswer: null }],
        );

        expect(mockPrisma.lessonQuizAnswer.upsert).toHaveBeenCalledTimes(1);
        expect(result).toHaveLength(1);
        expect(result[0].question.correctIndex).toBe(0);
      });

      it('should throw if answer references a question not linked to the lecture', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(mockLecture);
        mockPrisma.lessonQuiz.findMany.mockResolvedValue([
          { questionId: 'q-1' },
        ]);

        await expect(
          quizService.submitQuizAnswers('lecture-1', 'student-1', [
            { questionId: 'q-foreign', choiceIndex: 0 },
          ]),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('getQuizAnswers', () => {
      it('should return saved answers for the student', async () => {
        mockPrisma.lessonQuizAnswer.findMany.mockResolvedValue([
          {
            id: 'ans-1',
            questionId: 'q-1',
            choiceIndex: 0,
            question: mockQuestion,
          },
        ]);

        const result = await quizService.getQuizAnswers(
          'lecture-1',
          'student-1',
        );

        expect(result).toHaveLength(1);
        expect(mockPrisma.lessonQuizAnswer.findMany).toHaveBeenCalledWith({
          where: { lessonId: 'lecture-1', studentId: 'student-1' },
          include: expect.any(Object),
        });
      });
    });
  });

  describe('Exam Library', () => {
    // Đề thi là practice topic *nằm trong chương* của khoá — CHECK constraint
    // `topics_owner_check` cấm topic cấp khoá có chapter_id NULL.
    const examTopic = {
      id: 'exam-1',
      kind: 'practice',
      courseId: 'course-1',
      moduleId: 'ch-1',
      classId: null,
      title: 'Đề thi thư viện',
    };

    const examRow = {
      ...examTopic,
      module: { id: 'ch-1', title: 'Chương 1', sortOrder: 0 },
      _count: { questionLinks: 15 },
    };

    const otherCourseTopic = {
      ...examTopic,
      id: 'exam-other',
      courseId: 'course-2',
    };

    beforeEach(() => {
      mockPrisma.course = { findUnique: jest.fn() };
      mockPrisma.module = { findUnique: jest.fn() };
      mockPrisma.lesson.findMany = jest.fn();
      mockPrisma.lesson.count = jest.fn();
      mockPrisma.lesson.update = jest.fn();
      mockPrisma.lesson.findUnique = jest.fn();
      mockPrisma.lesson.create = jest.fn();
      mockPrisma.lesson.delete = jest.fn();
    });

    describe('getExamLibrary', () => {
      it('should list every practice topic of the course, regardless of chapter', async () => {
        mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
        mockPrisma.lesson.findMany.mockResolvedValue([examRow]);
        mockPrisma.lesson.count.mockResolvedValue(1);

        const result = await service.getExamLibrary('course-1', {
          page: 1,
          limit: 20,
        });

        expect(result.total).toBe(1);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].questionCount).toBe(15);
        expect(result.data[0].module).toEqual({
          id: 'ch-1',
          title: 'Chương 1',
          sortOrder: 0,
        });
        const where = mockPrisma.lesson.findMany.mock.calls[0][0].where;
        expect(where).toEqual({ courseId: 'course-1', kind: 'practice' });
      });

      it('should filter by chapter when chapterId is given', async () => {
        mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
        mockPrisma.lesson.findMany.mockResolvedValue([]);
        mockPrisma.lesson.count.mockResolvedValue(0);

        await service.getExamLibrary('course-1', { moduleId: 'ch-1' });

        expect(mockPrisma.lesson.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ moduleId: 'ch-1' }),
          }),
        );
      });

      it('should throw if course not found', async () => {
        mockPrisma.course.findUnique.mockResolvedValue(null);

        await expect(service.getExamLibrary('missing', {})).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('createExamLesson', () => {
      it('should create a practice topic inside the given chapter', async () => {
        mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
        mockPrisma.module.findUnique.mockResolvedValue({
          id: 'ch-1',
          courseId: 'course-1',
        });
        mockPrisma.lesson.create.mockResolvedValue(examTopic);

        const result = await service.createExamLesson(
          'course-1',
          {
            kind: 'practice' as const,
            title: 'Đề thi thư viện',
            moduleId: 'ch-1',
          },
          adminActor,
        );

        expect(result.id).toBe('exam-1');
        expect(mockPrisma.lesson.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              kind: 'practice',
              courseId: 'course-1',
              moduleId: 'ch-1',
              classId: null,
              title: 'Đề thi thư viện',
            }),
          }),
        );
      });

      it('should throw if chapterId is missing', async () => {
        mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-1' });

        await expect(
          service.createExamLesson(
            'course-1',
            { kind: 'practice' as const, title: 'Đề thi' },
            adminActor,
          ),
        ).rejects.toThrow(BadRequestException);
        expect(mockPrisma.lesson.create).not.toHaveBeenCalled();
      });

      it('should throw if the chapter belongs to another course', async () => {
        mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
        mockPrisma.module.findUnique.mockResolvedValue({
          id: 'ch-9',
          courseId: 'course-2',
        });

        await expect(
          service.createExamLesson(
            'course-1',
            {
              kind: 'practice' as const,
              title: 'Đề thi',
              moduleId: 'ch-9',
            },
            adminActor,
          ),
        ).rejects.toThrow(BadRequestException);
        expect(mockPrisma.lesson.create).not.toHaveBeenCalled();
      });
    });

    describe('updateExamLesson', () => {
      it('should update title of an exam-library topic', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(examTopic);
        mockPrisma.lesson.update.mockResolvedValue({
          ...examTopic,
          title: 'Đề mới',
        });

        const result = await service.updateExamLesson(
          'course-1',
          'exam-1',
          { title: 'Đề mới' },
          adminActor,
        );

        expect(result.title).toBe('Đề mới');
      });

      it('should throw if topic belongs to another course', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(otherCourseTopic);

        await expect(
          service.updateExamLesson(
            'course-1',
            'exam-other',
            { title: 'X' },
            adminActor,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw if topic not found', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(null);

        await expect(
          service.updateExamLesson(
            'course-1',
            'missing',
            { title: 'X' },
            adminActor,
          ),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('deleteExamLesson', () => {
      it('should delete an exam-library topic', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(examTopic);
        mockPrisma.classContentItem.findMany.mockResolvedValue([]);
        mockPrisma.lesson.delete.mockResolvedValue(examTopic);

        await service.deleteExamLesson('course-1', 'exam-1', adminActor);

        expect(mockPrisma.lesson.delete).toHaveBeenCalledWith({
          where: { id: 'exam-1' },
        });
      });

      it('should throw if topic belongs to another course', async () => {
        mockPrisma.lesson.findUnique.mockResolvedValue(otherCourseTopic);

        await expect(
          service.deleteExamLesson('course-1', 'exam-other', adminActor),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('reorderExamLessons', () => {
      it('should update order for exam-library topics', async () => {
        mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
        mockPrisma.lesson.update.mockResolvedValue({});

        await service.reorderExamLessons(
          'course-1',
          ['exam-1', 'exam-2'],
          adminActor,
        );

        expect(mockPrisma.$transaction).toHaveBeenCalled();
        expect(mockPrisma.lesson.update).toHaveBeenCalledTimes(2);
        expect(mockPrisma.lesson.update).toHaveBeenNthCalledWith(1, {
          where: { id: 'exam-1', courseId: 'course-1', kind: 'practice' },
          data: { order: 0 },
        });
      });
    });
  });

  describe('knowledge-tree delete guards', () => {
    it('blocks deleting a lesson still referenced by ClassContentItem (including hidden)', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 'topic-1',
        classId: null,
        courseId: 'course-1',
      });
      mockPrisma.classContentItem.findMany.mockResolvedValue([
        {
          classId: 'cls-1',
          hiddenAt: new Date(),
          class: { name: 'Lớp A' },
        },
      ]);

      await expect(
        service.deleteLesson('topic-1', adminActor),
      ).rejects.toThrow(
        /Không thể xoá tiết học: còn 1 lớp đang tham chiếu — Lớp A \(1 lần giao đang ẩn\)/,
      );
      expect(mockPrisma.lesson.delete).not.toHaveBeenCalled();
    });

    it('deletes a lesson when no class content item references it', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 'topic-free',
        classId: null,
        courseId: 'course-1',
      });
      mockPrisma.classContentItem.findMany.mockResolvedValue([]);
      mockPrisma.lesson.delete.mockResolvedValue({});

      await service.deleteLesson('topic-free', adminActor);

      expect(mockPrisma.lesson.delete).toHaveBeenCalledWith({
        where: { id: 'topic-free' },
      });
    });

    it('blocks deleting a module whose lessons are used by N classes', async () => {
      mockPrisma.module.findUnique.mockResolvedValue({
        id: 'ch-1',
        courseId: 'course-1',
      });
      mockPrisma.module.delete = jest.fn();
      mockPrisma.lesson.findMany.mockResolvedValue([{ id: 'topic-1' }]);
      mockPrisma.classContentItem.findMany.mockResolvedValue([
        {
          classId: 'cls-1',
          hiddenAt: null,
          class: { name: 'Lớp 1' },
        },
        {
          classId: 'cls-2',
          hiddenAt: new Date(),
          class: { name: 'Lớp 2' },
        },
      ]);

      await expect(service.deleteModule('ch-1', adminActor)).rejects.toThrow(
        /Không thể xoá chuyên đề: còn 2 lớp đang tham chiếu/,
      );
      expect(mockPrisma.module.delete).not.toHaveBeenCalled();
    });

    it('rejects practice lessons that include video or content', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
      mockPrisma.module.findUnique.mockResolvedValue({
        id: 'ch-1',
        courseId: 'course-1',
      });

      await expect(
        service.createLesson(
          {
            kind: 'practice' as never,
            courseId: 'course-1',
            moduleId: 'ch-1',
            title: 'Đề',
            videoUrl: 'https://youtu.be/abc',
          },
          adminActor,
        ),
      ).rejects.toThrow(
        'Tiết thực hành không được kèm video hoặc nội dung — chỉ gồm tập câu hỏi.',
      );
      expect(mockPrisma.lesson.create).not.toHaveBeenCalled();
    });
  });

  describe('course-level authorization (dạy lớp ≠ soạn giáo án)', () => {
    const teacherActor = {
      userId: 'user-teacher',
      userEmail: 'teacher@test.com',
      roleType: UserRole.staff,
    };
    const lessonPlanActor = {
      userId: 'user-lp',
      userEmail: 'lp@test.com',
      roleType: UserRole.staff,
    };
    const courseChapter = { id: 'ch-1', courseId: 'course-x', title: 'Ch' };
    const courseTopic = {
      id: 'topic-1',
      kind: 'theory',
      courseId: 'course-x',
      classId: null,
      moduleId: 'ch-1',
      title: 'T',
    };
    const courseLecture = {
      id: 'lec-1',
      kind: 'theory',
      courseId: 'course-x',
      classId: null,
      title: 'L',
    };

    function mockTeacherNotOnCourse() {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-teacher',
        roles: ['teacher'],
      });
      mockPrisma.courseLessonPlanMember.findUnique.mockResolvedValue(null);
    }

    function mockLessonPlanUnassigned() {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-lp',
        roles: ['lesson_plan'],
      });
      mockPrisma.courseLessonPlanMember.findUnique.mockResolvedValue(null);
    }

    function mockLessonPlanAssigned() {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-lp',
        roles: ['lesson_plan'],
      });
      mockPrisma.courseLessonPlanMember.findUnique.mockResolvedValue({
        id: 'm-1',
      });
    }

    it('teacher on a class of course X but not on the lesson-plan team gets 403 on knowledge-tree writes', async () => {
      mockTeacherNotOnCourse();
      mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-x' });
      mockPrisma.module.findUnique.mockResolvedValue(courseChapter);
      mockPrisma.lesson.findUnique.mockResolvedValue(courseTopic);
      mockPrisma.lesson.findUnique.mockResolvedValue(courseLecture);

      await expect(
        service.createModule(
          { courseId: 'course-x', title: 'N' },
          teacherActor,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.updateModule('ch-1', { title: 'N' }, teacherActor),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.deleteModule('ch-1', teacherActor),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.reorderModules('course-x', ['ch-1'], teacherActor),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.createLesson(
          {
            kind: 'theory' as never,
            courseId: 'course-x',
            moduleId: 'ch-1',
            title: 'T',
          },
          teacherActor,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.updateLesson('topic-1', { title: 'N' }, teacherActor),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.deleteLesson('topic-1', teacherActor),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.reorderLessons(
          ['topic-1'],
          { moduleId: 'ch-1' },
          teacherActor,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.createExamLesson(
          'course-x',
          { title: 'E' } as never,
          teacherActor,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.reorderExamLessons('course-x', ['e1'], teacherActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('teacher cannot read course-level answer keys (questions + lecture quizzes)', async () => {
      mockTeacherNotOnCourse();
      mockPrisma.lesson.findUnique
        .mockResolvedValueOnce({
          id: 'topic-y',
          kind: 'practice',
          courseId: 'course-x',
          classId: null,
        })
        .mockResolvedValueOnce(courseLecture);
      mockPrisma.questionLink = { findMany: jest.fn() };
      mockPrisma.lessonQuiz = { findMany: jest.fn() };

      await expect(
        service.getQuestionsByLessonId('topic-y', teacherActor),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.getLessonQuizzes('lec-1', teacherActor),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.questionLink.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.lessonQuiz.findMany).not.toHaveBeenCalled();
    });

    it('lesson_plan not assigned to course Y gets 403 on GET questions', async () => {
      mockLessonPlanUnassigned();
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 'topic-y',
        kind: 'practice',
        courseId: 'course-y',
        classId: null,
      });
      mockPrisma.questionLink = { findMany: jest.fn() };

      await expect(
        service.getQuestionsByLessonId('topic-y', lessonPlanActor),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.questionLink.findMany).not.toHaveBeenCalled();
    });

    it('assigned lesson_plan member can still CRUD course-level chapters', async () => {
      mockLessonPlanAssigned();
      mockPrisma.course.findUnique.mockResolvedValue({ id: 'course-x' });
      mockPrisma.module.create.mockResolvedValue({
        id: 'ch-new',
        courseId: 'course-x',
        title: 'Ch',
      });

      const created = await service.createModule(
        { courseId: 'course-x', title: 'Ch' },
        lessonPlanActor,
      );
      expect(created.id).toBe('ch-new');

      mockPrisma.module.findUnique.mockResolvedValue(courseChapter);
      mockPrisma.module.update.mockResolvedValue({
        ...courseChapter,
        title: 'Ch2',
      });
      const updated = await service.updateModule(
        'ch-1',
        { title: 'Ch2' },
        lessonPlanActor,
      );
      expect(updated.title).toBe('Ch2');
    });
  });
});

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

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole } from 'generated/enums';
import { CourseAccessService } from '../class/course-access.service';
import { compareClassContentItems } from './class-content.service';
import {
  removeClassModuleItems,
  restoreClassModuleItems,
  syncClassModuleLessons,
} from './class-course-module-sync';
import { ClassCourseModuleService } from './class-course-module.service';
import { CourseContentService } from './course-content.service';

type MockRow = Record<string, unknown>;

/** `data` của từng lần gọi `create` trên mock. */
function createdRows(mock: jest.Mock): MockRow[] {
  return (mock.mock.calls as Array<[{ data: MockRow }]>).map(
    ([arg]) => arg.data,
  );
}

/** `data` (mảng) của lần gọi `createMany` đầu tiên trên mock. */
function firstCreateManyRows(mock: jest.Mock): MockRow[] {
  return (mock.mock.calls as Array<[{ data: MockRow[] }]>)[0][0].data;
}

const adminActor = {
  userId: 'user-admin-1',
  userEmail: 'admin@test.com',
  roleType: UserRole.admin,
};

function createMockPrisma() {
  const prisma: Record<string, any> = {
    class: { findUnique: jest.fn() },
    staffInfo: {
      findFirst: jest.fn().mockResolvedValue({ id: 'staff-1' }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    course: { findUnique: jest.fn() },
    module: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    },
    lesson: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    classModule: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _min: { sortOrder: null } }),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    attempt: { findMany: jest.fn().mockResolvedValue([]) },
    classContentItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: null } }),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    classTimelineItem: {
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: null } }),
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((fnOrArray: ((tx: any) => Promise<any>) | any[]) =>
      typeof fnOrArray === 'function'
        ? fnOrArray(prisma)
        : Promise.all(fnOrArray),
    ),
  };
  return prisma;
}

describe('syncClassModuleLessons', () => {
  let prisma: Record<string, any>;

  beforeEach(() => {
    prisma = createMockPrisma();
    let seq = 0;
    prisma.classContentItem.create.mockImplementation(() =>
      Promise.resolve({ id: `new-${++seq}` }),
    );
  });

  const openAt = new Date('2026-10-18T03:00:00Z');
  const closeAt = new Date('2027-01-01T00:00:00Z');

  it('đọc mọi tiết chưa lưu trữ của chuyên đề (lý thuyết lẫn thực hành)', async () => {
    await syncClassModuleLessons(prisma as any, {
      classId: 'cls-1',
      moduleId: 'm-1',
      openAt,
      closeAt,
    });

    expect(prisma.lesson.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { moduleId: 'm-1', archivedAt: null },
      }),
    );
    expect(prisma.classContentItem.create).not.toHaveBeenCalled();
    expect(prisma.classTimelineItem.createMany).not.toHaveBeenCalled();
  });

  it('tạo item cho tiết còn thiếu theo thứ tự tiết, nối sau sortOrder lớn nhất, timeline một lượt', async () => {
    prisma.lesson.findMany.mockResolvedValue([
      { id: 't1', kind: 'theory' },
      { id: 'p1', kind: 'practice' },
      { id: 't2', kind: 'theory' },
      { id: 't3', kind: 'theory' },
    ]);
    prisma.classContentItem.findMany.mockResolvedValue([{ lessonId: 't2' }]);
    prisma.classContentItem.aggregate.mockResolvedValue({
      _max: { sortOrder: 4 },
    });

    const result = await syncClassModuleLessons(prisma as any, {
      classId: 'cls-1',
      moduleId: 'm-1',
      openAt,
      closeAt,
    });

    const created = createdRows(prisma.classContentItem.create);
    // Lý thuyết trước, thực hành sau; tiết thực hành thành lần giao (mở lúc thêm, hạn lớp).
    expect(created.map((d) => [d.lessonId, d.sortOrder])).toEqual([
      ['t1', 5],
      ['t3', 6],
      ['p1', 7],
    ]);
    expect(created[0].openAt).toBeUndefined();
    expect(created[2]).toMatchObject({
      openAt,
      closeAt,
      shuffleQuestions: true,
    });
    // created_at tăng dần để timeline sắp theo thời gian giữ đúng thứ tự tiết.
    expect((created[1].createdAt as Date).getTime()).toBeGreaterThan(
      (created[0].createdAt as Date).getTime(),
    );
    expect(prisma.classTimelineItem.createMany).toHaveBeenCalledTimes(1);
    expect(
      firstCreateManyRows(prisma.classTimelineItem.createMany).map(
        (row) => row.classContentItemId,
      ),
    ).toEqual(['new-1', 'new-2', 'new-3']);
    expect(result).toEqual(['new-1', 'new-2', 'new-3']);
    // Item đã có (kể cả đang ẩn) không bị đụng: sync không khôi phục.
    expect(prisma.classContentItem.updateMany).not.toHaveBeenCalled();
  });

  it('restoreClassModuleItems: đưa về item đã gỡ, chỉ hiện lại item ẩn do gỡ, Ẩn tay vẫn ẩn', async () => {
    prisma.classContentItem.findMany.mockResolvedValue([
      { id: 'i1', hiddenReason: 'module_removed' },
      { id: 'p1', hiddenReason: 'module_removed' },
      { id: 'h1', hiddenReason: 'manual' },
    ]);

    const restored = await restoreClassModuleItems(prisma as any, {
      classId: 'cls-1',
      moduleId: 'm-1',
    });

    expect(restored).toEqual(['i1', 'p1', 'h1']);
    expect(prisma.classContentItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lesson: { is: { moduleId: 'm-1' } },
          classId: 'cls-1',
          removedAt: { not: null },
          NOT: { lesson: { is: { archivedAt: { not: null } } } },
        },
      }),
    );
    expect(prisma.classContentItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'p1', 'h1'] } },
      data: { removedAt: null },
    });
    expect(prisma.classContentItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'p1'] } },
      data: { hiddenAt: null, hiddenByStaffId: null, hiddenReason: null },
    });
    expect(prisma.classTimelineItem.updateMany).toHaveBeenCalledWith({
      where: { classContentItemId: { in: ['i1', 'p1'] } },
      data: { hiddenAt: null, hiddenByStaffId: null },
    });
  });

  it('removeClassModuleItems: gỡ mọi item còn trong lớp, chỉ ẩn kèm item đang hiện', async () => {
    prisma.classContentItem.findMany.mockResolvedValue([
      { id: 'i1', hiddenAt: null },
      { id: 'p1', hiddenAt: null },
      { id: 'h1', hiddenAt: new Date('2026-10-01T00:00:00Z') },
    ]);
    const removedAt = new Date('2026-10-05T00:00:00Z');

    const removed = await removeClassModuleItems(prisma as any, {
      classId: 'cls-1',
      moduleId: 'm-1',
      removedAt,
      hiddenByStaffId: 'staff-1',
    });

    expect(removed).toEqual(['i1', 'p1', 'h1']);
    // Không lọc theo loại tiết hay trạng thái Ẩn: lần giao và tiết đang Ẩn cũng gỡ.
    expect(prisma.classContentItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lesson: { is: { moduleId: 'm-1' } },
          classId: 'cls-1',
          removedAt: null,
        },
      }),
    );
    expect(prisma.classContentItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'p1', 'h1'] } },
      data: { removedAt },
    });
    // Item đang Ẩn tay giữ lý do manual để thêm lại vẫn ẩn.
    expect(prisma.classContentItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'p1'] } },
      data: {
        hiddenAt: removedAt,
        hiddenByStaffId: 'staff-1',
        hiddenReason: 'module_removed',
      },
    });
    expect(prisma.classTimelineItem.updateMany).toHaveBeenCalledWith({
      where: { classContentItemId: { in: ['i1', 'p1'] } },
      data: { hiddenAt: removedAt, hiddenByStaffId: 'staff-1' },
    });
  });
});

describe('ClassCourseModuleService', () => {
  let prisma: Record<string, any>;
  let service: ClassCourseModuleService;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.class.findUnique.mockResolvedValue({ courseId: 'course-1' });
    service = new ClassCourseModuleService(
      prisma as any,
      {} as any,
      new CourseAccessService(prisma as any),
    );
  });

  it('list: chuyên đề của khoá, đếm tiết lý thuyết/thực hành, đánh dấu đã thêm', async () => {
    const addedAt = new Date('2026-10-01T00:00:00Z');
    prisma.module.findMany.mockResolvedValue([
      {
        id: 'm-1',
        title: 'Hàm số',
        sortOrder: 0,
        lessons: [
          { id: 't1', kind: 'theory' },
          { id: 't2', kind: 'theory' },
          { id: 'p1', kind: 'practice' },
        ],
      },
      { id: 'm-2', title: 'Hình học', sortOrder: 1, lessons: [] },
    ]);
    prisma.classModule.findMany.mockResolvedValue([
      { moduleId: 'm-1', createdAt: addedAt, sortOrder: 3 },
    ]);
    prisma.classContentItem.findMany.mockResolvedValue([
      { lessonId: 't1' },
      { lessonId: 'p1' },
    ]);

    const result = await service.listClassModules('cls-1', adminActor);

    expect(prisma.module.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { courseId: 'course-1' } }),
    );
    expect(result).toEqual([
      {
        moduleId: 'm-1',
        title: 'Hàm số',
        sortOrder: 0,
        classSortOrder: 3,
        theoryLessonCount: 2,
        practiceLessonCount: 1,
        inClassLessonCount: 2,
        added: true,
        addedAt,
      },
      {
        moduleId: 'm-2',
        title: 'Hình học',
        sortOrder: 1,
        classSortOrder: null,
        theoryLessonCount: 0,
        practiceLessonCount: 0,
        inClassLessonCount: 0,
        added: false,
        addedAt: null,
      },
    ]);
  });

  it('add: chặn chuyên đề của khoá khác', async () => {
    prisma.module.findUnique.mockResolvedValue({
      id: 'm-x',
      courseId: 'course-2',
    });

    await expect(
      service.addClassModule('cls-1', 'm-x', adminActor),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.classModule.create).not.toHaveBeenCalled();
  });

  it('add: lớp đã có nhóm (thêm lẻ tiết trước) → giữ vị trí, chỉ bổ sung tiết còn thiếu', async () => {
    prisma.module.findUnique.mockResolvedValue({
      id: 'm-1',
      courseId: 'course-1',
    });
    prisma.classModule.findUnique.mockResolvedValue({ id: 'cm-1' });
    prisma.lesson.findMany.mockResolvedValue([
      { id: 't1', kind: 'theory' },
      { id: 'p1', kind: 'practice' },
    ]);
    prisma.classContentItem.findMany.mockResolvedValueOnce([
      { lessonId: 't1' },
    ]);
    prisma.classContentItem.create.mockResolvedValue({ id: 'new-1' });

    await service.addClassModule('cls-1', 'm-1', adminActor);

    expect(prisma.classModule.create).not.toHaveBeenCalled();
    expect(prisma.classContentItem.create).toHaveBeenCalledTimes(1);
    expect(prisma.classContentItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lessonId: 'p1' }),
      }),
    );
  });

  it('add: chuyên đề lên đầu nhóm, kéo tiết lý thuyết + lần giao thực hành vào lớp, khôi phục item ẩn do gỡ', async () => {
    const contentAccessExpiresAt = new Date('2027-01-01T00:00:00Z');
    prisma.class.findUnique.mockResolvedValue({
      courseId: 'course-1',
      contentAccessExpiresAt,
    });
    prisma.module.findUnique.mockResolvedValue({
      id: 'm-1',
      courseId: 'course-1',
    });
    prisma.classModule.findUnique.mockResolvedValue(null);
    prisma.classModule.aggregate.mockResolvedValue({ _min: { sortOrder: 0 } });
    prisma.lesson.findMany.mockResolvedValue([
      { id: 't1', kind: 'theory' },
      { id: 'p1', kind: 'practice' },
    ]);
    prisma.classContentItem.create.mockResolvedValue({ id: 'new-1' });

    const before = Date.now();
    await service.addClassModule('cls-1', 'm-1', adminActor);

    expect(prisma.classModule.create).toHaveBeenCalledWith({
      data: { classId: 'cls-1', moduleId: 'm-1', sortOrder: -1 },
    });
    expect(prisma.classContentItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ classId: 'cls-1', lessonId: 't1' }),
      }),
    );
    const practice = createdRows(prisma.classContentItem.create).find(
      (row) => row.lessonId === 'p1',
    )!;
    // Mở bài lúc thêm, hạn = hạn xem nội dung của lớp.
    expect((practice.openAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(practice.closeAt).toEqual(contentAccessExpiresAt);
    expect(prisma.classContentItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ removedAt: { not: null } }),
      }),
    );
  });

  it('add: lớp chưa có chuyên đề nào → sortOrder 0', async () => {
    prisma.module.findUnique.mockResolvedValue({
      id: 'm-1',
      courseId: 'course-1',
    });
    prisma.classModule.findUnique.mockResolvedValue(null);

    await service.addClassModule('cls-1', 'm-1', adminActor);

    expect(prisma.classModule.create).toHaveBeenCalledWith({
      data: { classId: 'cls-1', moduleId: 'm-1', sortOrder: 0 },
    });
  });

  it('remove: 404 khi lớp chưa thêm chuyên đề (kể cả bị gỡ đồng thời)', async () => {
    prisma.classModule.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.removeClassModule('cls-1', 'm-1', adminActor),
    ).rejects.toThrow(NotFoundException);
  });

  it('remove: xoá liên kết, gỡ mọi item của chuyên đề (lý thuyết + lần giao)', async () => {
    prisma.classContentItem.findMany.mockResolvedValue([
      { id: 'i1', hiddenAt: null },
      { id: 'p1', hiddenAt: null },
    ]);

    await service.removeClassModule('cls-1', 'm-1', adminActor);

    expect(prisma.classModule.deleteMany).toHaveBeenCalledWith({
      where: { classId: 'cls-1', moduleId: 'm-1' },
    });
    expect(prisma.classContentItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'p1'] } },
      data: { removedAt: expect.any(Date) },
    });
    expect(prisma.classContentItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'p1'] } },
      data: {
        hiddenAt: expect.any(Date),
        hiddenByStaffId: 'staff-1',
        hiddenReason: 'module_removed',
      },
    });
  });

  it('reorder: lưu thứ tự lớp theo vị trí, không đụng modules.sort_order', async () => {
    prisma.classModule.findMany.mockResolvedValue([
      { moduleId: 'm-1' },
      { moduleId: 'm-2' },
    ]);

    await service.reorderClassModules('cls-1', ['m-2', 'm-1'], adminActor);

    expect(prisma.classModule.update).toHaveBeenNthCalledWith(1, {
      where: { classId_moduleId: { classId: 'cls-1', moduleId: 'm-2' } },
      data: { sortOrder: 0 },
    });
    expect(prisma.classModule.update).toHaveBeenNthCalledWith(2, {
      where: { classId_moduleId: { classId: 'cls-1', moduleId: 'm-1' } },
      data: { sortOrder: 1 },
    });
  });

  it.each([
    ['trùng', ['m-1', 'm-1']],
    ['thiếu', ['m-1']],
    ['lạ', ['m-1', 'm-x']],
  ])('reorder: 400 khi danh sách %s', async (_label, moduleIds) => {
    prisma.classModule.findMany.mockResolvedValue([
      { moduleId: 'm-1' },
      { moduleId: 'm-2' },
    ]);

    await expect(
      service.reorderClassModules('cls-1', moduleIds, adminActor),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.classModule.update).not.toHaveBeenCalled();
  });

  it('removal impact: đếm câu tự luận chưa chấm + học sinh đang làm dở trên lượt mới nhất', async () => {
    prisma.attempt.findMany.mockResolvedValue([
      {
        studentId: 's1',
        status: 'submitted',
        hasUngradedEssay: true,
        _count: { answers: 2 },
      },
      {
        studentId: 's2',
        status: 'in_progress',
        hasUngradedEssay: false,
        _count: { answers: 1 },
      },
      {
        studentId: 's2',
        status: 'in_progress',
        hasUngradedEssay: false,
        _count: { answers: 1 },
      },
      {
        studentId: 's3',
        status: 'timed_out',
        hasUngradedEssay: false,
        _count: { answers: 0 },
      },
    ]);

    const impact = await service.getClassModuleRemovalImpact(
      'cls-1',
      'm-1',
      adminActor,
    );

    expect(impact).toEqual({
      moduleId: 'm-1',
      ungradedEssayCount: 2,
      inProgressStudentCount: 1,
    });
    expect(prisma.attempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          // Gồm cả lần giao đang Ẩn: gỡ làm mất lối vào chấm bài của chúng.
          assignment: {
            classId: 'cls-1',
            lesson: { is: { moduleId: 'm-1' } },
            removedAt: null,
          },
        },
        distinct: ['assignmentId', 'studentId'],
      }),
    );
  });
});

describe('Nội dung lớp theo chuyên đề — hook tiết học/chuyên đề', () => {
  let prisma: Record<string, any>;
  let service: CourseContentService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new CourseContentService(
      prisma as any,
      {} as any,
      new CourseAccessService(prisma as any),
    );
  });

  it('tạo tiết lý thuyết trong chuyên đề → không tự hiện trên lớp đã thêm chuyên đề', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
    prisma.module.findUnique.mockResolvedValue({
      id: 'm-1',
      courseId: 'course-1',
    });
    prisma.lesson.create.mockResolvedValue({
      id: 't-new',
      kind: 'theory',
      moduleId: 'm-1',
    });
    prisma.classModule.findMany.mockResolvedValue([{ classId: 'cls-1' }]);
    prisma.lesson.findMany.mockResolvedValue([{ id: 't-new' }]);
    prisma.classContentItem.create.mockResolvedValue({ id: 'new-1' });

    await service.createLesson(
      {
        kind: 'theory' as never,
        courseId: 'course-1',
        moduleId: 'm-1',
        title: 'Tiết mới',
      },
      adminActor,
    );

    expect(prisma.classModule.findMany).not.toHaveBeenCalled();
    expect(prisma.classContentItem.create).not.toHaveBeenCalled();
  });

  it('tạo tiết thực hành không kéo vào lớp', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
    prisma.module.findUnique.mockResolvedValue({
      id: 'm-1',
      courseId: 'course-1',
    });
    prisma.lesson.create.mockResolvedValue({
      id: 'p-new',
      kind: 'practice',
      moduleId: 'm-1',
    });

    await service.createLesson(
      {
        kind: 'practice' as never,
        courseId: 'course-1',
        moduleId: 'm-1',
        title: 'Thực hành',
        durationMinutes: 60,
      },
      adminActor,
    );

    expect(prisma.classModule.findMany).not.toHaveBeenCalled();
    expect(prisma.classContentItem.create).not.toHaveBeenCalled();
  });

  it('tạo tiết thực hành không có thời lượng → bị chặn', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
    prisma.module.findUnique.mockResolvedValue({
      id: 'm-1',
      courseId: 'course-1',
    });

    await expect(
      service.createLesson(
        {
          kind: 'practice' as never,
          courseId: 'course-1',
          moduleId: 'm-1',
          title: 'Thực hành',
        },
        adminActor,
      ),
    ).rejects.toThrow('Tiết thực hành phải đặt thời lượng làm bài');
    expect(prisma.lesson.create).not.toHaveBeenCalled();
  });

  it('sửa thời lượng trên tiết lý thuyết → bị chặn', async () => {
    prisma.lesson.findUnique.mockResolvedValue({
      id: 't-1',
      kind: 'theory',
      courseId: 'course-1',
      classId: null,
      archivedAt: null,
    });

    await expect(
      service.updateLesson('t-1', { durationMinutes: 30 }, adminActor),
    ).rejects.toThrow('Chỉ tiết thực hành có thời lượng làm bài');
    expect(prisma.lesson.update).not.toHaveBeenCalled();
  });

  it('không tạo tiết riêng cho lớp nữa', async () => {
    await expect(
      service.createLesson(
        { kind: 'theory' as never, classId: 'cls-1', title: 'Tiết riêng' },
        adminActor,
      ),
    ).rejects.toThrow('Lớp không tạo tiết riêng nữa');
    expect(prisma.lesson.create).not.toHaveBeenCalled();
  });

  it('tiết riêng lớp đã lưu trữ: không sửa, không xoá', async () => {
    prisma.lesson.findUnique.mockResolvedValue({
      id: 'own-1',
      kind: 'theory',
      classId: 'cls-1',
      courseId: null,
      archivedAt: new Date('2026-10-02T00:00:00Z'),
    });

    await expect(
      service.updateLesson('own-1', { title: 'Mới' }, adminActor),
    ).rejects.toThrow('Tiết học đã lưu trữ');
    await expect(service.deleteLesson('own-1', adminActor)).rejects.toThrow(
      'Tiết học đã lưu trữ',
    );
    expect(prisma.lesson.update).not.toHaveBeenCalled();
    expect(prisma.lesson.delete).not.toHaveBeenCalled();
    expect(prisma.classContentItem.deleteMany).not.toHaveBeenCalled();
  });

  it('xoá tiết lý thuyết đang trên lớp → gỡ khỏi mọi lớp, không 409', async () => {
    prisma.lesson.findUnique.mockResolvedValue({
      id: 't1',
      kind: 'theory',
      classId: null,
      courseId: 'course-1',
    });
    prisma.classContentItem.findMany.mockResolvedValue([
      { classId: 'cls-1', hiddenAt: null, class: { name: 'Lớp' } },
    ]);

    await service.deleteLesson('t1', adminActor);

    expect(prisma.classContentItem.deleteMany).toHaveBeenCalledWith({
      where: { lessonId: 't1' },
    });
    expect(prisma.lesson.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });

  it('xoá chuyên đề chỉ có tiết lý thuyết trên lớp → xoá item lớp rồi xoá chuyên đề', async () => {
    prisma.module.findUnique.mockResolvedValue({
      id: 'm-1',
      courseId: 'course-1',
    });
    prisma.lesson.findMany.mockResolvedValue([
      { id: 't1', kind: 'theory' },
      { id: 't2', kind: 'theory' },
    ]);

    await service.deleteModule('m-1', adminActor);

    // Guard 409 chỉ soi tiết thực hành → không có gì để soi.
    expect(prisma.classContentItem.findMany).not.toHaveBeenCalled();
    expect(prisma.classContentItem.deleteMany).toHaveBeenCalledWith({
      where: { lessonId: { in: ['t1', 't2'] } },
    });
    expect(prisma.module.delete).toHaveBeenCalledWith({ where: { id: 'm-1' } });
  });

  it('thêm lẻ tiết lý thuyết: không lịch, chuyên đề mới vào lớp đứng đầu nhóm', async () => {
    prisma.class.findUnique.mockResolvedValue({
      courseId: 'course-1',
      contentAccessExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
    });
    prisma.lesson.findUnique.mockResolvedValue({
      id: 't1',
      kind: 'theory',
      moduleId: 'm-new',
      courseId: 'course-1',
      classId: null,
      archivedAt: null,
    });
    prisma.classModule.findUnique.mockResolvedValue(null);
    prisma.classModule.aggregate.mockResolvedValue({ _min: { sortOrder: 0 } });
    prisma.classContentItem.findUnique.mockResolvedValue(null);
    prisma.classContentItem.create.mockResolvedValue({
      id: 'cci-t1',
      classId: 'cls-1',
      lessonId: 't1',
      kind: 'lesson',
      sortOrder: 0,
      lesson: {
        title: 'Lý thuyết',
        kind: 'theory',
        classId: null,
        module: { id: 'm-new', title: 'Chuyên đề mới' },
        quizzes: [],
      },
    });

    await service.createClassContentItem(
      'cls-1',
      { lessonId: 't1' },
      adminActor,
    );

    expect(prisma.classModule.create).toHaveBeenCalledWith({
      data: { classId: 'cls-1', moduleId: 'm-new', sortOrder: -1 },
    });
    const created = prisma.classContentItem.create.mock.calls[0][0];
    expect(created.data).toMatchObject({
      lessonId: 't1',
      openAt: null,
      closeAt: null,
    });
    expect(created.data.shuffleQuestions).toBeUndefined();
  });

  it('thêm tiết của khoá khác → 400, không tạo item', async () => {
    prisma.class.findUnique.mockResolvedValue({ courseId: 'course-1' });
    prisma.lesson.findUnique.mockResolvedValue({
      id: 't9',
      kind: 'theory',
      moduleId: 'm-9',
      courseId: 'course-other',
      classId: null,
      archivedAt: null,
    });

    await expect(
      service.createClassContentItem('cls-1', { lessonId: 't9' }, adminActor),
    ).rejects.toThrow('Tiết học không thuộc khoá của lớp.');
    expect(prisma.classContentItem.create).not.toHaveBeenCalled();
    expect(prisma.classModule.create).not.toHaveBeenCalled();
  });

  it('thêm lại tiết đã gỡ khỏi lớp → hiện lại item cũ, không tạo trùng', async () => {
    prisma.class.findUnique.mockResolvedValue({ courseId: 'course-1' });
    prisma.lesson.findUnique.mockResolvedValue({
      id: 't1',
      kind: 'theory',
      moduleId: 'm-1',
      courseId: 'course-1',
      classId: null,
      archivedAt: null,
    });
    prisma.classModule.findUnique.mockResolvedValue({ id: 'cm-1' });
    prisma.classContentItem.findUnique.mockResolvedValue({
      id: 'cci-old',
      hiddenAt: new Date(),
      hiddenReason: 'module_removed',
      removedAt: new Date(),
    });
    prisma.classContentItem.findMany.mockResolvedValue([
      { id: 'cci-old', hiddenReason: 'module_removed' },
    ]);
    prisma.classContentItem.update.mockResolvedValue({
      id: 'cci-old',
      classId: 'cls-1',
      lessonId: 't1',
      kind: 'lesson',
      sortOrder: 0,
      lesson: {
        title: 'Lý thuyết',
        kind: 'theory',
        classId: null,
        module: { id: 'm-1', title: 'Chuyên đề 1' },
        quizzes: [],
      },
    });

    const result = await service.createClassContentItem(
      'cls-1',
      { lessonId: 't1' },
      adminActor,
    );

    expect(result.id).toBe('cci-old');
    expect(prisma.classContentItem.create).not.toHaveBeenCalled();
    expect(prisma.classModule.create).not.toHaveBeenCalled();
    expect(prisma.classContentItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['cci-old'] } },
      data: { removedAt: null },
    });
    expect(prisma.classContentItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['cci-old'] } },
      data: { hiddenAt: null, hiddenByStaffId: null, hiddenReason: null },
    });
  });

  it('thêm lại tiết đã gỡ từng Ẩn tay → về lớp nhưng vẫn ẩn', async () => {
    prisma.class.findUnique.mockResolvedValue({ courseId: 'course-1' });
    prisma.lesson.findUnique.mockResolvedValue({
      id: 't1',
      kind: 'theory',
      moduleId: 'm-1',
      courseId: 'course-1',
      classId: null,
      archivedAt: null,
    });
    prisma.classModule.findUnique.mockResolvedValue({ id: 'cm-1' });
    prisma.classContentItem.findUnique.mockResolvedValue({
      id: 'cci-old',
      hiddenAt: new Date(),
      hiddenReason: 'manual',
      removedAt: new Date(),
    });
    prisma.classContentItem.findMany.mockResolvedValue([
      { id: 'cci-old', hiddenReason: 'manual' },
    ]);
    prisma.classContentItem.update.mockResolvedValue({
      id: 'cci-old',
      classId: 'cls-1',
      lessonId: 't1',
      kind: 'lesson',
      sortOrder: 0,
      hiddenAt: new Date(),
      hiddenReason: 'manual',
      lesson: {
        title: 'Lý thuyết',
        kind: 'theory',
        classId: null,
        module: { id: 'm-1', title: 'Chuyên đề 1' },
        quizzes: [],
      },
    });

    const result = await service.createClassContentItem(
      'cls-1',
      { lessonId: 't1' },
      adminActor,
    );

    expect(result.hiddenReason).toBe('manual');
    expect(prisma.classContentItem.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.classContentItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['cci-old'] } },
      data: { removedAt: null },
    });
    expect(prisma.classTimelineItem.updateMany).not.toHaveBeenCalled();
  });

  it('không khôi phục (bỏ Ẩn) tiết đã gỡ khỏi lớp', async () => {
    prisma.classContentItem.findUnique.mockResolvedValue({
      id: 'i1',
      classId: 'cls-1',
      removedAt: new Date(),
      lesson: { archivedAt: null },
    });

    await expect(
      service.restoreClassContentItem('cls-1', 'i1', adminActor),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.classContentItem.update).not.toHaveBeenCalled();
  });

  it('không Ẩn tiết đã gỡ khỏi lớp', async () => {
    prisma.classContentItem.findUnique.mockResolvedValue({
      id: 'i1',
      classId: 'cls-1',
      removedAt: new Date(),
    });

    await expect(
      service.deleteClassContentItem('cls-1', 'i1', adminActor),
    ).rejects.toThrow(NotFoundException);
  });

  it('gỡ một tiết: gỡ item, còn tiết khác của chuyên đề thì giữ nhóm', async () => {
    prisma.classContentItem.findUnique.mockResolvedValue({
      classId: 'cls-1',
      removedAt: null,
      lesson: { moduleId: 'm-1' },
    });
    prisma.classContentItem.findMany.mockResolvedValue([
      { id: 'i1', hiddenAt: null },
    ]);
    prisma.classContentItem.count = jest.fn().mockResolvedValue(2);

    await service.removeClassContentItem('cls-1', 'i1', adminActor);

    expect(prisma.classContentItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'i1', classId: 'cls-1', removedAt: null },
      }),
    );
    expect(prisma.classContentItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1'] } },
      data: { removedAt: expect.any(Date) },
    });
    expect(prisma.classContentItem.count).toHaveBeenCalledWith({
      where: {
        classId: 'cls-1',
        removedAt: null,
        lesson: { is: { moduleId: 'm-1' } },
      },
    });
    expect(prisma.classModule.deleteMany).not.toHaveBeenCalled();
  });

  it('gỡ tiết cuối của chuyên đề → nhóm biến mất', async () => {
    prisma.classContentItem.findUnique.mockResolvedValue({
      classId: 'cls-1',
      removedAt: null,
      lesson: { moduleId: 'm-1' },
    });
    prisma.classContentItem.findMany.mockResolvedValue([
      { id: 'i1', hiddenAt: new Date() },
    ]);
    prisma.classContentItem.count = jest.fn().mockResolvedValue(0);

    await service.removeClassContentItem('cls-1', 'i1', adminActor);

    // Item đang Ẩn tay: chỉ đánh dấu gỡ, không đổi lý do ẩn.
    expect(prisma.classContentItem.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.classModule.deleteMany).toHaveBeenCalledWith({
      where: { classId: 'cls-1', moduleId: 'm-1' },
    });
  });

  it('gỡ tiết đã gỡ / lớp khác → 404', async () => {
    prisma.classContentItem.findUnique.mockResolvedValue({
      classId: 'cls-1',
      removedAt: new Date(),
      lesson: { moduleId: 'm-1' },
    });

    await expect(
      service.removeClassContentItem('cls-1', 'i1', adminActor),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.classContentItem.updateMany).not.toHaveBeenCalled();
  });

  it('ảnh hưởng gỡ một tiết: tính trên lần giao đó', async () => {
    prisma.classContentItem.findUnique.mockResolvedValue({
      classId: 'cls-1',
      removedAt: null,
    });
    prisma.attempt.findMany.mockResolvedValue([
      {
        studentId: 's1',
        status: 'submitted',
        hasUngradedEssay: true,
        _count: { answers: 3 },
      },
      {
        studentId: 's2',
        status: 'in_progress',
        hasUngradedEssay: false,
        _count: { answers: 0 },
      },
    ]);

    const impact = await service.getClassContentItemRemovalImpact(
      'cls-1',
      'p1',
      adminActor,
    );

    expect(impact).toEqual({
      itemId: 'p1',
      ungradedEssayCount: 3,
      inProgressStudentCount: 1,
    });
    expect(prisma.attempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assignment: { id: 'p1', classId: 'cls-1', removedAt: null } },
      }),
    );
  });

  it('ẩn tay gắn lý do manual; khôi phục xoá lý do', async () => {
    prisma.classContentItem.findUnique.mockResolvedValue({
      id: 'p1',
      classId: 'cls-1',
      hiddenAt: null,
      hiddenReason: null,
      removedAt: null,
      lesson: { archivedAt: null },
    });

    await service.deleteClassContentItem('cls-1', 'p1', adminActor);
    expect(prisma.classContentItem.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        hiddenAt: expect.any(Date),
        hiddenByStaffId: 'staff-1',
        hiddenReason: 'manual',
      },
    });

    await service.restoreClassContentItem('cls-1', 'p1', adminActor);
    expect(prisma.classContentItem.update).toHaveBeenLastCalledWith({
      where: { id: 'p1' },
      data: { hiddenAt: null, hiddenByStaffId: null, hiddenReason: null },
    });
  });

  it('không khôi phục tiết đã lưu trữ', async () => {
    prisma.classContentItem.findUnique.mockResolvedValue({
      id: 'i1',
      classId: 'cls-1',
      lesson: { kind: 'theory', moduleId: null, archivedAt: new Date() },
    });

    await expect(
      service.restoreClassContentItem('cls-1', 'i1', adminActor),
    ).rejects.toThrow(
      'Tiết học đã được lưu trữ, không khôi phục vào lớp được.',
    );
  });

  it('danh sách tiết để thêm gồm mọi tiết chưa lưu trữ của khoá, tiết đã gỡ không tính là đã thêm', async () => {
    prisma.class.findUnique.mockResolvedValue({ courseId: 'course-1' });

    await service.listCourseLessonsForClass('cls-1', adminActor);

    expect(prisma.lesson.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { courseId: 'course-1', classId: null, archivedAt: null },
      }),
    );
    expect(prisma.classContentItem.findMany).toHaveBeenCalledWith({
      where: { classId: 'cls-1', removedAt: null },
      select: { lessonId: true },
    });
  });

  it('giao tiết thực hành → tạo lần giao kèm giờ mở, thời lượng đọc từ tiết', async () => {
    prisma.class.findUnique.mockResolvedValue({ courseId: 'course-1' });
    prisma.lesson.findUnique.mockResolvedValue({
      id: 'p1',
      kind: 'practice',
      moduleId: 'm-1',
      courseId: 'course-1',
      classId: null,
      archivedAt: null,
    });
    prisma.classModule.findUnique.mockResolvedValue({ id: 'cm-1' });
    prisma.classContentItem.findUnique.mockResolvedValue(null);
    prisma.classContentItem.create.mockResolvedValue({
      id: 'cci-p1',
      classId: 'cls-1',
      lessonId: 'p1',
      kind: 'lesson',
      sortOrder: 0,
      openAt: new Date('2026-10-05T01:00:00.000Z'),
      durationMinutes: null,
      hiddenAt: null,
      lesson: {
        title: 'Luyện tập',
        kind: 'practice',
        durationMinutes: 45,
        classId: null,
        module: { id: 'm-1', title: 'Chuyên đề 1' },
        quizzes: [],
      },
    });

    const result = await service.createClassContentItem(
      'cls-1',
      {
        lessonId: 'p1',
        openAt: '2026-10-05T01:00:00.000Z',
      },
      adminActor,
    );

    expect(result.id).toBe('cci-p1');
    expect(result.durationMinutes).toBe(45);
    const created = prisma.classContentItem.create.mock.calls[0][0];
    expect(created.data).toMatchObject({
      lessonId: 'p1',
      openAt: new Date('2026-10-05T01:00:00.000Z'),
    });
    expect(created.data.durationMinutes).toBeUndefined();
  });
});

describe('compareClassContentItems', () => {
  const item = (
    id: string,
    sortOrder: number,
    lesson: {
      kind: string;
      order: number;
      module: { id: string; sortOrder: number } | null;
    },
  ) => ({ id, sortOrder, lesson });

  it('theo chuyên đề; trong chuyên đề lý thuyết theo thứ tự tiết rồi thực hành; không chuyên đề xếp cuối', () => {
    const m1 = { id: 'm1', sortOrder: 0 };
    const m2 = { id: 'm2', sortOrder: 1 };
    const items = [
      item('own', 0, { kind: 'theory', order: 0, module: null }),
      item('m2-t1', 1, { kind: 'theory', order: 0, module: m2 }),
      item('m1-p', 2, { kind: 'practice', order: 9, module: m1 }),
      item('m1-t2', 3, { kind: 'theory', order: 1, module: m1 }),
      item('m1-t1', 4, { kind: 'theory', order: 0, module: m1 }),
    ];

    expect(items.toSorted(compareClassContentItems).map((i) => i.id)).toEqual([
      'm1-t1',
      'm1-t2',
      'm1-p',
      'm2-t1',
      'own',
    ]);
  });
});

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

jest.mock('../../generated/client', () => ({}));

import { ClassTimelineService } from './class-timeline.service';
import { UserRole } from 'generated/enums';

describe('ClassTimelineService — soft hide', () => {
  let service: ClassTimelineService;
  let mockPrisma: Record<string, any>;
  let staffAccess: {
    resolveClassViewerActor: jest.Mock;
    resolveClassViewAccessMode: jest.Mock;
  };

  const adminActor = {
    userId: 'user-admin-1',
    userEmail: 'admin@test.com',
    roleType: UserRole.admin,
  };

  beforeEach(() => {
    mockPrisma = {
      classTimelineItem: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      studentClass: { findFirst: jest.fn() },
      studentInfo: { findUnique: jest.fn() },
      class: { update: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    staffAccess = {
      resolveClassViewerActor: jest.fn().mockResolvedValue({}),
      resolveClassViewAccessMode: jest.fn().mockResolvedValue('admin'),
    };
    service = new ClassTimelineService(mockPrisma as any, staffAccess as any);
  });

  it('staff list includes hidden content items', async () => {
    mockPrisma.classTimelineItem.findMany.mockResolvedValue([
      {
        id: 'tl-1',
        kind: 'content_item',
        sortOrder: 0,
        hiddenAt: new Date('2026-09-07T00:00:00.000Z'),
        classContentItem: {
          id: 'cci-1',
          hiddenAt: new Date('2026-09-07T00:00:00.000Z'),
          openAt: null,
          durationMinutes: null,
          lesson: { id: 't-1', title: 'Ẩn', kind: 'theory' },
        },
        session: null,
        classSurvey: null,
      },
    ]);

    const rows = await service.listForStaff('cls-1', adminActor);

    expect(rows).toHaveLength(1);
    expect(rows[0].hiddenAt).toBe('2026-09-07T00:00:00.000Z');
    expect(mockPrisma.classTimelineItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { classId: 'cls-1' },
      }),
    );
  });

  it('student list omits hidden timeline items', async () => {
    mockPrisma.studentClass.findFirst.mockResolvedValue({
      id: 'sc-1',
      class: { contentAccessExpiresAt: null },
    });
    mockPrisma.classTimelineItem.findMany.mockResolvedValue([]);

    await service.listForStudent('cls-1', 'stu-1', undefined, 20);

    expect(mockPrisma.classTimelineItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classId: 'cls-1',
          hiddenAt: null,
        }),
      }),
    );
  });
});

describe('ClassTimelineService — reorder', () => {
  let service: ClassTimelineService;
  let mockPrisma: Record<string, any>;
  let staffAccess: {
    resolveClassViewerActor: jest.Mock;
    resolveClassViewAccessMode: jest.Mock;
  };

  const adminActor = {
    userId: 'user-admin-1',
    userEmail: 'admin@test.com',
    roleType: UserRole.admin,
  };

  const ownedIds = ['A', 'B', 'C'];

  function contentRow(id: string, sortOrder: number, title: string) {
    return {
      id,
      kind: 'content_item',
      sortOrder,
      hiddenAt: null,
      classContentItem: {
        id: `cci-${id}`,
        hiddenAt: null,
        openAt: null,
        durationMinutes: null,
        lesson: { id: `t-${id}`, title, kind: 'theory' },
      },
      session: null,
      classSurvey: null,
    };
  }

  beforeEach(() => {
    mockPrisma = {
      classTimelineItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      studentClass: { findFirst: jest.fn() },
      studentInfo: { findUnique: jest.fn() },
      class: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    staffAccess = {
      resolveClassViewerActor: jest.fn().mockResolvedValue({}),
      resolveClassViewAccessMode: jest.fn().mockResolvedValue('admin'),
    };
    service = new ClassTimelineService(mockPrisma as any, staffAccess as any);
  });

  it('rejects duplicate payload [A,A,B] for class {A,B,C}', async () => {
    mockPrisma.classTimelineItem.findMany.mockResolvedValue(
      ownedIds.map((id) => ({ id })),
    );

    await expect(
      service.reorder('cls-1', ['A', 'A', 'B'], adminActor),
    ).rejects.toThrow('Reorder payload contains duplicate IDs');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unknown id in an otherwise complete-length payload', async () => {
    mockPrisma.classTimelineItem.findMany.mockResolvedValue(
      ownedIds.map((id) => ({ id })),
    );

    await expect(
      service.reorder('cls-1', ['A', 'B', 'D'], adminActor),
    ).rejects.toThrow('Some IDs do not belong to this class timeline');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects payload that omits an owned item', async () => {
    mockPrisma.classTimelineItem.findMany.mockResolvedValue(
      ownedIds.map((id) => ({ id })),
    );

    await expect(
      service.reorder('cls-1', ['A', 'B'], adminActor),
    ).rejects.toThrow('Reorder must include every timeline item exactly once');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('persists unique complete order and returns items in that order', async () => {
    mockPrisma.classTimelineItem.findMany
      .mockResolvedValueOnce(ownedIds.map((id) => ({ id })))
      .mockResolvedValueOnce([
        contentRow('C', 0, 'C'),
        contentRow('A', 1, 'A'),
        contentRow('B', 2, 'B'),
      ]);

    const rows = await service.reorder('cls-1', ['C', 'A', 'B'], adminActor);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.class.update).toHaveBeenCalledWith({
      where: { id: 'cls-1' },
      data: { timelineCustomOrder: true },
    });
    expect(mockPrisma.classTimelineItem.update).toHaveBeenCalledWith({
      where: { id: 'C' },
      data: { sortOrder: 0 },
    });
    expect(mockPrisma.classTimelineItem.update).toHaveBeenCalledWith({
      where: { id: 'A' },
      data: { sortOrder: 1 },
    });
    expect(mockPrisma.classTimelineItem.update).toHaveBeenCalledWith({
      where: { id: 'B' },
      data: { sortOrder: 2 },
    });
    expect(rows.map((row) => row.id)).toEqual(['C', 'A', 'B']);
    expect(rows.map((row) => row.sortOrder)).toEqual([0, 1, 2]);
  });
});

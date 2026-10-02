jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('../../generated/client', () => ({
  Prisma: {},
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  LessonOutputDifficultyBand,
  LessonOutputStatus,
  LessonTaskPriority,
  LessonTaskStatus,
  PaymentStatus,
  StaffRole,
  StaffStatus,
  UserRole,
} from '../../generated/enums';
import { LessonService } from './lesson.service';

type LessonActorContextForTest = {
  staffId: string | null;
  staffRoles: StaffRole[];
  canManage: boolean;
  canParticipate: boolean;
};

type LessonServiceTestAccess = {
  resolveLessonActorContext: (
    ...args: unknown[]
  ) => Promise<LessonActorContextForTest>;
};

describe('LessonService', () => {
  const lessonStaffUserSelect = {
    first_name: true,
    last_name: true,
  } as const;

  const lessonStaffSelect = {
    id: true,
    user: {
      select: lessonStaffUserSelect,
    },
    roles: true,
    status: true,
  } as const;

  const mockPrisma = {
    lessonResource: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    lessonOutput: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    lessonTask: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    staffLessonTask: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    staffInfo: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    roleTaxDeductionRate: {
      findFirst: jest.fn(),
    },
    staffTaxDeductionOverride: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const actionHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };

  let service: LessonService;

  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.roleTaxDeductionRate.findFirst.mockResolvedValue(null);
    mockPrisma.staffTaxDeductionOverride.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(
      <T>(
        input: Array<Promise<T>> | ((db: typeof mockPrisma) => T | Promise<T>),
      ) => {
        if (typeof input === 'function') {
          return input(mockPrisma);
        }

        if (Array.isArray(input)) {
          return Promise.all(input);
        }

        return input;
      },
    );

    service = new LessonService(
      mockPrisma as never,
      actionHistoryService as never,
    );
  });

  it('treats linked staff.admin as full lesson manager access', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-admin-1',
      roles: [StaffRole.admin],
    });

    await expect(
      (service as unknown as LessonServiceTestAccess).resolveLessonActorContext(
        {
          id: 'student-staff-admin',
          email: 'student-staff-admin@example.com',
          accountHandle: 'student-staff-admin',
          roleType: UserRole.student,
        },
      ),
    ).resolves.toMatchObject({
      staffId: 'staff-admin-1',
      staffRoles: [StaffRole.admin],
      canManage: true,
      canParticipate: true,
    });
  });

  it('returns overview summary with normalized resources and tasks', async () => {
    mockPrisma.lessonResource.count.mockResolvedValue(4);
    mockPrisma.lessonTask.count
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    mockPrisma.lessonResource.findMany.mockResolvedValue([
      {
        id: 'resource-1',
        title: 'Bộ đề vòng loại',
        description: 'Tài liệu mở đầu',
        resourceLink: 'https://example.com/resource',
        tags: ['resource', '  math ', 123],
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-21T10:00:00.000Z'),
      },
    ]);
    mockPrisma.staffInfo.findMany.mockResolvedValue([
      {
        id: 'staff-1',
        fullName: 'Nguyen Van A',
        roles: ['lesson_plan'],
        status: 'active',
      },
    ]);
    mockPrisma.staffLessonTask.findMany.mockResolvedValue([
      {
        lessonTaskId: 'task-1',
        staff: {
          id: 'staff-1',
          fullName: 'Nguyen Van A',
          roles: ['lesson_plan'],
          status: 'active',
        },
      },
    ]);
    mockPrisma.lessonOutput.findMany.mockResolvedValue([
      {
        lessonTaskId: 'task-1',
        staffId: 'staff-1',
        staff: {
          id: 'staff-1',
          fullName: 'Nguyen Van A',
          roles: ['lesson_plan'],
          status: 'active',
        },
      },
    ]);
    mockPrisma.lessonTask.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Soạn slide',
        description: 'Phiên bản đầu',
        status: LessonTaskStatus.pending,
        priority: LessonTaskPriority.high,
        dueDate: new Date('2026-03-25T00:00:00.000Z'),
        createdBy: 'staff-1',
      },
    ]);

    const result = await service.getOverview({
      resourcePage: 1,
      resourceLimit: 6,
      taskPage: 1,
      taskLimit: 6,
    });

    expect(result.summary).toEqual({
      resourceCount: 4,
      taskCount: 7,
      openTaskCount: 3,
      completedTaskCount: 2,
    });
    expect(result.resources[0]).toEqual({
      id: 'resource-1',
      title: 'Bộ đề vòng loại',
      description: 'Tài liệu mở đầu',
      resourceLink: 'https://example.com/resource',
      tags: ['resource', 'math'],
      createdBy: null,
      createdAt: '2026-03-20T10:00:00.000Z',
      updatedAt: '2026-03-21T10:00:00.000Z',
    });
    expect(result.resourcesMeta).toEqual({
      total: 4,
      page: 1,
      limit: 6,
      totalPages: 1,
    });
    expect(mockPrisma.lessonResource.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 6,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    expect(result.tasks[0]).toEqual({
      id: 'task-1',
      title: 'Soạn slide',
      description: 'Phiên bản đầu',
      status: LessonTaskStatus.pending,
      priority: LessonTaskPriority.high,
      dueDate: '2026-03-25',
      createdByStaff: {
        id: 'staff-1',
        fullName: 'Nguyen Van A',
        roles: ['lesson_plan'],
        status: 'active',
      },
      assignees: [
        {
          id: 'staff-1',
          fullName: 'Nguyen Van A',
          roles: ['lesson_plan'],
          status: 'active',
        },
      ],
      outputAssignees: [
        {
          id: 'staff-1',
          fullName: 'Nguyen Van A',
          roles: ['lesson_plan'],
          status: 'active',
        },
      ],
    });
    expect(result.tasksMeta).toEqual({
      total: 7,
      page: 1,
      limit: 6,
      totalPages: 2,
    });
    expect(mockPrisma.lessonTask.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 6,
      orderBy: [
        { updatedAt: 'desc' },
        { status: 'asc' },
        { dueDate: 'asc' },
        { priority: 'desc' },
        { title: 'asc' },
      ],
    });
    expect(mockPrisma.staffLessonTask.findMany).toHaveBeenCalledWith({
      where: {
        lessonTaskId: {
          in: ['task-1'],
        },
      },
      select: {
        lessonTaskId: true,
        staff: {
          select: lessonStaffSelect,
        },
      },
    });
    expect(mockPrisma.lessonOutput.findMany).toHaveBeenCalledWith({
      where: {
        lessonTaskId: {
          in: ['task-1'],
        },
        staffId: {
          not: null,
        },
      },
      select: {
        lessonTaskId: true,
        staffId: true,
        staff: {
          select: lessonStaffSelect,
        },
      },
      distinct: ['lessonTaskId', 'staffId'],
    });
  });

  it('scopes overview to the participant lesson planner assignments', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });
    mockPrisma.lessonResource.count.mockResolvedValue(2);
    mockPrisma.lessonTask.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    mockPrisma.lessonResource.findMany.mockResolvedValue([
      {
        id: 'resource-participant-1',
        title: 'Bộ note task participant',
        description: 'Chỉ thuộc task participant',
        resourceLink: 'https://example.com/resource-participant-1',
        lessonTaskId: 'task-participant-1',
        tags: [' participant ', ' geometry '],
        createdBy: 'other-user',
        createdAt: new Date('2026-03-27T08:00:00.000Z'),
        updatedAt: new Date('2026-03-28T08:00:00.000Z'),
      },
      {
        id: 'resource-global-1',
        title: 'Tài nguyên tổng',
        description: 'Không gắn task participant',
        resourceLink: 'https://example.com/resource-global-1',
        lessonTaskId: null,
        tags: [' global '],
        createdBy: 'user-participant',
        createdAt: new Date('2026-03-26T08:00:00.000Z'),
        updatedAt: new Date('2026-03-29T08:00:00.000Z'),
      },
    ]);
    mockPrisma.lessonTask.findMany.mockResolvedValue([
      {
        id: 'task-participant-1',
        title: 'Soạn bài hình học',
        description: 'Theo task đã được gán',
        status: LessonTaskStatus.in_progress,
        priority: LessonTaskPriority.high,
        dueDate: new Date('2026-03-29T00:00:00.000Z'),
        createdBy: 'staff-owner',
      },
    ]);
    mockPrisma.staffInfo.findMany.mockResolvedValue([
      {
        id: 'staff-owner',
        fullName: 'Planner Owner',
        roles: ['lesson_plan_head'],
        status: 'active',
      },
      {
        id: 'staff-participant',
        fullName: 'Participant Planner',
        roles: ['lesson_plan'],
        status: 'active',
      },
    ]);
    mockPrisma.staffLessonTask.findMany.mockResolvedValue([
      {
        lessonTaskId: 'task-participant-1',
        staff: {
          id: 'staff-participant',
          fullName: 'Participant Planner',
          roles: ['lesson_plan'],
          status: 'active',
        },
      },
    ]);
    mockPrisma.lessonOutput.findMany.mockResolvedValue([
      {
        lessonTaskId: 'task-participant-1',
        staffId: 'staff-participant',
        staff: {
          id: 'staff-participant',
          fullName: 'Participant Planner',
          roles: ['lesson_plan'],
          status: 'active',
        },
      },
    ]);

    const result = await service.getOverview(
      {
        resourcePage: 1,
        resourceLimit: 6,
        taskPage: 1,
        taskLimit: 6,
      },
      {
        id: 'user-participant',
        email: 'participant@example.com',
        accountHandle: 'participant',
        roleType: 'staff',
      },
    );

    expect(result.summary).toEqual({
      resourceCount: 2,
      taskCount: 2,
      openTaskCount: 1,
      completedTaskCount: 1,
    });
    expect(result.resources).toEqual([
      {
        id: 'resource-participant-1',
        title: 'Bộ note task participant',
        description: 'Chỉ thuộc task participant',
        resourceLink: 'https://example.com/resource-participant-1',
        lessonTaskId: 'task-participant-1',
        tags: ['participant', 'geometry'],
        createdBy: 'other-user',
        createdAt: '2026-03-27T08:00:00.000Z',
        updatedAt: '2026-03-28T08:00:00.000Z',
      },
      {
        id: 'resource-global-1',
        title: 'Tài nguyên tổng',
        description: 'Không gắn task participant',
        resourceLink: 'https://example.com/resource-global-1',
        lessonTaskId: null,
        tags: ['global'],
        createdBy: 'user-participant',
        createdAt: '2026-03-26T08:00:00.000Z',
        updatedAt: '2026-03-29T08:00:00.000Z',
      },
    ]);
    expect(result.resourcesMeta).toEqual({
      total: 2,
      page: 1,
      limit: 6,
      totalPages: 1,
    });
    expect(result.tasksMeta).toEqual({
      total: 2,
      page: 1,
      limit: 6,
      totalPages: 1,
    });
    expect(mockPrisma.lessonResource.count).toHaveBeenCalledWith();
    expect(mockPrisma.lessonResource.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 6,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    expect(mockPrisma.lessonTask.count).toHaveBeenNthCalledWith(1, {
      where: {
        staffLessonTasks: {
          some: {
            staffId: 'staff-participant',
          },
        },
      },
    });
    expect(mockPrisma.lessonTask.findMany).toHaveBeenCalledWith({
      where: {
        staffLessonTasks: {
          some: {
            staffId: 'staff-participant',
          },
        },
      },
      skip: 0,
      take: 6,
      orderBy: [
        { updatedAt: 'desc' },
        { status: 'asc' },
        { dueDate: 'asc' },
        { priority: 'desc' },
        { title: 'asc' },
      ],
    });
  });

  it('allows overview for staff who has both lesson planner and accountant roles', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-mixed-role',
      roles: ['lesson_plan', 'accountant'],
    });
    mockPrisma.lessonResource.count.mockResolvedValue(1);
    mockPrisma.lessonTask.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    mockPrisma.lessonResource.findMany.mockResolvedValue([
      {
        id: 'resource-mixed-1',
        title: 'Checklist truyền đạt',
        description: 'Tài liệu trong task được giao',
        resourceLink: 'https://example.com/resource-mixed-1',
        lessonTaskId: 'task-mixed-1',
        tags: [' mixed ', ' overview '],
        createdAt: new Date('2026-03-29T08:00:00.000Z'),
        updatedAt: new Date('2026-03-29T09:00:00.000Z'),
      },
    ]);
    mockPrisma.lessonTask.findMany.mockResolvedValue([
      {
        id: 'task-mixed-1',
        title: 'Hoàn thiện outline',
        description: 'Task của staff role kép',
        status: LessonTaskStatus.in_progress,
        priority: LessonTaskPriority.medium,
        dueDate: new Date('2026-03-30T00:00:00.000Z'),
        createdBy: 'staff-owner',
      },
    ]);
    mockPrisma.staffInfo.findMany.mockResolvedValue([
      {
        id: 'staff-owner',
        fullName: 'Planner Owner',
        roles: ['lesson_plan_head'],
        status: 'active',
      },
      {
        id: 'staff-mixed-role',
        fullName: 'Mixed Planner',
        roles: ['lesson_plan', 'accountant'],
        status: 'active',
      },
    ]);
    mockPrisma.staffLessonTask.findMany.mockResolvedValue([
      {
        lessonTaskId: 'task-mixed-1',
        staff: {
          id: 'staff-mixed-role',
          fullName: 'Mixed Planner',
          roles: ['lesson_plan', 'accountant'],
          status: 'active',
        },
      },
    ]);
    mockPrisma.lessonOutput.findMany.mockResolvedValue([
      {
        lessonTaskId: 'task-mixed-1',
        staffId: 'staff-mixed-role',
        staff: {
          id: 'staff-mixed-role',
          fullName: 'Mixed Planner',
          roles: ['lesson_plan', 'accountant'],
          status: 'active',
        },
      },
    ]);

    const result = await service.getOverview(
      {
        resourcePage: 1,
        resourceLimit: 6,
        taskPage: 1,
        taskLimit: 6,
      },
      {
        id: 'user-mixed-role',
        email: 'mixed@example.com',
        accountHandle: 'mixed-role',
        roleType: UserRole.staff,
      },
    );

    expect(result.summary).toEqual({
      resourceCount: 1,
      taskCount: 1,
      openTaskCount: 1,
      completedTaskCount: 0,
    });
    expect(mockPrisma.lessonResource.count).toHaveBeenCalledWith();
    expect(mockPrisma.lessonTask.findMany).toHaveBeenCalledWith({
      where: {
        staffLessonTasks: {
          some: {
            staffId: 'staff-mixed-role',
          },
        },
      },
      skip: 0,
      take: 6,
      orderBy: [
        { updatedAt: 'desc' },
        { status: 'asc' },
        { dueDate: 'asc' },
        { priority: 'desc' },
        { title: 'asc' },
      ],
    });
  });

  it('returns work board outputs with task context', async () => {
    mockPrisma.lessonTask.count.mockResolvedValue(5);
    mockPrisma.lessonOutput.groupBy.mockResolvedValue([
      {
        status: LessonOutputStatus.pending,
        _count: 2,
      },
      {
        status: LessonOutputStatus.completed,
        _count: 1,
      },
    ]);
    mockPrisma.lessonOutput.findMany.mockResolvedValue([
      {
        id: 'output-1',
        lessonName: 'Bài 1',
        originalTitle: null,
        source: null,
        originalLink: null,
        level: null,
        tags: ['algebra'],
        cost: 0,
        lessonTaskId: 'task-work-1',
        contestUploaded: 'Vĩnh Phúc HSG 2024',
        status: LessonOutputStatus.completed,
        paymentStatus: PaymentStatus.paid,
        date: new Date('2026-03-22T00:00:00.000Z'),
        updatedAt: new Date('2026-03-22T08:00:00.000Z'),
        createdAt: new Date('2026-03-22T07:00:00.000Z'),
        link: 'https://example.com/output-1',
        staffId: 'staff-owner',
        staff: {
          id: 'staff-owner',
          fullName: 'Planner Owner',
          roles: ['lesson_plan_head'],
          status: 'active',
        },
        lessonTask: {
          id: 'task-work-1',
          title: 'Sinh test đề HSG Vĩnh Phúc',
          status: LessonTaskStatus.in_progress,
          priority: LessonTaskPriority.high,
        },
      },
    ]);

    const result = await service.getWork({
      page: 1,
      limit: 6,
    });

    expect(result.summary).toEqual({
      taskCount: 5,
      outputCount: 3,
      pendingOutputCount: 2,
      completedOutputCount: 1,
      cancelledOutputCount: 0,
    });
    expect(result.outputsMeta).toEqual({
      total: 3,
      page: 1,
      limit: 6,
      totalPages: 1,
    });
    expect(result.outputs[0]).toEqual({
      id: 'output-1',
      lessonName: 'Bài 1',
      contestUploaded: 'Vĩnh Phúc HSG 2024',
      date: '2026-03-22',
      staffId: 'staff-owner',
      staffDisplayName: 'Planner Owner',
      status: LessonOutputStatus.completed,
      paymentStatus: PaymentStatus.paid,
      updatedAt: '2026-03-22T08:00:00.000Z',
      tags: ['algebra'],
      level: null,
      link: 'https://example.com/output-1',
      originalLink: null,
      cost: 0,
      task: {
        id: 'task-work-1',
        title: 'Sinh test đề HSG Vĩnh Phúc',
        status: LessonTaskStatus.in_progress,
        priority: LessonTaskPriority.high,
      },
    });
    expect(mockPrisma.lessonOutput.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 6,
      orderBy: [{ updatedAt: 'desc' }, { date: 'desc' }, { lessonName: 'asc' }],
      where: undefined,
      include: {
        staff: {
          select: lessonStaffSelect,
        },
        lessonTask: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    });
  });

  it('scopes work board queries to the participant lesson planner assignments', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });
    mockPrisma.lessonTask.count.mockResolvedValue(2);
    mockPrisma.lessonOutput.groupBy.mockResolvedValue([
      {
        status: LessonOutputStatus.pending,
        _count: 1,
      },
    ]);
    mockPrisma.lessonOutput.findMany.mockResolvedValue([]);

    await service.getWork(
      {
        page: 1,
        limit: 10,
      },
      {
        id: 'user-participant',
        email: 'participant@example.com',
        accountHandle: 'participant',
        roleType: 'staff',
      },
    );

    const expectedTaskWhere = {
      staffLessonTasks: {
        some: {
          staffId: 'staff-participant',
        },
      },
    };
    const expectedOutputWhere = {
      lessonTask: expectedTaskWhere,
    };

    expect(mockPrisma.lessonTask.count).toHaveBeenCalledWith({
      where: expectedTaskWhere,
    });
    expect(mockPrisma.lessonOutput.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: expectedOutputWhere,
      orderBy: {
        status: 'asc',
      },
      _count: true,
    });
    expect(mockPrisma.lessonOutput.findMany).toHaveBeenCalledWith({
      where: expectedOutputWhere,
      skip: 0,
      take: 10,
      orderBy: [{ updatedAt: 'desc' }, { date: 'desc' }, { lessonName: 'asc' }],
      include: {
        staff: {
          select: lessonStaffSelect,
        },
        lessonTask: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    });
  });

  it('uses accountant scope for work board when staff has both lesson planner and expense accountant roles', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-mixed-role',
      roles: ['lesson_plan', 'accountant_expense'],
    });
    mockPrisma.lessonTask.count.mockResolvedValue(5);
    mockPrisma.lessonOutput.groupBy.mockResolvedValue([
      {
        status: LessonOutputStatus.pending,
        _count: 2,
      },
      {
        status: LessonOutputStatus.completed,
        _count: 1,
      },
    ]);
    mockPrisma.lessonOutput.findMany.mockResolvedValue([]);

    await service.getWork(
      {
        page: 1,
        limit: 10,
      },
      {
        id: 'user-mixed-role',
        email: 'mixed@example.com',
        accountHandle: 'mixed-role',
        roleType: UserRole.staff,
      },
    );

    expect(mockPrisma.lessonTask.count).toHaveBeenCalledWith({
      where: undefined,
    });
    expect(mockPrisma.lessonOutput.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: undefined,
      orderBy: {
        status: 'asc',
      },
      _count: true,
    });
    expect(mockPrisma.lessonOutput.findMany).toHaveBeenCalledWith({
      where: undefined,
      skip: 0,
      take: 10,
      orderBy: [{ updatedAt: 'desc' }, { date: 'desc' }, { lessonName: 'asc' }],
      include: {
        staff: {
          select: lessonStaffSelect,
        },
        lessonTask: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    });
  });

  it('returns lesson output stats for one staff in the recent window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-23T10:00:00.000Z'));

    try {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-owner',
        fullName: 'Planner Owner',
        roles: ['lesson_plan'],
        status: 'active',
      });
      mockPrisma.lessonOutput.count.mockResolvedValue(3);
      mockPrisma.lessonOutput.groupBy.mockResolvedValue([
        {
          status: LessonOutputStatus.pending,
          _count: 2,
        },
        {
          status: LessonOutputStatus.completed,
          _count: 1,
        },
      ]);
      mockPrisma.lessonOutput.aggregate.mockResolvedValue({
        _sum: {
          cost: 180000,
        },
      });
      mockPrisma.lessonOutput.findMany.mockResolvedValue([
        {
          id: 'output-1',
          lessonName: 'Bài 1',
          originalTitle: null,
          source: null,
          originalLink: null,
          level: '3',
          tags: ['checker'],
          cost: 180000,
          lessonTaskId: 'task-1',
          contestUploaded: 'HSG 2026',
          status: LessonOutputStatus.pending,
          paymentStatus: PaymentStatus.pending,
          date: new Date('2026-03-22T00:00:00.000Z'),
          updatedAt: new Date('2026-03-22T08:00:00.000Z'),
          createdAt: new Date('2026-03-22T07:00:00.000Z'),
          link: 'https://example.com/output-1',
          staffId: 'staff-owner',
          staff: {
            id: 'staff-owner',
            fullName: 'Planner Owner',
            roles: ['lesson_plan'],
            status: 'active',
          },
          lessonTask: {
            id: 'task-1',
            title: 'Sinh đề',
            status: LessonTaskStatus.in_progress,
            priority: LessonTaskPriority.high,
          },
        },
      ]);

      const result = await service.getOutputStatsByStaff('staff-owner', {
        days: 30,
      });

      expect(result.summary).toEqual({
        days: 30,
        staff: {
          id: 'staff-owner',
          fullName: 'Planner Owner',
          roles: ['lesson_plan'],
          status: 'active',
        },
        outputCount: 3,
        pendingOutputCount: 2,
        completedOutputCount: 1,
        cancelledOutputCount: 0,
        unpaidCostTotal: 180000,
      });
      expect(result.outputs).toEqual([
        {
          id: 'output-1',
          lessonName: 'Bài 1',
          contestUploaded: 'HSG 2026',
          date: '2026-03-22',
          staffId: 'staff-owner',
          staffDisplayName: 'Planner Owner',
          status: LessonOutputStatus.pending,
          paymentStatus: PaymentStatus.pending,
          updatedAt: '2026-03-22T08:00:00.000Z',
          tags: ['checker'],
          level: '3',
          link: 'https://example.com/output-1',
          originalLink: null,
          cost: 180000,
          task: {
            id: 'task-1',
            title: 'Sinh đề',
            status: LessonTaskStatus.in_progress,
            priority: LessonTaskPriority.high,
          },
        },
      ]);
      expect(mockPrisma.lessonOutput.count).toHaveBeenCalledWith({
        where: {
          staffId: 'staff-owner',
          date: {
            gte: new Date('2026-02-21T17:00:00.000Z'),
            lt: new Date('2026-03-23T17:00:00.000Z'),
          },
        },
      });
      expect(mockPrisma.lessonOutput.findMany).toHaveBeenCalledWith({
        where: {
          staffId: 'staff-owner',
          date: {
            gte: new Date('2026-02-21T17:00:00.000Z'),
            lt: new Date('2026-03-23T17:00:00.000Z'),
          },
        },
        orderBy: [
          { date: 'desc' },
          { updatedAt: 'desc' },
          { lessonName: 'asc' },
        ],
        include: {
          staff: {
            select: lessonStaffSelect,
          },
          lessonTask: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
            },
          },
        },
      });
      expect(mockPrisma.lessonOutput.aggregate).toHaveBeenCalledWith({
        where: {
          staffId: 'staff-owner',
          date: {
            gte: new Date('2026-02-21T17:00:00.000Z'),
            lt: new Date('2026-03-23T17:00:00.000Z'),
          },
          paymentStatus: PaymentStatus.pending,
        },
        _sum: {
          cost: true,
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('applies work filters to counts and list queries', async () => {
    mockPrisma.lessonTask.count.mockResolvedValue(2);
    mockPrisma.lessonOutput.groupBy.mockResolvedValue([
      {
        status: LessonOutputStatus.pending,
        _count: 1,
      },
    ]);
    mockPrisma.lessonOutput.findMany.mockResolvedValue([]);

    await service.getWork({
      page: 1,
      limit: 10,
      year: 2026,
      month: 3,
      search: 'hsg',
      tag: 'checker',
      staffId: 'staff-owner',
      outputStatus: 'pending',
      level: '3',
    });

    const expectedWhere = {
      AND: [
        {
          date: {
            gte: new Date('2026-03-01T00:00:00.000Z'),
            lte: new Date('2026-03-31T00:00:00.000Z'),
          },
        },
        {
          OR: [
            { lessonName: { contains: 'hsg', mode: 'insensitive' } },
            { contestUploaded: { contains: 'hsg', mode: 'insensitive' } },
          ],
        },
        {
          OR: [
            { lessonName: { contains: 'checker', mode: 'insensitive' } },
            { contestUploaded: { contains: 'checker', mode: 'insensitive' } },
          ],
        },
        { staffId: 'staff-owner' },
        { status: LessonOutputStatus.pending },
        {
          OR: [
            { level: { equals: 'Level 3', mode: 'insensitive' } },
            { level: { equals: '3', mode: 'insensitive' } },
          ],
        },
      ],
    };

    expect(mockPrisma.lessonOutput.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: expectedWhere,
      orderBy: {
        status: 'asc',
      },
      _count: true,
    });
    expect(mockPrisma.lessonOutput.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      skip: 0,
      take: 10,
      orderBy: [{ updatedAt: 'desc' }, { date: 'desc' }, { lessonName: 'asc' }],
      include: {
        staff: {
          select: lessonStaffSelect,
        },
        lessonTask: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    });
  });

  it('creates task without storing actor staff as legacy task staff', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({ id: 'staff-creator' });
    mockPrisma.lessonTask.create.mockResolvedValue({ id: 'task-1' });
    mockPrisma.staffInfo.findMany.mockResolvedValue([]);
    mockPrisma.lessonOutput.findMany.mockResolvedValue([]);
    mockPrisma.staffLessonTask.findMany.mockResolvedValue([]);
    mockPrisma.lessonTask.findUnique.mockResolvedValue({
      id: 'task-1',
      title: 'Soạn outline buổi 1',
      description: 'Checklist phần mở đầu',
      status: LessonTaskStatus.pending,
      priority: LessonTaskPriority.medium,
      dueDate: new Date('2026-03-24T00:00:00.000Z'),
      createdBy: null,
    });

    await service.createTask(
      {
        title: '  Soạn outline buổi 1  ',
        description: '  Checklist phần mở đầu ',
        dueDate: '2026-03-24',
      },
      {
        userId: 'user-1',
        userEmail: 'planner@example.com',
        roleType: 'admin',
      },
    );

    expect(mockPrisma.lessonTask.create).toHaveBeenCalledWith({
      data: {
        title: 'Soạn outline buổi 1',
        description: 'Checklist phần mở đầu',
        status: LessonTaskStatus.pending,
        priority: LessonTaskPriority.medium,
        dueDate: new Date('2026-03-24T00:00:00.000Z'),
      },
    });
    expect(mockPrisma.staffLessonTask.createMany).not.toHaveBeenCalled();
    expect(actionHistoryService.recordCreate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'lesson_task',
        entityId: 'task-1',
      }),
    );
  });

  it('maps provided legacy task staff into task assignees on creation', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-head' });
    mockPrisma.lessonTask.create.mockResolvedValue({ id: 'task-2' });
    mockPrisma.staffInfo.findMany.mockResolvedValue([
      {
        id: 'staff-head',
        fullName: 'Lesson Head',
        roles: ['lesson_plan_head'],
        status: 'active',
      },
    ]);
    mockPrisma.lessonOutput.findMany.mockResolvedValue([]);
    mockPrisma.staffLessonTask.findMany.mockResolvedValue([]);
    mockPrisma.lessonTask.findUnique.mockResolvedValue({
      id: 'task-2',
      title: 'Chốt flow biên tập',
      description: null,
      status: LessonTaskStatus.pending,
      priority: LessonTaskPriority.high,
      dueDate: null,
      createdBy: null,
    });

    await service.createTask(
      {
        title: 'Chốt flow biên tập',
        createdByStaffId: 'staff-head',
      },
      {
        userId: 'user-1',
        userEmail: 'planner@example.com',
        roleType: 'admin',
      },
    );

    expect(mockPrisma.lessonTask.create).toHaveBeenCalledWith({
      data: {
        title: 'Chốt flow biên tập',
        description: null,
        status: LessonTaskStatus.pending,
        priority: LessonTaskPriority.medium,
        dueDate: null,
      },
    });
    expect(mockPrisma.staffLessonTask.createMany).toHaveBeenCalledWith({
      data: [
        {
          lessonTaskId: 'task-2',
          staffId: 'staff-head',
        },
      ],
    });
  });

  it('filters lesson task staff options to lesson planning roles only', async () => {
    mockPrisma.staffInfo.findMany.mockResolvedValue([
      {
        id: 'staff-1',
        fullName: 'Lesson Planner',
        roles: ['lesson_plan'],
        status: 'active',
      },
    ]);

    await service.searchTaskStaffOptions({
      search: 'planner',
      limit: 3,
    });

    expect(mockPrisma.staffInfo.findMany).toHaveBeenCalledWith({
      where: {
        roles: {
          hasSome: ['lesson_plan', 'lesson_plan_head'],
        },
        OR: [
          {
            user: {
              first_name: {
                contains: 'planner',
                mode: 'insensitive',
              },
            },
          },
          {
            user: {
              last_name: {
                contains: 'planner',
                mode: 'insensitive',
              },
            },
          },
        ],
      },
      select: {
        id: true,
        user: {
          select: lessonStaffUserSelect,
        },
        roles: true,
        status: true,
      },
      orderBy: [
        { status: 'asc' },
        { user: { last_name: 'asc' } },
        { user: { first_name: 'asc' } },
      ],
      take: 3,
    });
  });

  it('limits task option search to tasks assigned to the participant lesson planner', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });
    mockPrisma.lessonTask.findMany.mockResolvedValue([]);

    await service.searchTaskOptions(
      {
        search: 'slide',
        limit: 4,
      },
      {
        id: 'user-participant',
        email: 'participant@example.com',
        accountHandle: 'participant',
        roleType: 'staff',
      },
    );

    expect(mockPrisma.lessonTask.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            staffLessonTasks: {
              some: {
                staffId: 'staff-participant',
              },
            },
          },
          {
            title: {
              contains: 'slide',
              mode: 'insensitive',
            },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { dueDate: 'asc' }],
      take: 4,
    });
  });

  it('normalizes legacy output staff into task assignees when editing task without assignee payload', async () => {
    mockPrisma.lessonTask.findUnique
      .mockResolvedValueOnce({
        id: 'task-1',
        title: 'Soạn slide',
        description: 'Bản cũ',
        status: LessonTaskStatus.pending,
        priority: LessonTaskPriority.medium,
        dueDate: null,
        createdBy: null,
      })
      .mockResolvedValueOnce({
        id: 'task-1',
        title: 'Soạn slide',
        description: 'Bản mới',
        status: LessonTaskStatus.pending,
        priority: LessonTaskPriority.medium,
        dueDate: null,
        createdBy: null,
      });
    mockPrisma.staffLessonTask.findMany.mockResolvedValue([]);
    mockPrisma.lessonOutput.findMany.mockResolvedValue([
      {
        lessonTaskId: 'task-1',
        staffId: 'staff-2',
        staff: {
          id: 'staff-2',
          fullName: 'Planner 02',
          roles: ['lesson_plan'],
          status: 'active',
        },
      },
    ]);

    await service.updateTask('task-1', {
      description: ' Bản mới ',
    });

    expect(mockPrisma.lessonTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: {
        description: 'Bản mới',
        createdByStaff: {
          disconnect: true,
        },
      },
    });
    expect(mockPrisma.staffLessonTask.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.staffLessonTask.createMany).toHaveBeenCalledWith({
      data: [
        {
          lessonTaskId: 'task-1',
          staffId: 'staff-2',
        },
      ],
    });
  });

  it('returns a hydrated lesson task detail by id', async () => {
    mockPrisma.staffInfo.findMany.mockResolvedValue([
      {
        id: 'staff-creator',
        fullName: 'Planner Owner',
        roles: ['lesson_plan'],
        status: 'active',
      },
    ]);
    mockPrisma.staffLessonTask.findMany.mockResolvedValue([
      {
        lessonTaskId: 'task-3',
        staff: {
          id: 'staff-assignee',
          fullName: 'Planner Assignee',
          roles: ['lesson_plan'],
          status: 'active',
        },
      },
    ]);
    mockPrisma.lessonTask.findUnique.mockResolvedValue({
      id: 'task-3',
      title: 'Review final slide',
      description: 'Kiểm tra lần cuối trước khi xuất bản',
      status: LessonTaskStatus.in_progress,
      priority: LessonTaskPriority.high,
      dueDate: new Date('2026-03-27T00:00:00.000Z'),
      createdBy: 'staff-creator',
    });
    mockPrisma.lessonOutput.findMany
      .mockResolvedValueOnce([
        {
          lessonTaskId: 'task-3',
          staffId: 'staff-output',
          staff: {
            id: 'staff-output',
            fullName: 'Planner Payment',
            roles: ['lesson_plan_head'],
            status: 'active',
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'output-1',
          lessonTaskId: 'task-3',
          lessonName: 'Bài 1',
          originalTitle: 'Đề gốc bài 1',
          source: 'Vĩnh Phúc HSG 2024',
          originalLink: 'https://example.com/original-1',
          level: 'HSG tỉnh',
          tags: ['hsg'],
          cost: 100000,
          date: new Date('2026-03-27T00:00:00.000Z'),
          contestUploaded: 'Vĩnh Phúc HSG 2024',
          link: 'https://example.com/output-1',
          staffId: 'staff-creator',
          status: LessonOutputStatus.completed,
          paymentStatus: PaymentStatus.paid,
          createdAt: new Date('2026-03-27T02:00:00.000Z'),
          updatedAt: new Date('2026-03-27T03:00:00.000Z'),
          staff: {
            id: 'staff-creator',
            fullName: 'Planner Owner',
            roles: ['lesson_plan'],
            status: 'active',
          },
          lessonTask: {
            id: 'task-3',
            title: 'Review final slide',
            status: LessonTaskStatus.in_progress,
            priority: LessonTaskPriority.high,
          },
        },
      ]);
    mockPrisma.lessonResource.findMany.mockResolvedValue([
      {
        id: 'resource-10',
        title: 'Đề gốc',
        resourceLink: 'https://example.com/resource-10',
      },
    ]);

    const result = await service.getTaskById('task-3');

    expect(result).toEqual({
      id: 'task-3',
      title: 'Review final slide',
      description: 'Kiểm tra lần cuối trước khi xuất bản',
      status: LessonTaskStatus.in_progress,
      priority: LessonTaskPriority.high,
      dueDate: '2026-03-27',
      createdByStaff: {
        id: 'staff-creator',
        fullName: 'Planner Owner',
        roles: ['lesson_plan'],
        status: 'active',
      },
      assignees: [
        {
          id: 'staff-assignee',
          fullName: 'Planner Assignee',
          roles: ['lesson_plan'],
          status: 'active',
        },
        {
          id: 'staff-creator',
          fullName: 'Planner Owner',
          roles: ['lesson_plan'],
          status: 'active',
        },
        {
          id: 'staff-output',
          fullName: 'Planner Payment',
          roles: ['lesson_plan_head'],
          status: 'active',
        },
      ],
      outputAssignees: [
        {
          id: 'staff-output',
          fullName: 'Planner Payment',
          roles: ['lesson_plan_head'],
          status: 'active',
        },
      ],
      outputs: [
        {
          id: 'output-1',
          lessonName: 'Bài 1',
          contestUploaded: 'Vĩnh Phúc HSG 2024',
          date: '2026-03-27',
          staffId: 'staff-creator',
          staffDisplayName: 'Planner Owner',
          status: LessonOutputStatus.completed,
          paymentStatus: PaymentStatus.paid,
        },
      ],
      outputProgress: {
        total: 1,
        completed: 1,
      },
      resourcePreview: [
        {
          id: 'resource-10',
          title: 'Đề gốc',
          resourceLink: 'https://example.com/resource-10',
        },
      ],
      contestUploadedSummary: ['Vĩnh Phúc HSG 2024'],
    });
  });

  it('only returns task detail when the participant lesson planner is assigned to that task', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });
    mockPrisma.lessonTask.findFirst.mockResolvedValue(null);

    await expect(
      service.getTaskById('task-locked', {
        id: 'user-participant',
        email: 'participant@example.com',
        accountHandle: 'participant',
        roleType: 'staff',
      }),
    ).rejects.toThrow('Lesson task not found');

    expect(mockPrisma.lessonTask.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'task-locked',
        staffLessonTasks: {
          some: {
            staffId: 'staff-participant',
          },
        },
      },
    });
  });

  it('rejects legacy task staff outside lesson planning roles', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue(null);

    await expect(
      service.createTask(
        {
          title: 'Soạn outline buổi 2',
          createdByStaffId: 'staff-other',
        },
        {
          userId: 'user-1',
          userEmail: 'planner@example.com',
          roleType: 'admin',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockPrisma.staffInfo.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'staff-other',
        roles: {
          hasSome: ['lesson_plan', 'lesson_plan_head'],
        },
        status: StaffStatus.active,
      },
      select: {
        id: true,
        status: true,
      },
    });
  });

  it('requires legacy task staff to be active', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue(null);

    await expect(
      service.createTask(
        {
          title: 'Soạn outline buổi 2',
          createdByStaffId: 'staff-inactive',
        },
        {
          userId: 'user-1',
          userEmail: 'planner@example.com',
          roleType: 'admin',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockPrisma.staffInfo.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'staff-inactive',
        roles: {
          hasSome: ['lesson_plan', 'lesson_plan_head'],
        },
        status: StaffStatus.active,
      },
      select: {
        id: true,
        status: true,
      },
    });
  });

  it('rejects inactive lesson task assignees', async () => {
    mockPrisma.staffInfo.findMany.mockResolvedValue([
      {
        id: 'staff-inactive',
        roles: [StaffRole.lesson_plan],
        status: StaffStatus.inactive,
      },
    ]);

    await expect(
      service.createTask(
        {
          title: 'Soạn outline buổi 3',
          assigneeStaffIds: ['staff-inactive'],
        },
        {
          userId: 'user-1',
          userEmail: 'planner@example.com',
          roleType: 'admin',
        },
      ),
    ).rejects.toThrow('Nhân sự đang ở trạng thái ngừng hoạt động.');
  });

  it('forces participant output creation onto their own assigned task and staff profile', async () => {
    mockPrisma.staffInfo.findUnique
      .mockResolvedValueOnce({
        id: 'staff-participant',
        roles: ['lesson_plan'],
      })
      .mockResolvedValueOnce({
        id: 'staff-participant',
      });
    mockPrisma.lessonTask.findUnique.mockResolvedValue({ id: 'task-output-1' });
    mockPrisma.lessonTask.findFirst.mockResolvedValue({ id: 'task-output-1' });
    mockPrisma.staffLessonTask.findMany.mockResolvedValue([]);
    mockPrisma.lessonOutput.findMany.mockResolvedValue([
      {
        lessonTaskId: 'task-output-1',
        staffId: 'staff-participant',
      },
    ]);
    mockPrisma.lessonOutput.create.mockResolvedValue({
      id: 'output-participant-1',
      lessonTaskId: 'task-output-1',
      lessonName: 'Bài do participant tạo',
      originalTitle: null,
      source: null,
      originalLink: null,
      level: null,
      tags: [],
      cost: 90000,
      date: new Date('2026-03-28T00:00:00.000Z'),
      contestUploaded: null,
      link: null,
      staffId: 'staff-participant',
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-03-28T08:00:00.000Z'),
      updatedAt: new Date('2026-03-28T09:00:00.000Z'),
      staff: {
        id: 'staff-participant',
        fullName: 'Participant Planner',
        roles: ['lesson_plan'],
        status: 'active',
      },
      lessonTask: {
        id: 'task-output-1',
        title: 'Task participant',
        status: LessonTaskStatus.in_progress,
        priority: LessonTaskPriority.medium,
      },
    });

    await service.createOutput(
      {
        lessonTaskId: 'task-output-1',
        lessonName: 'Bài do participant tạo',
        date: '2026-03-28',
        cost: 90000,
        paymentStatus: PaymentStatus.paid,
        staffId: 'staff-other',
      },
      undefined,
      {
        id: 'user-participant',
        email: 'participant@example.com',
        accountHandle: 'participant',
        roleType: 'staff',
      },
    );

    expect(mockPrisma.lessonTask.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'task-output-1',
        staffLessonTasks: {
          some: {
            staffId: 'staff-participant',
          },
        },
      },
      select: {
        id: true,
      },
    });
    const expectedCreateInput = expect.objectContaining({
      data: expect.objectContaining({
        lessonTaskId: 'task-output-1',
        staffId: 'staff-participant',
        paymentStatus: PaymentStatus.pending,
      }) as unknown,
    }) as unknown;

    expect(mockPrisma.lessonOutput.create).toHaveBeenCalledWith(
      expectedCreateInput,
    );
  });

  it('rejects participant output creation when no parent task is provided', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });

    await expect(
      service.createOutput(
        {
          lessonName: 'Taskless output',
          date: '2026-03-28',
        },
        undefined,
        {
          id: 'user-participant',
          email: 'participant@example.com',
          accountHandle: 'participant',
          roleType: 'staff',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockPrisma.lessonTask.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.lessonOutput.create).not.toHaveBeenCalled();
  });

  it('creates a lesson output under a task without mutating task assignees', async () => {
    mockPrisma.lessonTask.findUnique.mockResolvedValue({ id: 'task-output-1' });
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-output-1',
      status: StaffStatus.active,
    });
    mockPrisma.staffLessonTask.findMany.mockResolvedValue([]);
    mockPrisma.lessonOutput.findMany.mockResolvedValue([
      {
        lessonTaskId: 'task-output-1',
        staffId: 'staff-output-1',
      },
    ]);
    mockPrisma.lessonOutput.create.mockResolvedValue({
      id: 'output-99',
      lessonTaskId: 'task-output-1',
      lessonName: 'Bài 2 - Hình học',
      originalTitle: 'Đề gốc bài 2',
      source: 'Vĩnh Phúc HSG 2024',
      originalLink: 'https://example.com/original-output',
      level: 'HSG tỉnh',
      tags: ['hsg', 'hinh-hoc'],
      cost: 0,
      date: new Date('2026-03-28T00:00:00.000Z'),
      contestUploaded: 'Vĩnh Phúc HSG 2024',
      link: 'https://example.com/final-output',
      staffId: 'staff-output-1',
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-03-28T08:00:00.000Z'),
      updatedAt: new Date('2026-03-28T09:00:00.000Z'),
      staff: {
        id: 'staff-output-1',
        fullName: 'Output Owner',
        roles: ['lesson_plan'],
        status: 'active',
      },
      lessonTask: {
        id: 'task-output-1',
        title: 'Sinh test đề',
        status: LessonTaskStatus.in_progress,
        priority: LessonTaskPriority.high,
      },
    });

    const result = await service.createOutput(
      {
        lessonTaskId: 'task-output-1',
        lessonName: '  Bài 2 - Hình học  ',
        originalTitle: '  Đề gốc bài 2 ',
        source: '  Vĩnh Phúc HSG 2024 ',
        originalLink: 'https://example.com/original-output',
        level: ' HSG tỉnh ',
        tags: ['hsg', '  hinh-hoc  '],
        cost: 250000,
        date: '2026-03-28',
        contestUploaded: '  Vĩnh Phúc HSG 2024 ',
        link: 'https://example.com/final-output',
        staffId: 'staff-output-1',
      },
      {
        userId: 'user-1',
        userEmail: 'planner@example.com',
        roleType: 'admin',
      },
    );

    expect(mockPrisma.lessonOutput.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          lessonTaskId: 'task-output-1',
          lessonName: 'Bài 2 - Hình học',
          originalTitle: 'Đề gốc bài 2',
          source: 'Vĩnh Phúc HSG 2024',
          originalLink: 'https://example.com/original-output',
          level: 'HSG tỉnh',
          difficultyBand: null,
          includesTest: false,
          includesSolution: false,
          includesLectureVideo: false,
          tags: ['hsg', 'hinh-hoc'],
          cost: 0,
          paymentStatus: PaymentStatus.pending,
          date: new Date('2026-03-28T00:00:00.000Z'),
          contestUploaded: 'Vĩnh Phúc HSG 2024',
          link: 'https://example.com/final-output',
          staffId: 'staff-output-1',
          roleType: null,
          status: LessonOutputStatus.pending,
          taxDeductionRatePercent: 0,
        },
      }),
    );
    expect(mockPrisma.staffLessonTask.createMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'output-99',
      lessonTaskId: 'task-output-1',
      lessonName: 'Bài 2 - Hình học',
      originalTitle: 'Đề gốc bài 2',
      source: 'Vĩnh Phúc HSG 2024',
      originalLink: 'https://example.com/original-output',
      level: 'HSG tỉnh',
      difficultyBand: null,
      includesTest: false,
      includesSolution: false,
      includesLectureVideo: false,
      tags: ['hsg', 'hinh-hoc'],
      cost: 0,
      date: '2026-03-28',
      contestUploaded: 'Vĩnh Phúc HSG 2024',
      link: 'https://example.com/final-output',
      staffId: 'staff-output-1',
      staff: {
        id: 'staff-output-1',
        fullName: 'Output Owner',
        roles: ['lesson_plan'],
        status: 'active',
      },
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      task: {
        id: 'task-output-1',
        title: 'Sinh test đề',
        status: LessonTaskStatus.in_progress,
        priority: LessonTaskPriority.high,
      },
      createdAt: '2026-03-28T08:00:00.000Z',
      updatedAt: '2026-03-28T09:00:00.000Z',
    });
    expect(actionHistoryService.recordCreate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'lesson_output',
        entityId: 'output-99',
      }),
    );
  });

  it('creates a taskless lesson output when lessonTaskId is omitted', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue(null);
    mockPrisma.lessonOutput.create.mockResolvedValue({
      id: 'output-taskless-1',
      lessonTaskId: null,
      lessonName: 'Bài lẻ',
      originalTitle: null,
      source: 'Codeforces',
      originalLink: 'https://example.com/original-taskless',
      level: 'Level 5',
      tags: ['checker'],
      cost: 0,
      date: new Date('2026-03-29T00:00:00.000Z'),
      contestUploaded: null,
      link: null,
      staffId: null,
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-03-29T08:00:00.000Z'),
      updatedAt: new Date('2026-03-29T08:30:00.000Z'),
      staff: null,
      lessonTask: null,
    });

    const result = await service.createOutput({
      lessonName: '  Bài lẻ ',
      source: ' Codeforces ',
      originalLink: 'https://example.com/original-taskless',
      level: ' Level 5 ',
      tags: [' checker '],
      date: '2026-03-29',
      staffId: null,
    });

    expect(mockPrisma.lessonTask.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.lessonOutput.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          lessonTaskId: null,
          lessonName: 'Bài lẻ',
          originalTitle: null,
          source: 'Codeforces',
          originalLink: 'https://example.com/original-taskless',
          level: 'Level 5',
          difficultyBand: null,
          includesTest: false,
          includesSolution: false,
          includesLectureVideo: false,
          tags: ['checker'],
          cost: 0,
          paymentStatus: PaymentStatus.pending,
          date: new Date('2026-03-29T00:00:00.000Z'),
          contestUploaded: null,
          link: null,
          staffId: null,
          roleType: null,
          status: LessonOutputStatus.pending,
          taxDeductionRatePercent: 0,
        },
      }),
    );
    expect(result).toEqual({
      id: 'output-taskless-1',
      lessonTaskId: null,
      lessonName: 'Bài lẻ',
      originalTitle: null,
      source: 'Codeforces',
      originalLink: 'https://example.com/original-taskless',
      level: 'Level 5',
      difficultyBand: null,
      includesTest: false,
      includesSolution: false,
      includesLectureVideo: false,
      tags: ['checker'],
      cost: 0,
      date: '2026-03-29',
      contestUploaded: null,
      link: null,
      staffId: null,
      staff: null,
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      task: null,
      createdAt: '2026-03-29T08:00:00.000Z',
      updatedAt: '2026-03-29T08:30:00.000Z',
    });
  });

  it('disconnects a lesson output from its task when lessonTaskId is null on update', async () => {
    mockPrisma.lessonOutput.findUnique
      .mockResolvedValueOnce({
        id: 'output-42',
        lessonTaskId: 'task-output-42',
        lessonName: 'Bài đang gắn task',
        originalTitle: null,
        source: null,
        originalLink: null,
        level: null,
        tags: [],
        cost: 0,
        date: new Date('2026-03-30T00:00:00.000Z'),
        contestUploaded: null,
        link: null,
        staffId: null,
        status: LessonOutputStatus.pending,
        paymentStatus: PaymentStatus.pending,
        createdAt: new Date('2026-03-30T08:00:00.000Z'),
        updatedAt: new Date('2026-03-30T08:30:00.000Z'),
        staff: null,
        lessonTask: {
          id: 'task-output-42',
          title: 'Task cũ',
          status: LessonTaskStatus.pending,
          priority: LessonTaskPriority.medium,
        },
      })
      .mockResolvedValueOnce({
        id: 'output-42',
        lessonTaskId: null,
        lessonName: 'Bài đang gắn task',
        originalTitle: null,
        source: null,
        originalLink: null,
        level: null,
        tags: [],
        cost: 0,
        date: new Date('2026-03-30T00:00:00.000Z'),
        contestUploaded: null,
        link: null,
        staffId: null,
        status: LessonOutputStatus.pending,
        paymentStatus: PaymentStatus.pending,
        createdAt: new Date('2026-03-30T08:00:00.000Z'),
        updatedAt: new Date('2026-03-30T09:00:00.000Z'),
        staff: null,
        lessonTask: null,
      });
    mockPrisma.lessonOutput.update.mockResolvedValue({
      id: 'output-42',
      lessonTaskId: null,
      lessonName: 'Bài đang gắn task',
      originalTitle: null,
      source: null,
      originalLink: null,
      level: null,
      tags: [],
      cost: 0,
      date: new Date('2026-03-30T00:00:00.000Z'),
      contestUploaded: null,
      link: null,
      staffId: null,
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-03-30T08:00:00.000Z'),
      updatedAt: new Date('2026-03-30T09:00:00.000Z'),
      staff: null,
      lessonTask: null,
    });
    const result = await service.updateOutput('output-42', {
      lessonTaskId: null,
    });

    expect(mockPrisma.lessonOutput.update).toHaveBeenCalledWith({
      where: { id: 'output-42' },
      data: {
        lessonTask: {
          disconnect: true,
        },
        roleType: null,
        taxDeductionRatePercent: 0,
      },
      include: {
        staff: {
          select: lessonStaffSelect,
        },
        lessonTask: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    });
    expect(mockPrisma.staffLessonTask.deleteMany).not.toHaveBeenCalled();
    expect(result.task).toBeNull();
    expect(result.lessonTaskId).toBeNull();
  });

  it('loads lesson output detail for participant when the output belongs to an assigned task', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });
    mockPrisma.lessonOutput.findFirst.mockResolvedValue({
      id: 'output-participant-1',
      lessonTaskId: 'task-participant-1',
      lessonName: 'Bài participant',
      originalTitle: 'Bản gốc',
      source: 'Codeforces',
      originalLink: 'https://example.com/original',
      level: 'Level 2',
      tags: [' graph '],
      cost: 120000,
      date: new Date('2026-03-31T00:00:00.000Z'),
      contestUploaded: 'ABC 123',
      link: 'https://example.com/output',
      staffId: 'staff-output-1',
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-03-31T08:00:00.000Z'),
      updatedAt: new Date('2026-03-31T09:30:00.000Z'),
      staff: {
        id: 'staff-output-1',
        fullName: 'Nguyen Van B',
        roles: ['lesson_plan'],
        status: 'active',
      },
      lessonTask: {
        id: 'task-participant-1',
        title: 'Task participant',
        status: LessonTaskStatus.in_progress,
        priority: LessonTaskPriority.high,
      },
    });

    const result = await service.getOutputById('output-participant-1', {
      id: 'user-participant',
      roleType: UserRole.staff,
    } as never);

    expect(mockPrisma.lessonOutput.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'output-participant-1',
        lessonTask: {
          staffLessonTasks: {
            some: {
              staffId: 'staff-participant',
            },
          },
        },
      },
      include: {
        staff: {
          select: lessonStaffSelect,
        },
        lessonTask: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    });
    expect(result).toEqual({
      id: 'output-participant-1',
      lessonTaskId: 'task-participant-1',
      lessonName: 'Bài participant',
      originalTitle: 'Bản gốc',
      source: 'Codeforces',
      originalLink: 'https://example.com/original',
      level: 'Level 2',
      difficultyBand: null,
      includesTest: false,
      includesSolution: false,
      includesLectureVideo: false,
      tags: ['graph'],
      cost: 120000,
      date: '2026-03-31',
      contestUploaded: 'ABC 123',
      link: 'https://example.com/output',
      staffId: 'staff-output-1',
      staff: {
        id: 'staff-output-1',
        fullName: 'Nguyen Van B',
        roles: ['lesson_plan'],
        status: 'active',
      },
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      task: {
        id: 'task-participant-1',
        title: 'Task participant',
        status: LessonTaskStatus.in_progress,
        priority: LessonTaskPriority.high,
      },
      createdAt: '2026-03-31T08:00:00.000Z',
      updatedAt: '2026-03-31T09:30:00.000Z',
    });
  });

  it('loads lesson output detail with accountant scope for staff who has both lesson planner and expense accountant roles', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-mixed-role',
      roles: ['lesson_plan', 'accountant_expense'],
    });
    mockPrisma.lessonOutput.findUnique.mockResolvedValue({
      id: 'output-mixed-1',
      lessonTaskId: 'task-shared-1',
      lessonName: 'Bài mixed scope',
      originalTitle: null,
      source: 'Internal',
      originalLink: 'https://example.com/original-mixed',
      level: 'Level 3',
      tags: ['mixed'],
      cost: 180000,
      date: new Date('2026-03-31T00:00:00.000Z'),
      contestUploaded: 'ABC Mixed',
      link: 'https://example.com/output-mixed',
      staffId: 'staff-other',
      status: LessonOutputStatus.completed,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-03-31T08:00:00.000Z'),
      updatedAt: new Date('2026-03-31T09:45:00.000Z'),
      staff: {
        id: 'staff-other',
        fullName: 'Shared Accountant View',
        roles: ['lesson_plan'],
        status: 'active',
      },
      lessonTask: {
        id: 'task-shared-1',
        title: 'Task shared',
        status: LessonTaskStatus.completed,
        priority: LessonTaskPriority.high,
      },
    });

    const result = await service.getOutputById('output-mixed-1', {
      id: 'user-mixed-role',
      roleType: UserRole.staff,
    } as never);

    expect(mockPrisma.lessonOutput.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.lessonOutput.findUnique).toHaveBeenCalledWith({
      where: { id: 'output-mixed-1' },
      include: {
        staff: {
          select: lessonStaffSelect,
        },
        lessonTask: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    });
    expect(result.staffId).toBe('staff-other');
    expect(result.paymentStatus).toBe(PaymentStatus.pending);
  });

  it('allows participant to update non-financial lesson output fields inside an assigned task', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });
    mockPrisma.lessonOutput.findFirst.mockResolvedValue({
      id: 'output-55',
      lessonTaskId: 'task-participant-55',
      lessonName: 'Bài cũ',
      originalTitle: 'Title cũ',
      source: 'Codeforces',
      originalLink: 'https://example.com/original-old',
      level: 'Level 1',
      tags: ['dp'],
      cost: 200000,
      date: new Date('2026-03-30T00:00:00.000Z'),
      contestUploaded: 'ABC 111',
      link: 'https://example.com/old-output',
      staffId: 'staff-output-55',
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-03-30T08:00:00.000Z'),
      updatedAt: new Date('2026-03-30T09:00:00.000Z'),
      staff: {
        id: 'staff-output-55',
        fullName: 'Tran Thi C',
        roles: ['lesson_plan'],
        status: 'active',
      },
      lessonTask: {
        id: 'task-participant-55',
        title: 'Task participant 55',
        status: LessonTaskStatus.in_progress,
        priority: LessonTaskPriority.medium,
      },
    });
    mockPrisma.lessonTask.findUnique.mockResolvedValue({
      id: 'task-participant-55',
    });
    mockPrisma.lessonOutput.update.mockResolvedValue({
      id: 'output-55',
      lessonTaskId: 'task-participant-55',
      lessonName: 'Bài mới participant',
      originalTitle: 'Title cũ',
      source: 'Codeforces',
      originalLink: 'https://example.com/original-old',
      level: 'Level 1',
      tags: ['dp'],
      cost: 200000,
      date: new Date('2026-03-30T00:00:00.000Z'),
      contestUploaded: 'ABC 222',
      link: 'https://example.com/new-output',
      staffId: 'staff-output-55',
      status: LessonOutputStatus.completed,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-03-30T08:00:00.000Z'),
      updatedAt: new Date('2026-03-30T10:15:00.000Z'),
      staff: {
        id: 'staff-output-55',
        fullName: 'Tran Thi C',
        roles: ['lesson_plan'],
        status: 'active',
      },
      lessonTask: {
        id: 'task-participant-55',
        title: 'Task participant 55',
        status: LessonTaskStatus.in_progress,
        priority: LessonTaskPriority.medium,
      },
    });

    const result = await service.updateOutput(
      'output-55',
      {
        lessonTaskId: 'task-participant-55',
        lessonName: '  Bài mới participant  ',
        contestUploaded: '  ABC 222  ',
        link: 'https://example.com/new-output',
        status: LessonOutputStatus.completed,
      },
      undefined,
      {
        id: 'user-participant',
        roleType: UserRole.staff,
      } as never,
    );

    expect(mockPrisma.lessonOutput.update).toHaveBeenCalledWith({
      where: { id: 'output-55' },
      data: {
        lessonName: 'Bài mới participant',
        contestUploaded: 'ABC 222',
        link: 'https://example.com/new-output',
        roleType: 'lesson_plan',
        status: LessonOutputStatus.completed,
        taxDeductionRatePercent: 0,
      },
      include: {
        staff: {
          select: lessonStaffSelect,
        },
        lessonTask: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    });
    expect(result.lessonName).toBe('Bài mới participant');
    expect(result.cost).toBe(200000);
    expect(result.paymentStatus).toBe(PaymentStatus.pending);
  });

  it('allows expense accountant output payment updates for staff who has both lesson planner and expense accountant roles', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-mixed-role',
      roles: ['lesson_plan', 'accountant_expense'],
    });
    mockPrisma.lessonOutput.findUnique.mockResolvedValue({
      id: 'output-mixed-update',
      lessonTaskId: 'task-shared-9',
      lessonName: 'Bài mixed cũ',
      originalTitle: null,
      source: 'Internal',
      originalLink: null,
      level: 'Level 2',
      tags: ['mixed'],
      cost: 100000,
      date: new Date('2026-03-30T00:00:00.000Z'),
      contestUploaded: 'ABC 999',
      link: 'https://example.com/old-mixed-output',
      staffId: 'staff-other',
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-03-30T08:00:00.000Z'),
      updatedAt: new Date('2026-03-30T09:00:00.000Z'),
      staff: {
        id: 'staff-other',
        fullName: 'Staff Other',
        roles: ['lesson_plan'],
        status: 'active',
      },
      lessonTask: {
        id: 'task-shared-9',
        title: 'Task shared 9',
        status: LessonTaskStatus.in_progress,
        priority: LessonTaskPriority.medium,
      },
    });
    mockPrisma.lessonOutput.update.mockResolvedValue({
      id: 'output-mixed-update',
      lessonTaskId: 'task-shared-9',
      lessonName: 'Bài mixed cũ',
      originalTitle: null,
      source: 'Internal',
      originalLink: null,
      level: 'Level 2',
      tags: ['mixed'],
      cost: 100000,
      date: new Date('2026-03-30T00:00:00.000Z'),
      contestUploaded: 'ABC 999',
      link: 'https://example.com/old-mixed-output',
      staffId: 'staff-other',
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.paid,
      createdAt: new Date('2026-03-30T08:00:00.000Z'),
      updatedAt: new Date('2026-03-30T11:30:00.000Z'),
      staff: {
        id: 'staff-other',
        fullName: 'Staff Other',
        roles: ['lesson_plan'],
        status: 'active',
      },
      lessonTask: {
        id: 'task-shared-9',
        title: 'Task shared 9',
        status: LessonTaskStatus.in_progress,
        priority: LessonTaskPriority.medium,
      },
    });

    const result = await service.updateOutput(
      'output-mixed-update',
      {
        paymentStatus: PaymentStatus.paid,
      },
      undefined,
      {
        id: 'user-mixed-role',
        roleType: UserRole.staff,
      } as never,
    );

    expect(mockPrisma.lessonOutput.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.lessonOutput.findUnique).toHaveBeenCalledWith({
      where: { id: 'output-mixed-update' },
      include: {
        staff: {
          select: lessonStaffSelect,
        },
        lessonTask: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    });
    expect(mockPrisma.lessonOutput.update).toHaveBeenCalledWith({
      where: { id: 'output-mixed-update' },
      data: {
        paymentStatus: PaymentStatus.paid,
        roleType: 'lesson_plan',
        taxDeductionRatePercent: 0,
      },
      include: {
        staff: {
          select: lessonStaffSelect,
        },
        lessonTask: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    });
    expect(result.cost).toBe(100000);
    expect(result.paymentStatus).toBe(PaymentStatus.paid);
  });

  it('rejects participant cost updates even when the output belongs to an assigned task', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });
    mockPrisma.lessonOutput.findFirst.mockResolvedValue({
      id: 'output-56',
      lessonTaskId: 'task-participant-56',
      lessonName: 'Bài khóa cost',
      originalTitle: null,
      source: null,
      originalLink: null,
      level: null,
      tags: [],
      cost: 150000,
      date: new Date('2026-03-30T00:00:00.000Z'),
      contestUploaded: null,
      link: null,
      staffId: 'staff-output-56',
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-03-30T08:00:00.000Z'),
      updatedAt: new Date('2026-03-30T09:00:00.000Z'),
      staff: {
        id: 'staff-output-56',
        fullName: 'Le Thi D',
        roles: ['lesson_plan'],
        status: 'active',
      },
      lessonTask: {
        id: 'task-participant-56',
        title: 'Task participant 56',
        status: LessonTaskStatus.pending,
        priority: LessonTaskPriority.medium,
      },
    });
    mockPrisma.lessonOutput.update.mockResolvedValue({
      id: 'output-56',
      lessonTaskId: 'task-participant-56',
      lessonName: 'Bài khóa cost',
      originalTitle: null,
      source: null,
      originalLink: null,
      level: null,
      tags: [],
      cost: 150000,
      date: new Date('2026-03-30T00:00:00.000Z'),
      contestUploaded: null,
      link: null,
      staffId: 'staff-output-56',
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-03-30T08:00:00.000Z'),
      updatedAt: new Date('2026-03-30T09:00:00.000Z'),
      staff: {
        id: 'staff-output-56',
        fullName: 'Le Thi D',
        roles: ['lesson_plan'],
        status: 'active',
      },
      lessonTask: {
        id: 'task-participant-56',
        title: 'Task participant 56',
        status: LessonTaskStatus.pending,
        priority: LessonTaskPriority.medium,
      },
    });

    const result = await service.updateOutput(
      'output-56',
      {
        cost: 160000,
      },
      undefined,
      {
        id: 'user-participant',
        roleType: UserRole.staff,
      } as never,
    );

    expect(mockPrisma.lessonOutput.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          cost: 160000,
        }) as unknown,
      }) as unknown,
    );
    expect(result.cost).toBe(150000);
  });

  it('computes create cost from difficulty band and ticks and ignores client cost', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue(null);
    mockPrisma.lessonOutput.create.mockResolvedValue({
      id: 'output-priced-1',
      lessonTaskId: null,
      lessonName: 'Bài tính tiền',
      originalTitle: null,
      source: null,
      originalLink: null,
      level: 'Level 2',
      difficultyBand: LessonOutputDifficultyBand.hard,
      includesTest: true,
      includesSolution: true,
      includesLectureVideo: false,
      tags: ['priced'],
      cost: 45000,
      date: new Date('2026-09-09T00:00:00.000Z'),
      contestUploaded: null,
      link: null,
      staffId: null,
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-09-09T08:00:00.000Z'),
      updatedAt: new Date('2026-09-09T08:00:00.000Z'),
      staff: null,
      lessonTask: null,
    });

    const result = await service.createOutput({
      lessonName: 'Bài tính tiền',
      date: '2026-09-09',
      tags: ['priced'],
      cost: 999999,
      difficultyBand: LessonOutputDifficultyBand.hard,
      includesTest: true,
      includesSolution: true,
      includesLectureVideo: false,
    });

    expect(mockPrisma.lessonOutput.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          difficultyBand: LessonOutputDifficultyBand.hard,
          includesTest: true,
          includesSolution: true,
          includesLectureVideo: false,
          cost: 45000,
        }) as unknown,
      }) as unknown,
    );
    expect(result.cost).toBe(45000);
  });

  it('saves cost 0 when a band is chosen but no pricing items are ticked', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue(null);
    mockPrisma.lessonOutput.create.mockResolvedValue({
      id: 'output-priced-0',
      lessonTaskId: null,
      lessonName: 'Bài chưa tick',
      originalTitle: null,
      source: null,
      originalLink: null,
      level: null,
      difficultyBand: LessonOutputDifficultyBand.easy,
      includesTest: false,
      includesSolution: false,
      includesLectureVideo: false,
      tags: ['empty'],
      cost: 0,
      date: new Date('2026-09-09T00:00:00.000Z'),
      contestUploaded: null,
      link: null,
      staffId: null,
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-09-09T08:00:00.000Z'),
      updatedAt: new Date('2026-09-09T08:00:00.000Z'),
      staff: null,
      lessonTask: null,
    });

    await service.createOutput({
      lessonName: 'Bài chưa tick',
      date: '2026-09-09',
      tags: ['empty'],
      difficultyBand: LessonOutputDifficultyBand.easy,
    });

    expect(mockPrisma.lessonOutput.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          difficultyBand: LessonOutputDifficultyBand.easy,
          cost: 0,
        }) as unknown,
      }) as unknown,
    );
  });

  it('keeps legacy cost when updating an output that has no difficulty band', async () => {
    mockPrisma.lessonOutput.findUnique.mockResolvedValue({
      id: 'output-legacy-1',
      lessonTaskId: null,
      lessonName: 'Bài cũ',
      originalTitle: null,
      source: null,
      originalLink: null,
      level: 'Level 1',
      difficultyBand: null,
      includesTest: false,
      includesSolution: false,
      includesLectureVideo: false,
      tags: ['legacy'],
      cost: 180000,
      date: new Date('2026-03-01T00:00:00.000Z'),
      contestUploaded: null,
      link: 'https://example.com/legacy',
      staffId: null,
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.paid,
      createdAt: new Date('2026-03-01T08:00:00.000Z'),
      updatedAt: new Date('2026-03-01T08:00:00.000Z'),
      staff: null,
      lessonTask: null,
    });
    mockPrisma.lessonOutput.update.mockResolvedValue({
      id: 'output-legacy-1',
      lessonTaskId: null,
      lessonName: 'Bài cũ đã sửa tên',
      originalTitle: null,
      source: null,
      originalLink: null,
      level: 'Level 1',
      difficultyBand: null,
      includesTest: false,
      includesSolution: false,
      includesLectureVideo: false,
      tags: ['legacy'],
      cost: 180000,
      date: new Date('2026-03-01T00:00:00.000Z'),
      contestUploaded: null,
      link: 'https://example.com/legacy',
      staffId: null,
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.paid,
      createdAt: new Date('2026-03-01T08:00:00.000Z'),
      updatedAt: new Date('2026-03-01T10:00:00.000Z'),
      staff: null,
      lessonTask: null,
    });

    const result = await service.updateOutput('output-legacy-1', {
      lessonName: 'Bài cũ đã sửa tên',
      cost: 1,
    });

    expect(mockPrisma.lessonOutput.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lessonName: 'Bài cũ đã sửa tên',
        }) as unknown,
      }) as unknown,
    );
    expect(mockPrisma.lessonOutput.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          cost: 1,
        }) as unknown,
      }) as unknown,
    );
    expect(result.cost).toBe(180000);
  });

  it('rejects expense accountant updates to difficulty band', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-accountant',
      roles: ['accountant_expense'],
    });
    mockPrisma.lessonOutput.findUnique.mockResolvedValue({
      id: 'output-acc-1',
      lessonTaskId: null,
      lessonName: 'Bài kế toán',
      originalTitle: null,
      source: null,
      originalLink: null,
      level: null,
      difficultyBand: null,
      tags: [],
      cost: 100000,
      date: new Date('2026-03-01T00:00:00.000Z'),
      contestUploaded: null,
      link: null,
      staffId: null,
      status: LessonOutputStatus.pending,
      paymentStatus: PaymentStatus.pending,
      createdAt: new Date('2026-03-01T08:00:00.000Z'),
      updatedAt: new Date('2026-03-01T08:00:00.000Z'),
      staff: null,
      lessonTask: null,
    });

    await expect(
      service.updateOutput(
        'output-acc-1',
        {
          difficultyBand: LessonOutputDifficultyBand.medium,
        },
        undefined,
        {
          id: 'user-accountant',
          roleType: UserRole.staff,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.lessonOutput.update).not.toHaveBeenCalled();
  });

  it('rejects resource creation when title or link is blank after trimming', async () => {
    await expect(
      service.createResource({
        title: '  ',
        resourceLink: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('loads one resource detail by id with normalized tags', async () => {
    mockPrisma.lessonResource.findUnique.mockResolvedValue({
      id: 'resource-detail-1',
      title: 'Bộ đề tổ hợp',
      description: 'Tài nguyên để kiểm tra lại lời giải.',
      resourceLink: 'https://example.com/resource-detail-1',
      lessonTaskId: 'task-9',
      tags: [' combinatorics ', ' olympic ', 123],
      createdAt: new Date('2026-03-24T07:00:00.000Z'),
      updatedAt: new Date('2026-03-24T08:15:00.000Z'),
    });

    const result = await service.getResourceById('resource-detail-1');

    expect(mockPrisma.lessonResource.findUnique).toHaveBeenCalledWith({
      where: { id: 'resource-detail-1' },
    });
    expect(result).toEqual({
      id: 'resource-detail-1',
      title: 'Bộ đề tổ hợp',
      description: 'Tài nguyên để kiểm tra lại lời giải.',
      resourceLink: 'https://example.com/resource-detail-1',
      lessonTaskId: 'task-9',
      tags: ['combinatorics', 'olympic'],
      createdBy: null,
      createdAt: '2026-03-24T07:00:00.000Z',
      updatedAt: '2026-03-24T08:15:00.000Z',
    });
  });

  it('creates a resource linked to a lesson task when lessonTaskId is provided', async () => {
    mockPrisma.lessonTask.findUnique.mockResolvedValue({ id: 'task-1' });
    mockPrisma.lessonResource.create.mockResolvedValue({
      id: 'resource-1',
      title: 'Bộ note hình học',
      description: 'Dùng cho task đang xử lý',
      resourceLink: 'https://example.com/resource-1',
      lessonTaskId: 'task-1',
      tags: ['geometry'],
      createdAt: new Date('2026-03-24T09:00:00.000Z'),
      updatedAt: new Date('2026-03-24T09:00:00.000Z'),
    });

    const result = await service.createResource({
      title: '  Bộ note hình học  ',
      description: ' Dùng cho task đang xử lý ',
      resourceLink: 'https://example.com/resource-1',
      lessonTaskId: 'task-1',
      tags: [' geometry '],
    });

    expect(mockPrisma.lessonTask.findUnique).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      select: { id: true },
    });
    expect(mockPrisma.lessonResource.create).toHaveBeenCalledWith({
      data: {
        title: 'Bộ note hình học',
        resourceLink: 'https://example.com/resource-1',
        description: 'Dùng cho task đang xử lý',
        tags: ['geometry'],
        lessonTask: {
          connect: { id: 'task-1' },
        },
        createdBy: null,
      },
    });
    expect(result.lessonTaskId).toBe('task-1');
  });

  it('forces participant resource creation onto their own assigned task', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });
    mockPrisma.lessonTask.findUnique.mockResolvedValue({
      id: 'task-participant-1',
    });
    mockPrisma.lessonTask.findFirst.mockResolvedValue({
      id: 'task-participant-1',
    });
    mockPrisma.lessonResource.create.mockResolvedValue({
      id: 'resource-participant-1',
      title: 'Bộ note participant',
      description: 'Theo task được giao',
      resourceLink: 'https://example.com/resource-participant-1',
      lessonTaskId: 'task-participant-1',
      tags: ['algebra'],
      createdBy: 'user-participant',
      createdAt: new Date('2026-03-28T10:00:00.000Z'),
      updatedAt: new Date('2026-03-28T10:00:00.000Z'),
    });

    const result = await service.createResource(
      {
        title: '  Bộ note participant  ',
        description: ' Theo task được giao ',
        resourceLink: 'https://example.com/resource-participant-1',
        lessonTaskId: 'task-participant-1',
        tags: [' algebra '],
      },
      {
        userId: 'user-participant',
        userEmail: 'participant@example.com',
        roleType: 'staff',
      },
      {
        id: 'user-participant',
        email: 'participant@example.com',
        accountHandle: 'participant',
        roleType: 'staff',
      },
    );

    expect(mockPrisma.lessonTask.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'task-participant-1',
        staffLessonTasks: {
          some: {
            staffId: 'staff-participant',
          },
        },
      },
      select: {
        id: true,
      },
    });
    expect(mockPrisma.lessonResource.create).toHaveBeenCalledWith({
      data: {
        title: 'Bộ note participant',
        resourceLink: 'https://example.com/resource-participant-1',
        description: 'Theo task được giao',
        tags: ['algebra'],
        lessonTask: {
          connect: { id: 'task-participant-1' },
        },
        createdBy: 'user-participant',
      },
    });
    expect(result.lessonTaskId).toBe('task-participant-1');
  });

  it('allows participant resource creation without a parent task', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });
    mockPrisma.lessonResource.create.mockResolvedValue({
      id: 'resource-participant-global-1',
      title: 'Bộ note participant',
      description: null,
      resourceLink: 'https://example.com/resource-participant-1',
      lessonTaskId: null,
      tags: [],
      createdBy: 'user-participant',
      createdAt: new Date('2026-03-28T10:00:00.000Z'),
      updatedAt: new Date('2026-03-28T10:00:00.000Z'),
    });

    const result = await service.createResource(
      {
        title: 'Bộ note participant',
        resourceLink: 'https://example.com/resource-participant-1',
      },
      {
        userId: 'user-participant',
        userEmail: 'participant@example.com',
        roleType: 'staff',
      },
      {
        id: 'user-participant',
        email: 'participant@example.com',
        accountHandle: 'participant',
        roleType: 'staff',
      },
    );

    expect(mockPrisma.lessonTask.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.lessonResource.create).toHaveBeenCalledWith({
      data: {
        title: 'Bộ note participant',
        resourceLink: 'https://example.com/resource-participant-1',
        description: null,
        tags: [],
        lessonTask: undefined,
        createdBy: 'user-participant',
      },
    });
    expect(result.lessonTaskId).toBeNull();
    expect(result.createdBy).toBe('user-participant');
  });

  it('updates the linked lesson task for a resource when lessonTaskId changes', async () => {
    mockPrisma.lessonResource.findUnique.mockResolvedValue({
      id: 'resource-1',
      title: 'Bộ note cũ',
      description: null,
      resourceLink: 'https://example.com/resource-1',
      lessonTaskId: null,
      tags: [],
      createdBy: null,
      createdAt: new Date('2026-03-24T09:00:00.000Z'),
      updatedAt: new Date('2026-03-24T09:00:00.000Z'),
    });
    mockPrisma.lessonTask.findUnique.mockResolvedValue({ id: 'task-2' });
    mockPrisma.lessonResource.update.mockResolvedValue({
      id: 'resource-1',
      title: 'Bộ note cũ',
      description: null,
      resourceLink: 'https://example.com/resource-1',
      lessonTaskId: 'task-2',
      tags: [],
      createdAt: new Date('2026-03-24T09:00:00.000Z'),
      updatedAt: new Date('2026-03-24T10:00:00.000Z'),
    });

    const result = await service.updateResource('resource-1', {
      lessonTaskId: 'task-2',
    });

    expect(mockPrisma.lessonResource.update).toHaveBeenCalledWith({
      where: { id: 'resource-1' },
      data: {
        lessonTask: {
          connect: { id: 'task-2' },
        },
      },
    });
    expect(result.lessonTaskId).toBe('task-2');
  });

  it('disconnects a lesson resource from its task when lessonTaskId is null on update', async () => {
    mockPrisma.lessonResource.findUnique.mockResolvedValue({
      id: 'resource-detach-1',
      title: 'Bộ note đang gắn task',
      description: null,
      resourceLink: 'https://example.com/resource-detach-1',
      lessonTaskId: 'task-8',
      tags: ['algebra'],
      createdAt: new Date('2026-03-24T09:00:00.000Z'),
      updatedAt: new Date('2026-03-24T09:00:00.000Z'),
    });
    mockPrisma.lessonResource.update.mockResolvedValue({
      id: 'resource-detach-1',
      title: 'Bộ note đang gắn task',
      description: null,
      resourceLink: 'https://example.com/resource-detach-1',
      lessonTaskId: null,
      tags: ['algebra'],
      createdAt: new Date('2026-03-24T09:00:00.000Z'),
      updatedAt: new Date('2026-03-24T10:00:00.000Z'),
    });

    const result = await service.updateResource('resource-detach-1', {
      lessonTaskId: null,
    });

    expect(mockPrisma.lessonResource.update).toHaveBeenCalledWith({
      where: { id: 'resource-detach-1' },
      data: {
        lessonTask: {
          disconnect: true,
        },
      },
    });
    expect(result.lessonTaskId).toBeNull();
  });

  it('allows participant to update their own lesson resource', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });
    mockPrisma.lessonResource.findUnique.mockResolvedValue({
      id: 'resource-own-1',
      title: 'Bộ note cũ',
      description: null,
      resourceLink: 'https://example.com/resource-own-1',
      lessonTaskId: null,
      tags: [],
      createdBy: 'user-participant',
      createdAt: new Date('2026-03-24T09:00:00.000Z'),
      updatedAt: new Date('2026-03-24T09:00:00.000Z'),
    });
    mockPrisma.lessonResource.update.mockResolvedValue({
      id: 'resource-own-1',
      title: 'Bộ note mới',
      description: null,
      resourceLink: 'https://example.com/resource-own-1',
      lessonTaskId: null,
      tags: [],
      createdBy: 'user-participant',
      createdAt: new Date('2026-03-24T09:00:00.000Z'),
      updatedAt: new Date('2026-03-24T10:00:00.000Z'),
    });

    const result = await service.updateResource(
      'resource-own-1',
      {
        title: 'Bộ note mới',
      },
      {
        userId: 'user-participant',
        userEmail: 'participant@example.com',
        roleType: 'staff',
      },
      {
        id: 'user-participant',
        email: 'participant@example.com',
        accountHandle: 'participant',
        roleType: 'staff',
      },
    );

    expect(mockPrisma.lessonResource.update).toHaveBeenCalledWith({
      where: { id: 'resource-own-1' },
      data: {
        title: 'Bộ note mới',
      },
    });
    expect(result.createdBy).toBe('user-participant');
  });

  it('rejects participant update for another user resource', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });
    mockPrisma.lessonResource.findUnique.mockResolvedValue({
      id: 'resource-other-1',
      title: 'Bộ note người khác',
      description: null,
      resourceLink: 'https://example.com/resource-other-1',
      lessonTaskId: null,
      tags: [],
      createdBy: 'other-user',
      createdAt: new Date('2026-03-24T09:00:00.000Z'),
      updatedAt: new Date('2026-03-24T09:00:00.000Z'),
    });

    await expect(
      service.updateResource(
        'resource-other-1',
        { title: 'Không được sửa' },
        {
          userId: 'user-participant',
          userEmail: 'participant@example.com',
          roleType: 'staff',
        },
        {
          id: 'user-participant',
          email: 'participant@example.com',
          accountHandle: 'participant',
          roleType: 'staff',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.lessonResource.update).not.toHaveBeenCalled();
  });

  it('allows participant to delete their own lesson resource', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });
    mockPrisma.lessonResource.findUnique.mockResolvedValue({
      id: 'resource-own-delete-1',
      title: 'Bộ note tự tạo',
      description: null,
      resourceLink: 'https://example.com/resource-own-delete-1',
      lessonTaskId: null,
      tags: [],
      createdBy: 'user-participant',
      createdAt: new Date('2026-03-24T09:00:00.000Z'),
      updatedAt: new Date('2026-03-24T09:00:00.000Z'),
    });
    mockPrisma.lessonResource.delete.mockResolvedValue({
      id: 'resource-own-delete-1',
      title: 'Bộ note tự tạo',
      description: null,
      resourceLink: 'https://example.com/resource-own-delete-1',
      lessonTaskId: null,
      tags: [],
      createdBy: 'user-participant',
      createdAt: new Date('2026-03-24T09:00:00.000Z'),
      updatedAt: new Date('2026-03-24T09:00:00.000Z'),
    });

    await service.deleteResource(
      'resource-own-delete-1',
      {
        userId: 'user-participant',
        userEmail: 'participant@example.com',
        roleType: 'staff',
      },
      {
        id: 'user-participant',
        email: 'participant@example.com',
        accountHandle: 'participant',
        roleType: 'staff',
      },
    );

    expect(mockPrisma.lessonResource.delete).toHaveBeenCalledWith({
      where: { id: 'resource-own-delete-1' },
    });
  });

  it('rejects participant delete for another user resource', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-participant',
      roles: ['lesson_plan'],
    });
    mockPrisma.lessonResource.findUnique.mockResolvedValue({
      id: 'resource-other-delete-1',
      title: 'Bộ note người khác',
      description: null,
      resourceLink: 'https://example.com/resource-other-delete-1',
      lessonTaskId: null,
      tags: [],
      createdBy: 'other-user',
      createdAt: new Date('2026-03-24T09:00:00.000Z'),
      updatedAt: new Date('2026-03-24T09:00:00.000Z'),
    });

    await expect(
      service.deleteResource(
        'resource-other-delete-1',
        {
          userId: 'user-participant',
          userEmail: 'participant@example.com',
          roleType: 'staff',
        },
        {
          id: 'user-participant',
          email: 'participant@example.com',
          accountHandle: 'participant',
          roleType: 'staff',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.lessonResource.delete).not.toHaveBeenCalled();
  });

  it('searches existing lesson resources for task linking with lightweight task context', async () => {
    mockPrisma.lessonResource.findMany.mockResolvedValue([
      {
        id: 'resource-5',
        title: 'Checklist hình học',
        resourceLink: 'https://example.com/checklist-hinh-hoc',
        tags: [' geometry ', ' checklist '],
        lessonTaskId: 'task-9',
        lessonTask: {
          id: 'task-9',
          title: 'Soạn bài hình học',
        },
      },
      {
        id: 'resource-6',
        title: 'Note hình học độc lập',
        resourceLink: 'https://example.com/note-hinh-hoc',
        tags: [' note '],
        lessonTaskId: null,
        lessonTask: null,
      },
    ]);

    const result = await service.searchResourceOptions({
      search: 'hình',
      limit: 5,
      excludeTaskId: 'task-1',
    });

    expect(mockPrisma.lessonResource.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [
              {
                lessonTaskId: null,
              },
              {
                lessonTaskId: {
                  not: 'task-1',
                },
              },
            ],
          },
          {
            OR: [
              {
                title: {
                  contains: 'hình',
                  mode: 'insensitive',
                },
              },
              {
                resourceLink: {
                  contains: 'hình',
                  mode: 'insensitive',
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        resourceLink: true,
        tags: true,
        lessonTaskId: true,
        lessonTask: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 5,
    });
    expect(result).toEqual([
      {
        id: 'resource-5',
        title: 'Checklist hình học',
        resourceLink: 'https://example.com/checklist-hinh-hoc',
        tags: ['geometry', 'checklist'],
        lessonTaskId: 'task-9',
        lessonTaskTitle: 'Soạn bài hình học',
      },
      {
        id: 'resource-6',
        title: 'Note hình học độc lập',
        resourceLink: 'https://example.com/note-hinh-hoc',
        tags: ['note'],
        lessonTaskId: null,
        lessonTaskTitle: null,
      },
    ]);
  });

  it('rejects lesson_plan_head changing a single output payment status', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-head',
      roles: [StaffRole.lesson_plan_head],
    });
    mockPrisma.lessonOutput.findUnique.mockResolvedValue({
      id: 'output-head-1',
      lessonTaskId: 'task-1',
      lessonName: 'Bài hình học 1',
      originalTitle: null,
      source: 'internal',
      originalLink: 'https://example.com/original-1',
      level: 'Level 3',
      tags: ['checker'],
      cost: 120000,
      paymentStatus: PaymentStatus.pending,
      date: new Date('2026-03-21T00:00:00.000Z'),
      contestUploaded: 'HSG tỉnh',
      link: 'https://example.com/output-1',
      staffId: 'staff-1',
      status: LessonOutputStatus.completed,
      createdAt: new Date('2026-03-21T08:00:00.000Z'),
      updatedAt: new Date('2026-03-21T08:00:00.000Z'),
      staff: {
        id: 'staff-1',
        fullName: 'Planner 1',
        roles: ['lesson_plan'],
        status: 'active',
      },
      lessonTask: {
        id: 'task-1',
        title: 'Soạn đề hình học',
        status: LessonTaskStatus.in_progress,
        priority: LessonTaskPriority.high,
      },
    });

    await expect(
      service.updateOutput(
        'output-head-1',
        { paymentStatus: PaymentStatus.paid },
        {
          userId: 'user-head',
          userEmail: 'head@example.com',
          roleType: 'staff',
        },
        {
          id: 'user-head',
          email: 'head@example.com',
          accountHandle: 'head',
          roleType: 'staff',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.lessonOutput.update).not.toHaveBeenCalled();
  });

  it('rejects lesson_plan_head bulk output payment status updates', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-head',
      roles: [StaffRole.lesson_plan_head],
    });

    await expect(
      service.bulkUpdateOutputPaymentStatus(
        ['output-1'],
        PaymentStatus.paid,
        {
          userId: 'user-head',
          userEmail: 'head@example.com',
          roleType: 'staff',
        },
        {
          id: 'user-head',
          email: 'head@example.com',
          accountHandle: 'head',
          roleType: 'staff',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.lessonOutput.findMany).not.toHaveBeenCalled();
  });

  it('bulk updates lesson output payment status only for outputs that change', async () => {
    mockPrisma.lessonOutput.findMany
      .mockResolvedValueOnce([
        {
          id: 'output-1',
          paymentStatus: PaymentStatus.pending,
        },
        {
          id: 'output-2',
          paymentStatus: PaymentStatus.paid,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'output-1',
          lessonTaskId: 'task-1',
          lessonName: 'Bài hình học 1',
          originalTitle: null,
          source: 'internal',
          originalLink: 'https://example.com/original-1',
          level: 'Level 3',
          tags: ['checker'],
          cost: 120000,
          paymentStatus: PaymentStatus.pending,
          date: new Date('2026-03-21T00:00:00.000Z'),
          contestUploaded: 'HSG tỉnh',
          link: 'https://example.com/output-1',
          staffId: 'staff-1',
          status: LessonOutputStatus.completed,
          createdAt: new Date('2026-03-21T08:00:00.000Z'),
          updatedAt: new Date('2026-03-21T08:00:00.000Z'),
          staff: {
            id: 'staff-1',
            fullName: 'Planner 1',
            roles: ['lesson_plan'],
            status: 'active',
          },
          lessonTask: {
            id: 'task-1',
            title: 'Soạn đề hình học',
            status: LessonTaskStatus.in_progress,
            priority: LessonTaskPriority.high,
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'output-1',
          lessonTaskId: 'task-1',
          lessonName: 'Bài hình học 1',
          originalTitle: null,
          source: 'internal',
          originalLink: 'https://example.com/original-1',
          level: 'Level 3',
          tags: ['checker'],
          cost: 120000,
          paymentStatus: PaymentStatus.paid,
          date: new Date('2026-03-21T00:00:00.000Z'),
          contestUploaded: 'HSG tỉnh',
          link: 'https://example.com/output-1',
          staffId: 'staff-1',
          status: LessonOutputStatus.completed,
          createdAt: new Date('2026-03-21T08:00:00.000Z'),
          updatedAt: new Date('2026-03-24T10:00:00.000Z'),
          staff: {
            id: 'staff-1',
            fullName: 'Planner 1',
            roles: ['lesson_plan'],
            status: 'active',
          },
          lessonTask: {
            id: 'task-1',
            title: 'Soạn đề hình học',
            status: LessonTaskStatus.in_progress,
            priority: LessonTaskPriority.high,
          },
        },
      ]);
    mockPrisma.lessonOutput.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.bulkUpdateOutputPaymentStatus(
      ['output-1', 'output-2'],
      PaymentStatus.paid,
      {
        userId: 'user-1',
        userEmail: 'admin@example.com',
        roleType: 'admin',
      },
    );

    expect(mockPrisma.lessonOutput.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: {
          in: ['output-1', 'output-2'],
        },
      },
      select: {
        id: true,
        paymentStatus: true,
      },
    });
    expect(mockPrisma.lessonOutput.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['output-1'],
        },
      },
      data: {
        paymentStatus: PaymentStatus.paid,
      },
    });
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledTimes(1);
    const recordUpdateCalls = actionHistoryService.recordUpdate.mock
      .calls as Array<
      [
        unknown,
        {
          entityType: string;
          entityId: string;
          description: string;
          beforeValue: {
            id: string;
            paymentStatus: PaymentStatus;
          };
          afterValue: {
            id: string;
            paymentStatus: PaymentStatus;
          };
        },
      ]
    >;
    const recordedUpdate = recordUpdateCalls[0]?.[1];

    expect(recordedUpdate).toBeDefined();
    expect(recordedUpdate?.entityType).toBe('lesson_output');
    expect(recordedUpdate?.entityId).toBe('output-1');
    expect(recordedUpdate?.description).toBe(
      'Cập nhật trạng thái thanh toán lesson output',
    );
    expect(recordedUpdate?.beforeValue).toEqual(
      expect.objectContaining({
        id: 'output-1',
        paymentStatus: PaymentStatus.pending,
      }),
    );
    expect(recordedUpdate?.afterValue).toEqual(
      expect.objectContaining({
        id: 'output-1',
        paymentStatus: PaymentStatus.paid,
      }),
    );
    expect(result).toEqual({
      requestedCount: 2,
      updatedCount: 1,
    });
  });
});

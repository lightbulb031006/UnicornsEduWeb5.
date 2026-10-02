jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

jest.mock('generated/client', () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
    join: (values: unknown[]) => values,
  },
}));

import { BadRequestException } from '@nestjs/common';
import {
  NotificationStatus,
  StaffRole,
  StaffStatus,
  UserRole,
} from 'generated/enums';
import { ActionHistoryService } from 'src/action-history/action-history.service';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  const mockPrisma = {
    notification: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    staffInfo: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const mockActionHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };

  const mockGateway = {
    emitNotificationPushed: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (db: typeof mockPrisma) => unknown) =>
        callback(mockPrisma),
    );
    service = new NotificationService(
      mockPrisma as never,
      mockActionHistoryService as unknown as ActionHistoryService,
      mockGateway as never,
    );
  });

  it('canonicalizes @all drafts by clearing other targeting selectors', async () => {
    const createdRow = makeNotificationRow({
      targetAll: true,
      targetRoleTypes: [],
      targetStaffRoles: [],
      targetUserIds: [],
    });
    mockPrisma.notification.create.mockResolvedValue(createdRow);

    await service.createNotificationDraft(
      {
        title: '  Họp trung tâm  ',
        message: '  <p>Nhắc lịch họp</p>  ',
        targetAll: true,
        targetRoleTypes: [UserRole.staff],
        targetStaffRoles: [StaffRole.assistant],
        targetUserIds: ['f8ddf4e2-9bfa-49d8-ab34-e2e4902948f6'],
      },
      {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: UserRole.admin,
      },
    );

    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Họp trung tâm',
          message: '<p>Nhắc lịch họp</p>',
          targetAll: true,
          targetRoleTypes: [],
          targetStaffRoles: [],
          targetUserIds: [],
        }),
      }),
    );
  });

  it('rejects non-all targeting when no audience selector remains', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue(
      makeNotificationRow({
        id: 'notif-draft-1',
        status: NotificationStatus.draft,
      }),
    );

    await expect(
      service.updateNotificationDraft(
        'notif-draft-1',
        {
          targetAll: false,
          targetRoleTypes: [],
          targetStaffRoles: [],
          targetUserIds: [],
        },
        {
          userId: 'admin-1',
          userEmail: 'admin@example.com',
          roleType: UserRole.admin,
        },
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Notification audience must include at least one target when targetAll is false.',
      ),
    );
  });

  it('rejects notifications whose rich-text message is visually empty', async () => {
    await expect(
      service.createNotificationDraft(
        {
          title: 'Thông báo trống',
          message: '  <p><br></p>  ',
          targetAll: true,
        },
        {
          userId: 'admin-1',
          userEmail: 'admin@example.com',
          roleType: UserRole.admin,
        },
      ),
    ).rejects.toThrow(new BadRequestException('message must not be empty.'));
  });

  it('filters staff feed by dynamic audience including staff roles', async () => {
    const row = makeNotificationRow({
      id: 'notif-1',
      status: NotificationStatus.published,
      targetAll: false,
      targetRoleTypes: [UserRole.staff],
      targetStaffRoles: [StaffRole.assistant],
      targetUserIds: ['staff-user-1'],
      version: 2,
      pushCount: 2,
      lastPushedAt: new Date('2026-04-07T10:00:00.000Z'),
    });
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      status: StaffStatus.active,
      roles: [StaffRole.assistant],
    });
    mockPrisma.notification.findMany.mockResolvedValue([row]);
    mockPrisma.$queryRaw.mockResolvedValue([{ notification_id: 'notif-1' }]);

    const result = await service.getNotificationFeed(
      {
        id: 'staff-user-1',
        email: 'assistant@example.com',
        accountHandle: 'assistant',
        roleType: UserRole.staff,
      },
      { limit: 20 },
    );

    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: NotificationStatus.published,
          lastPushedAt: { not: null },
          OR: [
            { targetAll: true },
            { targetUserIds: { has: 'staff-user-1' } },
            { targetRoleTypes: { has: UserRole.staff } },
            { targetStaffRoles: { hasSome: [StaffRole.assistant] } },
          ],
        },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'notif-1',
        readStatus: 'read',
        version: 2,
        pushCount: 2,
      }),
    ]);
  });

  it('rejects student actor from accessing notification feed', async () => {
    await expect(
      service.getNotificationFeed(
        {
          id: 'student-user-1',
          email: 'student@example.com',
          accountHandle: 'student1',
          roleType: UserRole.student,
        },
        { limit: 20 },
      ),
    ).rejects.toThrow('Notification feed is not available for this role');
  });

  it('excludes students from eligible recipient search', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    await service.searchNotificationRecipientOptions({
      search: 'Nguyen',
      limit: 10,
    });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                {
                  roleType: UserRole.admin,
                  status: 'active',
                },
                {
                  roleType: UserRole.staff,
                  status: 'active',
                  staffInfo: {
                    is: {
                      status: 'active',
                    },
                  },
                },
              ],
            },
            expect.any(Object),
          ],
        },
      }),
    );
  });
});

function makeNotificationRow(
  overrides: Partial<{
    id: string;
    title: string;
    message: string;
    status: NotificationStatus;
    targetAll: boolean;
    targetRoleTypes: UserRole[];
    targetStaffRoles: StaffRole[];
    targetUserIds: string[];
    version: number;
    pushCount: number;
    lastPushedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? 'notif-1',
    title: overrides.title ?? 'Thông báo',
    message: overrides.message ?? '<p>Nội dung</p>',
    status: overrides.status ?? NotificationStatus.draft,
    targetAll: overrides.targetAll ?? true,
    targetRoleTypes: overrides.targetRoleTypes ?? [],
    targetStaffRoles: overrides.targetStaffRoles ?? [],
    targetUserIds: overrides.targetUserIds ?? [],
    version: overrides.version ?? 0,
    pushCount: overrides.pushCount ?? 0,
    lastPushedAt:
      overrides.lastPushedAt === undefined ? null : overrides.lastPushedAt,
    createdByUserId: 'admin-1',
    createdAt: overrides.createdAt ?? new Date('2026-04-07T09:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-04-07T09:30:00.000Z'),
    createdBy: null,
  };
}

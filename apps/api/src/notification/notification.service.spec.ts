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

import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
      delete: jest.fn(),
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
        targetStaffRoles: [StaffRole.sale_customer_care_head],
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
      targetStaffRoles: [StaffRole.sale_customer_care_head],
      targetUserIds: ['staff-user-1'],
      version: 2,
      pushCount: 2,
      lastPushedAt: new Date('2026-04-07T10:00:00.000Z'),
    });
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      status: StaffStatus.active,
      roles: [StaffRole.sale_customer_care_head],
    });
    mockPrisma.notification.findMany.mockResolvedValue([row]);
    mockPrisma.$queryRaw.mockResolvedValue([{ notification_id: 'notif-1' }]);

    const result = await service.getNotificationFeed(
      {
        id: 'staff-user-1',
        email: 'assistant@example.com',
        accountHandle: 'sale_customer_care_head',
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
            {
              targetStaffRoles: {
                hasSome: [StaffRole.sale_customer_care_head],
              },
            },
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

  it.each([
    {
      label: 'admin account',
      roleType: UserRole.admin,
      staffRoles: [] as StaffRole[],
    },
    {
      label: 'staff with admin role',
      roleType: UserRole.staff,
      staffRoles: [StaffRole.admin],
    },
  ])(
    'shows every published notification to $label, even ones not targeted to admin',
    async ({ roleType, staffRoles }) => {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-1',
        status: StaffStatus.active,
        roles: staffRoles,
      });
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await service.getNotificationFeed(
        {
          id: 'admin-user-1',
          email: 'admin@example.com',
          accountHandle: 'admin',
          roleType,
        },
        { limit: 20 },
      );

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: NotificationStatus.published,
            lastPushedAt: { not: null },
          },
        }),
      );
    },
  );

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
  describe('quyền người tạo / kiểm duyệt (CONTEXT.md "Người tạo thông báo")', () => {
    const staffActor = (id: string) => ({
      id,
      email: `${id}@example.com`,
      accountHandle: id,
      roleType: UserRole.staff,
    });
    const adminActor = {
      id: 'admin-1',
      email: 'admin-1@example.com',
      accountHandle: 'admin-1',
      roleType: UserRole.admin,
    };
    const auditActor = { userId: 'x', userEmail: null, roleType: null };

    const withStaffRoles = (roles: StaffRole[]) =>
      mockPrisma.staffInfo.findUnique.mockResolvedValue({ roles });

    const publishedBy = (
      author: ReturnType<typeof makeAuthor> | null,
      id = 'notif-pub',
    ) =>
      makeNotificationRow({
        id,
        status: NotificationStatus.published,
        createdByUserId: author?.id ?? null,
        createdBy: author,
      });

    beforeEach(() => {
      mockPrisma.user.findMany.mockResolvedValue([]);
    });

    it('staff thường chỉ thấy thông báo do mình tạo', async () => {
      withStaffRoles([StaffRole.communication]);
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await service.getAdminNotifications({}, staffActor('staff-1'));

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdByUserId: 'staff-1' } }),
      );
    });

    it('admin thấy nháp của mình + mọi thông báo đã đẩy (kiểm duyệt)', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await service.getAdminNotifications(
        { status: NotificationStatus.published },
        adminActor,
      );

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { status: NotificationStatus.published },
              {
                OR: [
                  { createdByUserId: 'admin-1' },
                  { status: NotificationStatus.published },
                ],
              },
            ],
          },
        }),
      );
    });

    it('staff có role admin cũng được kiểm duyệt', async () => {
      withStaffRoles([StaffRole.admin]);
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await service.getAdminNotifications({}, staffActor('staff-admin'));

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { createdByUserId: 'staff-admin' },
              { status: NotificationStatus.published },
            ],
          },
        }),
      );
    });

    it.each([
      ['trợ lí (TP Sale & CSKH)', [StaffRole.sale_customer_care_head]],
      ['kế toán thu', [StaffRole.accountant_income]],
      [
        'trợ lí kiêm kế toán thu',
        [StaffRole.sale_customer_care_head, StaffRole.accountant_income],
      ],
    ])('%s chỉ thấy thông báo do mình tạo (#269)', async (_label, roles) => {
      withStaffRoles(roles);
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await service.getAdminNotifications({}, staffActor('assistant-1'));

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { createdByUserId: 'assistant-1' },
        }),
      );
    });

    it('trả canEdit/canDelete theo từng thông báo cho trợ lí (chỉ bài của mình)', async () => {
      withStaffRoles([StaffRole.sale_customer_care_head]);
      mockPrisma.notification.findMany.mockResolvedValue([
        publishedBy(makeAuthor('assistant-1', UserRole.staff), 'own'),
        makeNotificationRow({
          id: 'own-draft',
          createdByUserId: 'assistant-1',
        }),
      ]);

      const items = await service.getAdminNotifications(
        {},
        staffActor('assistant-1'),
      );

      expect(
        items.map(({ id, canEdit, canDelete }) => ({ id, canEdit, canDelete })),
      ).toEqual([
        { id: 'own', canEdit: true, canDelete: true },
        { id: 'own-draft', canEdit: true, canDelete: true },
      ]);
    });

    it('admin không được sửa nháp của người khác', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue(
        makeNotificationRow({ createdByUserId: 'staff-2' }),
      );

      await expect(
        service.updateNotificationDraft(
          'notif-1',
          { title: 'Sửa' },
          auditActor,
          adminActor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('admin không được đẩy lại thông báo của người khác', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue(
        publishedBy(makeAuthor('staff-2', UserRole.staff)),
      );

      await expect(
        service.pushNotification('notif-pub', {}, auditActor, adminActor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockGateway.emitNotificationPushed).not.toHaveBeenCalled();
    });

    it('admin xoá được thông báo đã đẩy của bất kỳ ai', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue(
        publishedBy(makeAuthor('staff-2', UserRole.staff)),
      );

      await expect(
        service.deleteNotification('notif-pub', auditActor, adminActor),
      ).resolves.toEqual({ id: 'notif-pub' });
    });

    it('admin không xoá được nháp của người khác', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue(
        makeNotificationRow({ createdByUserId: 'staff-2' }),
      );

      await expect(
        service.deleteNotification('notif-1', auditActor, adminActor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('trợ lí không xoá được thông báo đã đẩy của staff khác (#269)', async () => {
      withStaffRoles([StaffRole.sale_customer_care_head]);
      mockPrisma.notification.findUnique.mockResolvedValue(
        publishedBy(
          makeAuthor('staff-2', UserRole.staff, [StaffRole.training]),
        ),
      );

      await expect(
        service.deleteNotification(
          'notif-pub',
          auditActor,
          staffActor('assistant-1'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.notification.delete).not.toHaveBeenCalled();
    });

    it('trợ lí không xoá được thông báo khi người tạo không còn tài khoản (#269)', async () => {
      withStaffRoles([StaffRole.sale_customer_care_head]);
      mockPrisma.notification.findUnique.mockResolvedValue(publishedBy(null));

      await expect(
        service.deleteNotification(
          'notif-pub',
          auditActor,
          staffActor('assistant-1'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.notification.delete).not.toHaveBeenCalled();
    });

    it('trợ lí xoá được thông báo do chính mình tạo', async () => {
      withStaffRoles([StaffRole.sale_customer_care_head]);
      mockPrisma.notification.findUnique.mockResolvedValue(
        publishedBy(makeAuthor('assistant-1', UserRole.staff)),
      );

      await expect(
        service.deleteNotification(
          'notif-pub',
          auditActor,
          staffActor('assistant-1'),
        ),
      ).resolves.toEqual({ id: 'notif-pub' });
    });

    it('staff có role admin xoá được thông báo đã đẩy của người khác', async () => {
      withStaffRoles([StaffRole.admin]);
      mockPrisma.notification.findUnique.mockResolvedValue(
        publishedBy(makeAuthor('staff-2', UserRole.staff)),
      );

      await expect(
        service.deleteNotification(
          'notif-pub',
          auditActor,
          staffActor('staff-admin'),
        ),
      ).resolves.toEqual({ id: 'notif-pub' });
    });

    it('staff thường không xoá được thông báo người khác, xoá được của mình', async () => {
      withStaffRoles([StaffRole.accountant_income]);
      mockPrisma.notification.findUnique.mockResolvedValueOnce(
        publishedBy(makeAuthor('staff-2', UserRole.staff)),
      );

      await expect(
        service.deleteNotification(
          'notif-pub',
          auditActor,
          staffActor('staff-1'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      mockPrisma.notification.findUnique.mockResolvedValueOnce(
        publishedBy(makeAuthor('staff-1', UserRole.staff)),
      );
      await expect(
        service.deleteNotification(
          'notif-pub',
          auditActor,
          staffActor('staff-1'),
        ),
      ).resolves.toEqual({ id: 'notif-pub' });
    });
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
    createdByUserId: string | null;
    createdBy: {
      id: string;
      email: string;
      accountHandle: string;
      first_name: string | null;
      last_name: string | null;
      roleType: UserRole;
      staffInfo: { roles: StaffRole[] } | null;
    } | null;
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
    createdByUserId:
      overrides.createdByUserId === undefined
        ? 'admin-1'
        : overrides.createdByUserId,
    createdAt: overrides.createdAt ?? new Date('2026-04-07T09:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-04-07T09:30:00.000Z'),
    createdBy: overrides.createdBy ?? null,
  };
}

function makeAuthor(
  id: string,
  roleType: UserRole,
  staffRoles: StaffRole[] = [],
) {
  return {
    id,
    email: `${id}@example.com`,
    accountHandle: id,
    first_name: null,
    last_name: null,
    roleType,
    staffInfo: roleType === UserRole.staff ? { roles: staffRoles } : null,
  };
}

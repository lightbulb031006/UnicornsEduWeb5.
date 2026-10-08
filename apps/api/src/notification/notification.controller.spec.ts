jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffRole, UserRole } from 'generated/enums';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { NotificationController } from './notification.controller';

const MANAGEMENT_HANDLERS = [
  'getAdminNotifications',
  'createNotificationDraft',
  'getNotificationRecipientOptions',
  'updateNotificationDraft',
  'pushNotification',
  'deleteNotification',
] as const;

const PUBLISHER_STAFF_ROLES = [
  StaffRole.assistant,
  StaffRole.lesson_plan,
  StaffRole.lesson_plan_head,
  StaffRole.accountant_income,
  StaffRole.accountant_expense,
  StaffRole.communication,
  StaffRole.technical,
  StaffRole.training,
];

describe('NotificationController permissions', () => {
  const authIdentityCacheService = { getStaffRoles: jest.fn() };
  const authAccessService = { resolveForUserId: jest.fn() };
  const guard = new RolesGuard(
    new Reflector(),
    authIdentityCacheService as never,
    authAccessService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    authAccessService.resolveForUserId.mockResolvedValue(null);
  });

  function contextFor(
    handlerName: keyof NotificationController,
    roleType: UserRole,
  ): ExecutionContext {
    const handler = Object.getOwnPropertyDescriptor(
      NotificationController.prototype,
      handlerName,
    )?.value as () => unknown;
    return {
      getHandler: () => handler,
      getClass: () => NotificationController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'user-1',
            email: 'user@example.com',
            accountHandle: 'user1',
            roleType,
          },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it.each(MANAGEMENT_HANDLERS)('lets admin call %s', async (handler) => {
    await expect(
      guard.canActivate(contextFor(handler, UserRole.admin)),
    ).resolves.toBe(true);
  });

  it.each(PUBLISHER_STAFF_ROLES)(
    'lets staff role %s create, push and manage notifications',
    async (staffRole) => {
      authIdentityCacheService.getStaffRoles.mockResolvedValue([staffRole]);

      for (const handler of MANAGEMENT_HANDLERS) {
        await expect(
          guard.canActivate(contextFor(handler, UserRole.staff)),
        ).resolves.toBe(true);
      }
    },
  );

  it.each([StaffRole.teacher, StaffRole.customer_care])(
    'rejects staff role %s on every management route',
    async (staffRole) => {
      authIdentityCacheService.getStaffRoles.mockResolvedValue([staffRole]);

      for (const handler of MANAGEMENT_HANDLERS) {
        await expect(
          guard.canActivate(contextFor(handler, UserRole.staff)),
        ).rejects.toThrow(ForbiddenException);
      }
    },
  );

  it('rejects teacher and customer care together', async () => {
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.teacher,
      StaffRole.customer_care,
    ]);

    await expect(
      guard.canActivate(contextFor('pushNotification', UserRole.staff)),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each([StaffRole.teacher, StaffRole.customer_care])(
    'still lets staff role %s read the feed',
    async (staffRole) => {
      authIdentityCacheService.getStaffRoles.mockResolvedValue([staffRole]);

      await expect(
        guard.canActivate(contextFor('getNotificationFeed', UserRole.staff)),
      ).resolves.toBe(true);
      await expect(
        guard.canActivate(
          contextFor('markFeedNotificationRead', UserRole.staff),
        ),
      ).resolves.toBe(true);
    },
  );
});

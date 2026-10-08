jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { StaffRole, UserRole } from 'generated/enums';
import { NotificationGateway } from './notification.gateway';

describe('NotificationGateway', () => {
  function createGateway() {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const gateway = new NotificationGateway(
      {} as never,
      {} as never,
      {} as never,
    );
    (gateway as unknown as { server: unknown }).server = { to };
    return { gateway, to, emit };
  }

  it('also pushes targeted notifications to admin rooms', () => {
    const { gateway, to, emit } = createGateway();

    gateway.emitNotificationPushed({ id: 'notif-1' } as never, {
      targetAll: false,
      targetRoleTypes: [],
      targetStaffRoles: [StaffRole.teacher],
      targetUserIds: ['user-1'],
    });

    expect(to).toHaveBeenCalledWith([
      `notifications:role:${UserRole.admin}`,
      `notifications:staff-role:${StaffRole.admin}`,
      `notifications:staff-role:${StaffRole.teacher}`,
      'notifications:user:user-1',
    ]);
    expect(emit).toHaveBeenCalledWith('notification.pushed', {
      id: 'notif-1',
    });
  });

  it('uses the shared room for notifications sent to everyone', () => {
    const { gateway, to } = createGateway();

    gateway.emitNotificationPushed({ id: 'notif-1' } as never, {
      targetAll: true,
      targetRoleTypes: [],
      targetStaffRoles: [],
      targetUserIds: [],
    });

    expect(to).toHaveBeenCalledWith(['notifications:all']);
  });
});

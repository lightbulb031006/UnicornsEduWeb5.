import { ExecutionContext, ForbiddenException } from '@nestjs/common';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { StaffRole, UserRole } from '../../generated/enums';
import { LessonManagementGuard } from './lesson-management.guard';

describe('LessonManagementGuard', () => {
  const mockPrisma = {
    staffInfo: {
      findFirst: jest.fn(),
    },
  };

  let guard: LessonManagementGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new LessonManagementGuard(mockPrisma as never);
  });

  function createContext(user: {
    id: string;
    email: string;
    accountHandle: string;
    roleType: UserRole;
  }): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as ExecutionContext;
  }

  it('allows admin without loading a staff profile', async () => {
    await expect(
      guard.canActivate(
        createContext({
          id: 'admin-1',
          email: 'admin@example.com',
          accountHandle: 'admin',
          roleType: UserRole.admin,
        }),
      ),
    ).resolves.toBe(true);

    expect(mockPrisma.staffInfo.findFirst).not.toHaveBeenCalled();
  });

  it('rejects non-staff non-admin actors', async () => {
    await expect(
      guard.canActivate(
        createContext({
          id: 'student-1',
          email: 'student@example.com',
          accountHandle: 'student',
          roleType: UserRole.student,
        }),
      ),
    ).rejects.toThrow(
      new ForbiddenException(
        'Chỉ admin hoặc staff.lesson_plan_head mới được quản lý giáo án.',
      ),
    );
  });

  it('rejects staff accounts without a linked staff profile', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        createContext({
          id: 'staff-1',
          email: 'staff@example.com',
          accountHandle: 'staff',
          roleType: UserRole.staff,
        }),
      ),
    ).rejects.toThrow(
      new ForbiddenException(
        'Tài khoản staff hiện tại chưa có hồ sơ nhân sự để dùng màn quản lý giáo án.',
      ),
    );
  });

  it('rejects staff accounts without lesson_plan_head role', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-info-1',
      roles: [StaffRole.lesson_plan],
    });

    await expect(
      guard.canActivate(
        createContext({
          id: 'staff-1',
          email: 'staff@example.com',
          accountHandle: 'staff',
          roleType: UserRole.staff,
        }),
      ),
    ).rejects.toThrow(
      new ForbiddenException(
        'Màn quản lý giáo án chỉ mở cho Admin hoặc staff có role lesson_plan_head.',
      ),
    );
  });

  // #267: Trợ lí không còn vào màn quản lý giáo án.
  it('rejects assistant staff', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-info-2',
      roles: [StaffRole.sale_customer_care_head],
    });

    await expect(
      guard.canActivate(
        createContext({
          id: 'staff-2',
          email: 'assistant@example.com',
          accountHandle: 'sale_customer_care_head',
          roleType: UserRole.staff,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows staff.lesson_plan_head to access lesson management', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-info-1',
      roles: [StaffRole.lesson_plan_head],
    });

    await expect(
      guard.canActivate(
        createContext({
          id: 'staff-1',
          email: 'staff@example.com',
          accountHandle: 'staff',
          roleType: UserRole.staff,
        }),
      ),
    ).resolves.toBe(true);
  });

  it('allows linked staff.admin even when the primary role is student', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-info-1',
      roles: [StaffRole.admin],
    });

    await expect(
      guard.canActivate(
        createContext({
          id: 'student-staff-admin',
          email: 'student-staff-admin@example.com',
          accountHandle: 'student-staff-admin',
          roleType: UserRole.student,
        }),
      ),
    ).resolves.toBe(true);
  });
});

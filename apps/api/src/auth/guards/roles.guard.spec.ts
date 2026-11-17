jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { StaffRole, UserRole } from '../../../generated/enums';
import { ALLOW_STAFF_ROLES_ON_ADMIN_KEY } from '../decorators/allow-staff-roles-on-admin.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

type GuardMetadata = {
  requiredRoles?: UserRole[];
  allowStaffRolesOnAdminRoutes?: StaffRole[];
};

type TestResolvedAuthAccess = {
  effectiveRoleTypes: UserRole[];
  staffRoles: StaffRole[];
  access: {
    admin: {
      canAccess: boolean;
      tier:
        | 'full'
        | 'sale_customer_care_head'
        | 'accountant'
        | 'lesson_plan_head'
        | null;
    };
  };
};

describe('RolesGuard', () => {
  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };
  const authIdentityCacheService = {
    getStaffRoles: jest.fn(),
  };
  const authAccessService = {
    resolveForUserId: jest.fn(),
  };

  let guard: RolesGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RolesGuard(
      mockReflector as unknown as Reflector,
      authIdentityCacheService as never,
      authAccessService as never,
    );
  });

  function createContext(
    user: {
      id: string;
      email: string;
      accountHandle: string;
      roleType: UserRole;
    },
    metadata: GuardMetadata,
    requestContext?: { resolvedAuthAccess?: TestResolvedAuthAccess },
  ): ExecutionContext {
    mockReflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === ROLES_KEY) {
        return metadata.requiredRoles;
      }

      if (key === ALLOW_STAFF_ROLES_ON_ADMIN_KEY) {
        return metadata.allowStaffRolesOnAdminRoutes;
      }

      return undefined;
    });

    return {
      getHandler: () => 'handler',
      getClass: () => 'controller',
      switchToHttp: () => ({
        getRequest: () => ({ user, ...requestContext }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows access when no role metadata is present', async () => {
    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-no-roles',
            email: 'staff-no-roles@example.com',
            accountHandle: 'staff-no-roles',
            roleType: UserRole.staff,
          },
          {},
        ),
      ),
    ).resolves.toBe(true);

    expect(authIdentityCacheService.getStaffRoles).not.toHaveBeenCalled();
  });

  // #267: trang quản trị mặc định đóng — không có danh sách staff role
  // tường minh thì chỉ Admin vào được, kể cả Trợ lí.
  it('rejects assistant on admin routes by default (deny-by-default)', async () => {
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.sale_customer_care_head,
    ]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-1',
            email: 'assistant@example.com',
            accountHandle: 'sale_customer_care_head',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.admin],
          },
        ),
      ),
    ).rejects.toThrow(
      new ForbiddenException('Only authorized roles can access this resource'),
    );
  });

  it('allows assistant on admin routes when the route lists the assistant role', async () => {
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.sale_customer_care_head,
    ]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-1-explicit',
            email: 'assistant-explicit@example.com',
            accountHandle: 'assistant-explicit',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.admin],
            allowStaffRolesOnAdminRoutes: [StaffRole.sale_customer_care_head],
          },
        ),
      ),
    ).resolves.toBe(true);
  });

  it('allows staff admin on admin routes without any staff role list', async () => {
    authIdentityCacheService.getStaffRoles.mockResolvedValue([StaffRole.admin]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-admin-1',
            email: 'staff-admin@example.com',
            accountHandle: 'staff-admin',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.admin],
          },
        ),
      ),
    ).resolves.toBe(true);
  });

  it('allows an effective student role from a linked student profile', async () => {
    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-student-1',
            email: 'staff-student@example.com',
            accountHandle: 'staff-student',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.student],
          },
          {
            resolvedAuthAccess: {
              effectiveRoleTypes: [UserRole.staff, UserRole.student],
              staffRoles: [],
              access: { admin: { canAccess: false, tier: null } },
            },
          },
        ),
      ),
    ).resolves.toBe(true);
  });

  it('allows staff admin access from a linked staff profile when primary role is student', async () => {
    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'student-staff-admin-1',
            email: 'student-staff-admin@example.com',
            accountHandle: 'student-staff-admin',
            roleType: UserRole.student,
          },
          {
            requiredRoles: [UserRole.admin],
          },
          {
            resolvedAuthAccess: {
              effectiveRoleTypes: [UserRole.student, UserRole.staff],
              staffRoles: [StaffRole.admin],
              access: { admin: { canAccess: true, tier: 'full' } },
            },
          },
        ),
      ),
    ).resolves.toBe(true);
  });

  it('allows accountant when the route explicitly permits accountant', async () => {
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.accountant_income,
    ]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-2',
            email: 'accountant@example.com',
            accountHandle: 'accountant',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.admin],
            allowStaffRolesOnAdminRoutes: [StaffRole.accountant_income],
          },
        ),
      ),
    ).resolves.toBe(true);
  });

  it('rejects assistant when explicit admin-route staff roles omit assistant', async () => {
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.sale_customer_care_head,
    ]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-allowed-roles-assistant',
            email: 'assistant@example.com',
            accountHandle: 'sale_customer_care_head',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.admin],
            allowStaffRolesOnAdminRoutes: [StaffRole.accountant_income],
          },
        ),
      ),
    ).rejects.toThrow(
      new ForbiddenException('Only authorized roles can access this resource'),
    );
  });

  it('rejects assistant and accountant when explicit admin-route staff roles are empty', async () => {
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.sale_customer_care_head,
    ]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-roster-assistant',
            email: 'assistant@example.com',
            accountHandle: 'sale_customer_care_head',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.admin],
            allowStaffRolesOnAdminRoutes: [],
          },
        ),
      ),
    ).rejects.toThrow(
      new ForbiddenException('Only authorized roles can access this resource'),
    );

    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.accountant_income,
    ]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-roster-accountant',
            email: 'accountant@example.com',
            accountHandle: 'accountant',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.admin],
            allowStaffRolesOnAdminRoutes: [],
          },
        ),
      ),
    ).rejects.toThrow(
      new ForbiddenException('Only authorized roles can access this resource'),
    );
  });

  it('rejects accountant on admin routes without explicit accountant access', async () => {
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.accountant_income,
    ]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-3',
            email: 'accountant@example.com',
            accountHandle: 'accountant',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.admin],
          },
        ),
      ),
    ).rejects.toThrow(
      new ForbiddenException('Only authorized roles can access this resource'),
    );
  });

  it('allows only the listed staff role (accountant) and rejects assistant', async () => {
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.accountant_income,
    ]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-4',
            email: 'accountant@example.com',
            accountHandle: 'accountant',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.admin],
            allowStaffRolesOnAdminRoutes: [StaffRole.accountant_income],
          },
        ),
      ),
    ).resolves.toBe(true);

    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.sale_customer_care_head,
    ]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-5',
            email: 'assistant@example.com',
            accountHandle: 'sale_customer_care_head',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.admin],
            allowStaffRolesOnAdminRoutes: [StaffRole.accountant_income],
          },
        ),
      ),
    ).rejects.toThrow(
      new ForbiddenException('Only authorized roles can access this resource'),
    );
  });
});

describe('RolesGuard deny-by-default for every non-admin staff role (#267)', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const identity = { getStaffRoles: jest.fn() };
  const guard = new RolesGuard(
    reflector as unknown as Reflector,
    identity as never,
    { resolveForUserId: jest.fn() } as never,
  );

  const ctx = () =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'controller',
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'staff-x',
            email: 'x@example.com',
            accountHandle: 'x',
            roleType: UserRole.staff,
          },
        }),
      }),
    }) as unknown as ExecutionContext;

  const nonAdminRoles = Object.values(StaffRole).filter(
    (role) => role !== StaffRole.admin,
  );

  it.each(nonAdminRoles)(
    'rejects %s on an admin route without a staff role list',
    async (role) => {
      reflector.getAllAndOverride.mockImplementation((key: string) =>
        key === ROLES_KEY ? [UserRole.admin] : undefined,
      );
      identity.getStaffRoles.mockResolvedValue([role]);

      await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    },
  );

  it.each(nonAdminRoles)(
    'allows %s when the admin route lists that role explicitly',
    async (role) => {
      reflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === ROLES_KEY) return [UserRole.admin];
        if (key === ALLOW_STAFF_ROLES_ON_ADMIN_KEY) return [role];
        return undefined;
      });
      identity.getStaffRoles.mockResolvedValue([role]);

      await expect(guard.canActivate(ctx())).resolves.toBe(true);
    },
  );
});

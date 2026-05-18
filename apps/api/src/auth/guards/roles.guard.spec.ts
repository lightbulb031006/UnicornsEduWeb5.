jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { StaffRole, UserRole } from '../../../generated/enums';
import { ALLOW_ASSISTANT_ON_ADMIN_KEY } from '../decorators/allow-assistant-on-admin.decorator';
import { ALLOW_STAFF_ROLES_ON_ADMIN_KEY } from '../decorators/allow-staff-roles-on-admin.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

type GuardMetadata = {
  requiredRoles?: UserRole[];
  allowAssistantOnAdminRoutes?: boolean;
  allowStaffRolesOnAdminRoutes?: StaffRole[];
};

type TestResolvedAuthAccess = {
  effectiveRoleTypes: UserRole[];
  staffRoles: StaffRole[];
  access: {
    admin: {
      canAccess: boolean;
      tier: 'full' | 'assistant' | 'accountant' | 'lesson_plan_head' | null;
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

      if (key === ALLOW_ASSISTANT_ON_ADMIN_KEY) {
        return metadata.allowAssistantOnAdminRoutes;
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

  it('allows assistant on admin routes by default', async () => {
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.assistant,
    ]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-1',
            email: 'assistant@example.com',
            accountHandle: 'assistant',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.admin],
          },
        ),
      ),
    ).resolves.toBe(true);
  });

  it('allows staff admin on admin routes regardless of assistant fallback', async () => {
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
            allowAssistantOnAdminRoutes: false,
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
            allowAssistantOnAdminRoutes: false,
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
      StaffRole.accountant,
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
            allowStaffRolesOnAdminRoutes: [StaffRole.accountant],
          },
        ),
      ),
    ).resolves.toBe(true);
  });

  it('rejects assistant when explicit admin-route staff roles omit assistant', async () => {
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.assistant,
    ]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-allowed-roles-assistant',
            email: 'assistant@example.com',
            accountHandle: 'assistant',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.admin],
            allowStaffRolesOnAdminRoutes: [StaffRole.accountant],
          },
        ),
      ),
    ).rejects.toThrow(
      new ForbiddenException('Only authorized roles can access this resource'),
    );
  });

  it('rejects assistant and accountant when explicit admin-route staff roles are empty', async () => {
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.assistant,
    ]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-roster-assistant',
            email: 'assistant@example.com',
            accountHandle: 'assistant',
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
      StaffRole.accountant,
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
      StaffRole.accountant,
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

  it('allows accountant and rejects assistant when assistant fallback is disabled', async () => {
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.accountant,
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
            allowAssistantOnAdminRoutes: false,
            allowStaffRolesOnAdminRoutes: [StaffRole.accountant],
          },
        ),
      ),
    ).resolves.toBe(true);

    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.assistant,
    ]);

    await expect(
      guard.canActivate(
        createContext(
          {
            id: 'staff-5',
            email: 'assistant@example.com',
            accountHandle: 'assistant',
            roleType: UserRole.staff,
          },
          {
            requiredRoles: [UserRole.admin],
            allowAssistantOnAdminRoutes: false,
            allowStaffRolesOnAdminRoutes: [StaffRole.accountant],
          },
        ),
      ),
    ).rejects.toThrow(
      new ForbiddenException('Only authorized roles can access this resource'),
    );
  });
});

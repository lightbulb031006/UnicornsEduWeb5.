jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StaffRole, StaffStatus } from '../../generated/enums';
import { FixedSalarySettingsService } from './fixed-salary-settings.service';
import { FIXED_SALARY_STAFF_ROLES } from './fixed-salary-staff-roles';

describe('FixedSalarySettingsService', () => {
  const salaryRows: Array<{
    id: string;
    roleType: StaffRole;
    amount: number | null;
    updatedAt: Date;
  }> = [];
  const operatingRows: Array<{
    id: string;
    roleType: StaffRole;
    ratePercent: number | null;
    updatedAt: Date;
  }> = [];
  const staffRows: Array<{
    id: string;
    roles: StaffRole[];
    status: StaffStatus;
    user: {
      first_name: string;
      last_name: string;
      accountHandle: string | null;
      email: string | null;
    };
  }> = [];
  const staffSalaryOverrideRows: Array<{
    id: string;
    staffId: string;
    roleType: StaffRole;
    amount: number;
  }> = [];
  const staffOperatingOverrideRows: Array<{
    id: string;
    staffId: string;
    roleType: StaffRole;
    ratePercent: number;
  }> = [];

  const mockPrisma = {
    roleFixedSalaryDefault: {
      findMany: jest.fn(async () => [...salaryRows]),
      findUnique: jest.fn(
        async ({ where }: { where: { roleType?: StaffRole; id?: string } }) =>
          salaryRows.find((row) =>
            where.roleType
              ? row.roleType === where.roleType
              : row.id === where.id,
          ) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: (typeof salaryRows)[number] }) => {
        const row = {
          id: `salary-${data.roleType}`,
          roleType: data.roleType,
          amount: data.amount ?? null,
          updatedAt: new Date('2026-09-09T00:00:00.000Z'),
        };
        salaryRows.push(row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { amount: number | null };
        }) => {
          const row = salaryRows.find((item) => item.id === where.id);
          if (!row) {
            throw new Error('missing');
          }
          row.amount = data.amount;
          return row;
        },
      ),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const index = salaryRows.findIndex((row) => row.id === where.id);
        const [removed] = salaryRows.splice(index, 1);
        return removed;
      }),
    },
    roleFixedSalaryOperatingRateDefault: {
      findMany: jest.fn(async () => [...operatingRows]),
      findUnique: jest.fn(
        async ({ where }: { where: { roleType?: StaffRole; id?: string } }) =>
          operatingRows.find((row) =>
            where.roleType
              ? row.roleType === where.roleType
              : row.id === where.id,
          ) ?? null,
      ),
      create: jest.fn(
        async ({ data }: { data: (typeof operatingRows)[number] }) => {
          const row = {
            id: `operating-${data.roleType}`,
            roleType: data.roleType,
            ratePercent: data.ratePercent ?? null,
            updatedAt: new Date('2026-09-09T00:00:00.000Z'),
          };
          operatingRows.push(row);
          return row;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { ratePercent: number | null };
        }) => {
          const row = operatingRows.find((item) => item.id === where.id);
          if (!row) {
            throw new Error('missing');
          }
          row.ratePercent = data.ratePercent;
          return row;
        },
      ),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const index = operatingRows.findIndex((row) => row.id === where.id);
        const [removed] = operatingRows.splice(index, 1);
        return removed;
      }),
    },
    staffInfo: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where?: { id?: string; status?: StaffStatus };
        } = {}) =>
          staffRows.filter((row) => {
            if (where?.id && row.id !== where.id) {
              return false;
            }
            if (where?.status && row.status !== where.status) {
              return false;
            }
            return true;
          }),
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = staffRows.find((item) => item.id === where.id);
        return row
          ? { id: row.id, roles: row.roles, user: row.user }
          : null;
      }),
    },
    staffFixedSalaryOverride: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where?: { staffId?: { in: string[] } | string };
        } = {}) => {
          const ids =
            where?.staffId && typeof where.staffId === 'object'
              ? where.staffId.in
              : undefined;
          const staffId =
            typeof where?.staffId === 'string' ? where.staffId : undefined;
          return staffSalaryOverrideRows.filter((row) => {
            if (ids && !ids.includes(row.staffId)) {
              return false;
            }
            if (staffId && row.staffId !== staffId) {
              return false;
            }
            return true;
          });
        },
      ),
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: {
            staffId_roleType?: { staffId: string; roleType: StaffRole };
            id?: string;
          };
        }) =>
          staffSalaryOverrideRows.find((row) =>
            where.staffId_roleType
              ? row.staffId === where.staffId_roleType.staffId &&
                row.roleType === where.staffId_roleType.roleType
              : row.id === where.id,
          ) ?? null,
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: { staffId: string; roleType: StaffRole; amount: number };
        }) => {
          const row = {
            id: `staff-salary-${data.staffId}-${data.roleType}`,
            staffId: data.staffId,
            roleType: data.roleType,
            amount: data.amount,
          };
          staffSalaryOverrideRows.push(row);
          return row;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { amount: number };
        }) => {
          const row = staffSalaryOverrideRows.find(
            (item) => item.id === where.id,
          );
          if (!row) {
            throw new Error('missing');
          }
          row.amount = data.amount;
          return row;
        },
      ),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const index = staffSalaryOverrideRows.findIndex(
          (row) => row.id === where.id,
        );
        const [removed] = staffSalaryOverrideRows.splice(index, 1);
        return removed;
      }),
    },
    staffFixedSalaryOperatingRateOverride: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where?: { staffId?: { in: string[] } | string };
        } = {}) => {
          const ids =
            where?.staffId && typeof where.staffId === 'object'
              ? where.staffId.in
              : undefined;
          const staffId =
            typeof where?.staffId === 'string' ? where.staffId : undefined;
          return staffOperatingOverrideRows.filter((row) => {
            if (ids && !ids.includes(row.staffId)) {
              return false;
            }
            if (staffId && row.staffId !== staffId) {
              return false;
            }
            return true;
          });
        },
      ),
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: {
            staffId_roleType?: { staffId: string; roleType: StaffRole };
            id?: string;
          };
        }) =>
          staffOperatingOverrideRows.find((row) =>
            where.staffId_roleType
              ? row.staffId === where.staffId_roleType.staffId &&
                row.roleType === where.staffId_roleType.roleType
              : row.id === where.id,
          ) ?? null,
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: {
            staffId: string;
            roleType: StaffRole;
            ratePercent: number;
          };
        }) => {
          const row = {
            id: `staff-operating-${data.staffId}-${data.roleType}`,
            staffId: data.staffId,
            roleType: data.roleType,
            ratePercent: data.ratePercent,
          };
          staffOperatingOverrideRows.push(row);
          return row;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { ratePercent: number };
        }) => {
          const row = staffOperatingOverrideRows.find(
            (item) => item.id === where.id,
          );
          if (!row) {
            throw new Error('missing');
          }
          row.ratePercent = data.ratePercent;
          return row;
        },
      ),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const index = staffOperatingOverrideRows.findIndex(
          (row) => row.id === where.id,
        );
        const [removed] = staffOperatingOverrideRows.splice(index, 1);
        return removed;
      }),
    },
    staffFixedSalaryPayable: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const actionHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };

  let service: FixedSalarySettingsService;

  beforeEach(() => {
    salaryRows.length = 0;
    operatingRows.length = 0;
    staffRows.length = 0;
    staffSalaryOverrideRows.length = 0;
    staffOperatingOverrideRows.length = 0;
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (callback: (db: typeof mockPrisma) => unknown) => callback(mockPrisma),
    );
    service = new FixedSalarySettingsService(
      mockPrisma as never,
      actionHistoryService as never,
    );
  });

  it('returns every fixed-salary StaffRole except teacher, with null amount when unconfigured', async () => {
    salaryRows.push({
      id: 'salary-communication',
      roleType: StaffRole.communication,
      amount: 8_000_000,
      updatedAt: new Date('2026-09-09T00:00:00.000Z'),
    });
    salaryRows.push({
      id: 'salary-teacher-leftover',
      roleType: StaffRole.teacher,
      amount: 9_000_000,
      updatedAt: new Date('2026-09-09T00:00:00.000Z'),
    });

    const result = await service.getRoleDefaults();
    const roleTypes = result.roles.map((row) => row.roleType);

    expect(roleTypes).toEqual(FIXED_SALARY_STAFF_ROLES);
    expect(roleTypes).not.toContain(StaffRole.teacher);
    expect(result.roles.find((row) => row.roleType === StaffRole.communication)).toEqual(
      expect.objectContaining({
        amount: 8_000_000,
      }),
    );
    expect(
      result.roles.find((row) => row.roleType === StaffRole.assistant),
    ).toEqual(
      expect.objectContaining({
        amount: null,
        id: null,
      }),
    );
    expect(
      result.roles.find((row) => row.roleType === StaffRole.communication),
    ).not.toHaveProperty('operatingRatePercent');
  });

  it('rejects teacher on role-default and override writes', async () => {
    await expect(
      service.upsertRoleDefaults({
        items: [{ roleType: StaffRole.teacher, amount: 8_000_000 }],
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.upsertRoleOperatingRates({
        items: [{ roleType: StaffRole.teacher, operatingRatePercent: 10 }],
      }),
    ).rejects.toThrow(BadRequestException);

    seedDualRoleStaff();
    await expect(
      service.upsertStaffAmountOverride({
        staffId: 'staff-an',
        roleType: StaffRole.teacher,
        amount: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('upserts a role salary default, records before/after history, and rejects invalid values', async () => {
    const actor = {
      userId: 'admin-1',
      userEmail: 'admin@example.com',
      roleType: 'admin',
    };

    await service.upsertRoleDefaults(
      {
        items: [
          {
            roleType: StaffRole.assistant,
            amount: 5_000_000,
          },
        ],
      },
      actor,
    );

    expect(actionHistoryService.recordCreate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'role_fixed_salary_default',
        description: 'Create role default fixed salary',
        afterValue: expect.objectContaining({
          roleType: StaffRole.assistant,
          amount: 5_000_000,
        }),
      }),
    );

    await service.upsertRoleDefaults(
      {
        items: [
          {
            roleType: StaffRole.assistant,
            amount: 6_000_000,
          },
        ],
      },
      actor,
    );

    expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'role_fixed_salary_default',
        beforeValue: expect.objectContaining({ amount: 5_000_000 }),
        afterValue: expect.objectContaining({ amount: 6_000_000 }),
      }),
    );

    await expect(
      service.upsertRoleDefaults({
        items: [
          {
            roleType: StaffRole.assistant,
            amount: -1,
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('keeps 0 as a configured salary and treats null as unconfigured', async () => {
    await service.upsertRoleDefaults({
      items: [{ roleType: StaffRole.communication, amount: 0 }],
    });

    expect(
      (await service.getRoleDefaults()).roles.find(
        (row) => row.roleType === StaffRole.communication,
      ),
    ).toEqual(expect.objectContaining({ amount: 0, id: 'salary-communication' }));

    await service.upsertRoleDefaults({
      items: [{ roleType: StaffRole.communication, amount: null }],
    });

    expect(
      (await service.getRoleDefaults()).roles.find(
        (row) => row.roleType === StaffRole.communication,
      ),
    ).toEqual(expect.objectContaining({ amount: null, id: null }));
  });

  it('does not touch session, class-teacher, or operating-rate tables when saving salary defaults', async () => {
    const sessionUpdate = jest.fn();
    const classTeacherUpdate = jest.fn();
    (mockPrisma as { session?: { update: jest.Mock }; classTeacher?: { update: jest.Mock } }).session =
      { update: sessionUpdate };
    (mockPrisma as { classTeacher?: { update: jest.Mock } }).classTeacher = {
      update: classTeacherUpdate,
    };

    await service.upsertRoleDefaults({
      items: [
        {
          roleType: StaffRole.communication,
          amount: 10_000_000,
        },
      ],
    });

    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(classTeacherUpdate).not.toHaveBeenCalled();
    expect(mockPrisma.roleFixedSalaryDefault.create).toHaveBeenCalled();
    expect(
      mockPrisma.roleFixedSalaryOperatingRateDefault.create,
    ).not.toHaveBeenCalled();
  });

  it('clears one policy without deleting the other, including a stored 0%', async () => {
    const actor = {
      userId: 'admin-1',
      userEmail: 'admin@example.com',
      roleType: 'admin',
    };

    await service.upsertRoleDefaults({
      items: [{ roleType: StaffRole.communication, amount: 8_000_000 }],
    });
    await service.upsertRoleOperatingRates(
      {
        items: [{ roleType: StaffRole.communication, operatingRatePercent: 0 }],
      },
      actor,
    );

    expect(
      (await service.getRoleOperatingRates()).roles.find(
        (row) => row.roleType === StaffRole.communication,
      ),
    ).toEqual(
      expect.objectContaining({
        operatingRatePercent: 0,
        id: 'operating-communication',
      }),
    );

    await service.upsertRoleDefaults(
      {
        items: [{ roleType: StaffRole.communication, amount: null }],
      },
      actor,
    );

    expect(
      (await service.getRoleDefaults()).roles.find(
        (row) => row.roleType === StaffRole.communication,
      ),
    ).toEqual(expect.objectContaining({ amount: null, id: null }));
    expect(
      (await service.getRoleOperatingRates()).roles.find(
        (row) => row.roleType === StaffRole.communication,
      ),
    ).toEqual(
      expect.objectContaining({
        operatingRatePercent: 0,
        id: 'operating-communication',
      }),
    );
    expect(actionHistoryService.recordDelete).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'role_fixed_salary_default',
      }),
    );

    await service.upsertRoleOperatingRates({
      items: [{ roleType: StaffRole.communication, operatingRatePercent: null }],
    });

    expect(
      (await service.getRoleOperatingRates()).roles.find(
        (row) => row.roleType === StaffRole.communication,
      ),
    ).toEqual(expect.objectContaining({ operatingRatePercent: null, id: null }));
    expect(salaryRows).toHaveLength(0);
  });

  it('upserts operating rates independently and rejects percent outside 0–100', async () => {
    const actor = {
      userId: 'admin-1',
      userEmail: 'admin@example.com',
      roleType: 'admin',
    };

    await service.upsertRoleOperatingRates(
      {
        items: [
          {
            roleType: StaffRole.assistant,
            operatingRatePercent: 8,
          },
        ],
      },
      actor,
    );

    expect(actionHistoryService.recordCreate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'role_fixed_salary_operating_rate_default',
        afterValue: expect.objectContaining({
          operatingRatePercent: 8,
        }),
      }),
    );

    await expect(
      service.upsertRoleOperatingRates({
        items: [
          {
            roleType: StaffRole.assistant,
            operatingRatePercent: 120,
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrisma.roleFixedSalaryDefault.create).not.toHaveBeenCalled();
  });

  function seedDualRoleStaff() {
    staffRows.push({
      id: 'staff-an',
      roles: [StaffRole.communication, StaffRole.assistant],
      status: StaffStatus.active,
      user: {
        first_name: 'An',
        last_name: 'Nguyen',
        accountHandle: 'an',
        email: 'an@example.com',
      },
    });
  }

  it('resolves each staff-role row independently, including 0 override and missing role default', async () => {
    seedDualRoleStaff();
    salaryRows.push({
      id: 'salary-teacher',
      roleType: StaffRole.communication,
      amount: 8_000_000,
      updatedAt: new Date('2026-09-09T00:00:00.000Z'),
    });
    staffSalaryOverrideRows.push({
      id: 'override-teacher-zero',
      staffId: 'staff-an',
      roleType: StaffRole.communication,
      amount: 0,
    });
    staffOperatingOverrideRows.push({
      id: 'override-teacher-rate',
      staffId: 'staff-an',
      roleType: StaffRole.communication,
      ratePercent: 12,
    });

    const result = await service.getStaffOverrides({});
    const teacherRow = result.staff[0]?.roles.find(
      (row) => row.roleType === StaffRole.communication,
    );
    const assistantRow = result.staff[0]?.roles.find(
      (row) => row.roleType === StaffRole.assistant,
    );

    expect(result.staff[0]?.roles).toHaveLength(2);
    expect(teacherRow?.amount).toEqual(
      expect.objectContaining({
        applied: 0,
        source: 'override',
        hasOverride: true,
      }),
    );
    expect(teacherRow?.operatingRate).toEqual(
      expect.objectContaining({
        applied: 12,
        source: 'override',
      }),
    );
    expect(assistantRow?.amount).toEqual(
      expect.objectContaining({
        applied: null,
        source: 'unconfigured',
        hasOverride: false,
      }),
    );
    expect(assistantRow?.operatingRate.source).toBe('unconfigured');
  });

  it('writes one axis without creating or freezing the other, then follows a later role default', async () => {
    const actor = {
      userId: 'admin-1',
      userEmail: 'admin@example.com',
      roleType: 'admin',
    };
    seedDualRoleStaff();
    salaryRows.push({
      id: 'salary-teacher',
      roleType: StaffRole.communication,
      amount: 8_000_000,
      updatedAt: new Date('2026-09-09T00:00:00.000Z'),
    });
    operatingRows.push({
      id: 'operating-teacher',
      roleType: StaffRole.communication,
      ratePercent: 10,
      updatedAt: new Date('2026-09-09T00:00:00.000Z'),
    });

    await service.upsertStaffOperatingRateOverride(
      {
        staffId: 'staff-an',
        roleType: StaffRole.communication,
        operatingRatePercent: 15,
      },
      actor,
    );

    expect(staffOperatingOverrideRows).toHaveLength(1);
    expect(staffSalaryOverrideRows).toHaveLength(0);
    expect(mockPrisma.staffFixedSalaryOverride.create).not.toHaveBeenCalled();
    expect(actionHistoryService.recordCreate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'staff_fixed_salary_operating_rate_override',
      }),
    );

    salaryRows[0].amount = 9_000_000;
    const afterRoleChange = await service.getStaffOverrides({
      staffId: 'staff-an',
    });
    const teacherRow = afterRoleChange.staff[0]?.roles.find(
      (row) => row.roleType === StaffRole.communication,
    );

    expect(teacherRow?.amount).toEqual(
      expect.objectContaining({
        applied: 9_000_000,
        source: 'role_default',
      }),
    );
    expect(teacherRow?.operatingRate).toEqual(
      expect.objectContaining({
        applied: 15,
        source: 'override',
      }),
    );
  });

  it('stores amount override 0, clears it back to the role default, and rejects a role the staff does not hold', async () => {
    const actor = {
      userId: 'admin-1',
      userEmail: 'admin@example.com',
      roleType: 'admin',
    };
    seedDualRoleStaff();
    salaryRows.push({
      id: 'salary-teacher',
      roleType: StaffRole.communication,
      amount: 8_000_000,
      updatedAt: new Date('2026-09-09T00:00:00.000Z'),
    });

    await service.upsertStaffAmountOverride(
      {
        staffId: 'staff-an',
        roleType: StaffRole.communication,
        amount: 0,
      },
      actor,
    );

    expect(staffSalaryOverrideRows[0]?.amount).toBe(0);
    expect(
      (await service.getStaffOverrides({ staffId: 'staff-an' })).staff[0]?.roles.find(
        (row) => row.roleType === StaffRole.communication,
      )?.amount.source,
    ).toBe('override');

    await service.upsertStaffAmountOverride(
      {
        staffId: 'staff-an',
        roleType: StaffRole.communication,
        amount: null,
      },
      actor,
    );

    expect(staffSalaryOverrideRows).toHaveLength(0);
    expect(actionHistoryService.recordDelete).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'staff_fixed_salary_override',
      }),
    );
    expect(
      (await service.getStaffOverrides({ staffId: 'staff-an' })).staff[0]?.roles.find(
        (row) => row.roleType === StaffRole.communication,
      )?.amount,
    ).toEqual(
      expect.objectContaining({
        applied: 8_000_000,
        source: 'role_default',
      }),
    );

    await expect(
      service.upsertStaffAmountOverride({
        staffId: 'staff-an',
        roleType: StaffRole.accountant,
        amount: 1,
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.upsertStaffAmountOverride({
        staffId: 'missing',
        roleType: StaffRole.communication,
        amount: 1,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('applies a new-role amount override inside sync without requiring the role beforehand', async () => {
    const actor = {
      userId: 'admin-1',
      userEmail: 'admin@example.com',
      roleType: 'admin',
    };
    staffRows.push({
      id: 'staff-an',
      roles: [StaffRole.communication],
      status: StaffStatus.active,
      user: {
        first_name: 'An',
        last_name: 'Nguyen',
        accountHandle: 'an',
        email: 'an@example.com',
      },
    });
    const staff = {
      user: staffRows[0]?.user,
    };

    await service.syncStaffRoleOverridesInTx(mockPrisma as never, {
      staffId: 'staff-an',
      nextRoles: [StaffRole.communication, StaffRole.assistant],
      items: [
        {
          roleType: StaffRole.assistant,
          amount: 0,
          operatingRatePercent: null,
        },
      ],
      staff,
      actor,
    });

    expect(staffSalaryOverrideRows).toEqual([
      expect.objectContaining({
        staffId: 'staff-an',
        roleType: StaffRole.assistant,
        amount: 0,
      }),
    ]);
    expect(staffOperatingOverrideRows).toHaveLength(0);
    expect(actionHistoryService.recordCreate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'staff_fixed_salary_override',
      }),
    );
  });

  it('clears removed-role overrides and leaves the other axis untouched when only amount is sent', async () => {
    seedDualRoleStaff();
    staffSalaryOverrideRows.push({
      id: 'override-teacher-amount',
      staffId: 'staff-an',
      roleType: StaffRole.communication,
      amount: 1_000_000,
    });
    staffOperatingOverrideRows.push({
      id: 'override-teacher-rate',
      staffId: 'staff-an',
      roleType: StaffRole.communication,
      ratePercent: 9,
    });
    staffSalaryOverrideRows.push({
      id: 'override-assistant-amount',
      staffId: 'staff-an',
      roleType: StaffRole.assistant,
      amount: 500_000,
    });

    await service.syncStaffRoleOverridesInTx(mockPrisma as never, {
      staffId: 'staff-an',
      nextRoles: [StaffRole.communication],
      items: [
        {
          roleType: StaffRole.communication,
          amount: 2_000_000,
        },
      ],
      staff: { user: staffRows[0]?.user },
    });

    expect(
      staffSalaryOverrideRows.find((row) => row.roleType === StaffRole.assistant),
    ).toBeUndefined();
    expect(
      staffSalaryOverrideRows.find((row) => row.roleType === StaffRole.communication)
        ?.amount,
    ).toBe(2_000_000);
    expect(
      staffOperatingOverrideRows.find((row) => row.roleType === StaffRole.communication)
        ?.ratePercent,
    ).toBe(9);
  });

  it('records override deletion with the disabled role and does not touch closed-month payables', async () => {
    seedDualRoleStaff();
    const actor = {
      userId: 'admin-1',
      userEmail: 'admin@example.com',
      roleType: 'admin',
    };
    staffSalaryOverrideRows.push({
      id: 'override-assistant-amount',
      staffId: 'staff-an',
      roleType: StaffRole.assistant,
      amount: 12_000_000,
    });
    staffOperatingOverrideRows.push({
      id: 'override-assistant-rate',
      staffId: 'staff-an',
      roleType: StaffRole.assistant,
      ratePercent: 15,
    });

    await service.syncStaffRoleOverridesInTx(mockPrisma as never, {
      staffId: 'staff-an',
      nextRoles: [StaffRole.communication],
      items: [],
      staff: { user: staffRows[0]?.user },
      actor,
    });

    expect(
      staffSalaryOverrideRows.find((row) => row.roleType === StaffRole.assistant),
    ).toBeUndefined();
    expect(
      staffOperatingOverrideRows.find(
        (row) => row.roleType === StaffRole.assistant,
      ),
    ).toBeUndefined();
    expect(actionHistoryService.recordDelete).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'staff_fixed_salary_override',
        description: 'Xóa mức đè lương cứng vì tắt vai trò assistant',
        beforeValue: expect.objectContaining({
          roleType: StaffRole.assistant,
          amount: 12_000_000,
        }),
      }),
    );
    expect(actionHistoryService.recordDelete).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'staff_fixed_salary_operating_rate_override',
        description: 'Xóa mức đè % vận hành lương cứng vì tắt vai trò assistant',
        beforeValue: expect.objectContaining({
          roleType: StaffRole.assistant,
          operatingRatePercent: 15,
        }),
      }),
    );
    expect(mockPrisma.staffFixedSalaryPayable.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.staffFixedSalaryPayable.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.staffFixedSalaryPayable.update).not.toHaveBeenCalled();
    expect(mockPrisma.staffFixedSalaryPayable.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an override for a role that is not in the accompanying roles list', async () => {
    await expect(
      service.syncStaffRoleOverridesInTx(mockPrisma as never, {
        staffId: 'staff-an',
        nextRoles: [StaffRole.communication],
        items: [
          {
            roleType: StaffRole.assistant,
            amount: 1,
          },
        ],
        staff: {},
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns inactive staff when looking up overrides by exact staffId', async () => {
    staffRows.push({
      id: 'staff-idle',
      roles: [StaffRole.communication],
      status: StaffStatus.inactive,
      user: {
        first_name: 'Idle',
        last_name: 'Staff',
        accountHandle: 'idle',
        email: 'idle@example.com',
      },
    });

    const listed = await service.getStaffOverrides({ search: 'Idle' });
    expect(listed.staff).toHaveLength(0);

    const byId = await service.getStaffOverrides({ staffId: 'staff-idle' });
    expect(byId.staff[0]?.staffId).toBe('staff-idle');
  });

  it('omits teacher from resolved override rows and clears leftover teacher overrides on sync', async () => {
    staffRows.push({
      id: 'staff-tutor',
      roles: [StaffRole.teacher, StaffRole.assistant],
      status: StaffStatus.active,
      user: {
        first_name: 'Tutor',
        last_name: 'Staff',
        accountHandle: 'tutor',
        email: 'tutor@example.com',
      },
    });
    staffSalaryOverrideRows.push({
      id: 'override-teacher-leftover',
      staffId: 'staff-tutor',
      roleType: StaffRole.teacher,
      amount: 8_000_000,
    });

    const listed = await service.getStaffOverrides({ staffId: 'staff-tutor' });
    expect(listed.staff[0]?.roles.map((row) => row.roleType)).toEqual([
      StaffRole.assistant,
    ]);

    await service.syncStaffRoleOverridesInTx(mockPrisma as never, {
      staffId: 'staff-tutor',
      nextRoles: [StaffRole.teacher, StaffRole.assistant],
      items: [],
      staff: { user: staffRows[0]?.user },
    });

    expect(
      staffSalaryOverrideRows.find((row) => row.roleType === StaffRole.teacher),
    ).toBeUndefined();
  });
});

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { StaffRole, StaffStatus } from '../../generated/enums';
import { calculateDeductionAmounts } from '../payroll/deduction-rates';
import { FixedSalaryCloseService } from './fixed-salary-close.service';

describe('FixedSalaryCloseService', () => {
  const staffRows: Array<{
    id: string;
    roles: StaffRole[];
    status: StaffStatus;
    user: { first_name: string; last_name: string };
  }> = [];
  const salaryDefaults: Array<{ roleType: StaffRole; amount: number | null }> =
    [];
  const operatingDefaults: Array<{
    roleType: StaffRole;
    ratePercent: number | null;
  }> = [];
  const salaryOverrides: Array<{
    staffId: string;
    roleType: StaffRole;
    amount: number;
  }> = [];
  const operatingOverrides: Array<{
    staffId: string;
    roleType: StaffRole;
    ratePercent: number;
  }> = [];
  const taxOverrides: Array<{
    staffId: string;
    roleType: StaffRole;
    ratePercent: number;
  }> = [];
  const roleTaxDefaults: Array<{ roleType: StaffRole; ratePercent: number }> =
    [];
  const payables: Array<{
    id: string;
    staffId: string;
    roleType: StaffRole;
    month: string;
    status: string;
    grossAmount: number;
    operatingRatePercent: number;
    taxRatePercent: number;
    operatingDeductionAmount: number;
    taxDeductionAmount: number;
    netAmount: number;
    createdAt: Date;
  }> = [];

  const mockPrisma = {
    staffInfo: {
      findMany: jest.fn(async () =>
        staffRows
          .filter((row) => row.status === StaffStatus.active)
          .map((row) => ({ id: row.id, roles: row.roles })),
      ),
    },
    roleFixedSalaryDefault: {
      findMany: jest.fn(async () => [...salaryDefaults]),
    },
    roleFixedSalaryOperatingRateDefault: {
      findMany: jest.fn(async () => [...operatingDefaults]),
    },
    staffFixedSalaryOverride: {
      findMany: jest.fn(async () => [...salaryOverrides]),
    },
    staffFixedSalaryOperatingRateOverride: {
      findMany: jest.fn(async () => [...operatingOverrides]),
    },
    staffTaxDeductionOverride: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: { staffId: string; roleType: StaffRole };
        }) =>
          taxOverrides.find(
            (row) =>
              row.staffId === where.staffId && row.roleType === where.roleType,
          ) ?? null,
      ),
    },
    roleTaxDeductionRate: {
      findFirst: jest.fn(
        async ({ where }: { where: { roleType: StaffRole } }) =>
          roleTaxDefaults.find((row) => row.roleType === where.roleType) ??
          null,
      ),
    },
    staffFixedSalaryPayable: {
      createMany: jest.fn(
        async ({
          data,
          skipDuplicates,
        }: {
          data: Array<{
            staffId: string;
            roleType: StaffRole;
            month: string;
            grossAmount: number;
            operatingRatePercent: number;
            taxRatePercent: number;
            operatingDeductionAmount: number;
            taxDeductionAmount: number;
            netAmount: number;
            status: string;
          }>;
          skipDuplicates?: boolean;
        }) => {
          let count = 0;
          for (const item of data) {
            const exists = payables.some(
              (row) =>
                row.staffId === item.staffId &&
                row.roleType === item.roleType &&
                row.month === item.month,
            );
            if (exists) {
              if (!skipDuplicates) {
                throw new Error('unique violation');
              }
              continue;
            }
            payables.push({
              id: `payable-${payables.length + 1}`,
              createdAt: new Date('2026-09-28T00:00:00.000Z'),
              ...item,
            });
            count += 1;
          }
          return { count };
        },
      ),
      count: jest.fn(async ({ where }: { where: { month: string } }) =>
        payables.filter((row) => row.month === where.month).length,
      ),
      findMany: jest.fn(async ({ where }: { where: { month: string } }) =>
        payables
          .filter((row) => row.month === where.month)
          .map((row) => {
            const staff = staffRows.find((item) => item.id === row.staffId);
            return {
              ...row,
              staff: {
                id: row.staffId,
                user: staff?.user ?? {
                  first_name: row.staffId,
                  last_name: '',
                },
              },
            };
          }),
      ),
    },
  };

  const service = new FixedSalaryCloseService(mockPrisma as never);

  beforeEach(() => {
    staffRows.length = 0;
    salaryDefaults.length = 0;
    operatingDefaults.length = 0;
    salaryOverrides.length = 0;
    operatingOverrides.length = 0;
    taxOverrides.length = 0;
    roleTaxDefaults.length = 0;
    payables.length = 0;
    jest.clearAllMocks();
  });

  it('creates one pending payable per active staff role with amount > 0', async () => {
    staffRows.push({
      id: 'staff-a',
      status: StaffStatus.active,
      roles: [StaffRole.assistant],
      user: { first_name: 'An', last_name: 'Nguyen' },
    });
    salaryDefaults.push({ roleType: StaffRole.assistant, amount: 1_000_000 });
    operatingDefaults.push({ roleType: StaffRole.assistant, ratePercent: 10 });
    roleTaxDefaults.push({ roleType: StaffRole.assistant, ratePercent: 10 });

    const result = await service.closeMonth('2026-09');
    expect(result.createdCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      staffId: 'staff-a',
      roleType: StaffRole.assistant,
      month: '2026-09',
      status: 'pending',
      grossAmount: 1_000_000,
      operatingRatePercent: 10,
      taxRatePercent: 10,
      operatingDeductionAmount: 100_000,
      taxDeductionAmount: 90_000,
      netAmount: 810_000,
    });
  });

  it('skips unconfigured amounts, zero amounts, and inactive staff', async () => {
    staffRows.push(
      {
        id: 'inactive',
        status: StaffStatus.inactive,
        roles: [StaffRole.assistant],
        user: { first_name: 'Off', last_name: 'Staff' },
      },
      {
        id: 'zero',
        status: StaffStatus.active,
        roles: [StaffRole.assistant],
        user: { first_name: 'Zero', last_name: 'Staff' },
      },
      {
        id: 'unconfigured',
        status: StaffStatus.active,
        roles: [StaffRole.communication],
        user: { first_name: 'None', last_name: 'Staff' },
      },
    );
    salaryDefaults.push({ roleType: StaffRole.assistant, amount: 0 });
    salaryOverrides.push({
      staffId: 'zero',
      roleType: StaffRole.assistant,
      amount: 0,
    });

    const result = await service.closeMonth('2026-09');
    expect(result.createdCount).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('creates independent payables for each role on the same staff', async () => {
    staffRows.push({
      id: 'dual',
      status: StaffStatus.active,
      roles: [StaffRole.communication, StaffRole.assistant],
      user: { first_name: 'Dual', last_name: 'Role' },
    });
    salaryDefaults.push(
      { roleType: StaffRole.communication, amount: 2_000_000 },
      { roleType: StaffRole.assistant, amount: 500_000 },
    );
    operatingDefaults.push(
      { roleType: StaffRole.communication, ratePercent: 10 },
      { roleType: StaffRole.assistant, ratePercent: 0 },
    );
    roleTaxDefaults.push(
      { roleType: StaffRole.communication, ratePercent: 10 },
      { roleType: StaffRole.assistant, ratePercent: 5 },
    );

    const result = await service.closeMonth('2026-09');
    expect(result.createdCount).toBe(2);
    expect(result.items.map((item) => item.roleType).sort()).toEqual([
      StaffRole.assistant,
      StaffRole.communication,
    ]);
    expect(
      result.items.find((item) => item.roleType === StaffRole.communication)
        ?.grossAmount,
    ).toBe(2_000_000);
    expect(
      result.items.find((item) => item.roleType === StaffRole.assistant)
        ?.grossAmount,
    ).toBe(500_000);
  });

  it('does not create a fixed-salary payable for teacher even when leftover config exists', async () => {
    staffRows.push({
      id: 'tutor',
      status: StaffStatus.active,
      roles: [StaffRole.teacher, StaffRole.assistant],
      user: { first_name: 'Tutor', last_name: 'Plus' },
    });
    salaryDefaults.push(
      { roleType: StaffRole.teacher, amount: 8_000_000 },
      { roleType: StaffRole.assistant, amount: 500_000 },
    );
    operatingDefaults.push(
      { roleType: StaffRole.teacher, ratePercent: 10 },
      { roleType: StaffRole.assistant, ratePercent: 0 },
    );
    roleTaxDefaults.push(
      { roleType: StaffRole.teacher, ratePercent: 10 },
      { roleType: StaffRole.assistant, ratePercent: 5 },
    );

    const result = await service.closeMonth('2026-09');
    expect(result.createdCount).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].roleType).toBe(StaffRole.assistant);
    expect(result.items[0].grossAmount).toBe(500_000);
    expect(
      result.items.find((item) => item.roleType === StaffRole.teacher),
    ).toBeUndefined();
  });

  it('does not create or mutate existing rows on a second close of the same month', async () => {
    staffRows.push({
      id: 'staff-a',
      status: StaffStatus.active,
      roles: [StaffRole.assistant],
      user: { first_name: 'An', last_name: 'Nguyen' },
    });
    salaryDefaults.push({ roleType: StaffRole.assistant, amount: 1_000_000 });
    operatingDefaults.push({ roleType: StaffRole.assistant, ratePercent: 10 });
    roleTaxDefaults.push({ roleType: StaffRole.assistant, ratePercent: 10 });

    await service.closeMonth('2026-09');
    salaryDefaults[0].amount = 9_000_000;
    const second = await service.closeMonth('2026-09');

    expect(second.createdCount).toBe(0);
    expect(second.skippedCount).toBe(1);
    expect(second.items).toHaveLength(1);
    expect(second.items[0].grossAmount).toBe(1_000_000);
    expect(mockPrisma.staffFixedSalaryPayable.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('automatic close skips the whole month when any payable already exists', async () => {
    staffRows.push(
      {
        id: 'staff-a',
        status: StaffStatus.active,
        roles: [StaffRole.assistant],
        user: { first_name: 'An', last_name: 'Nguyen' },
      },
      {
        id: 'staff-b',
        status: StaffStatus.active,
        roles: [StaffRole.communication],
        user: { first_name: 'Binh', last_name: 'Tran' },
      },
    );
    salaryDefaults.push(
      { roleType: StaffRole.assistant, amount: 1_000_000 },
      { roleType: StaffRole.communication, amount: 2_000_000 },
    );
    payables.push({
      id: 'existing',
      staffId: 'staff-a',
      roleType: StaffRole.assistant,
      month: '2026-09',
      status: 'pending',
      grossAmount: 1_000_000,
      operatingRatePercent: 0,
      taxRatePercent: 0,
      operatingDeductionAmount: 0,
      taxDeductionAmount: 0,
      netAmount: 1_000_000,
      createdAt: new Date('2026-09-10T00:00:00.000Z'),
    });

    const result = await service.closeMonthIfUnclosed('2026-09');

    expect(result.skippedBecauseAlreadyClosed).toBe(true);
    expect(result.createdCount).toBe(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].staffId).toBe('staff-a');
    expect(mockPrisma.staffFixedSalaryPayable.createMany).not.toHaveBeenCalled();
  });

  it('manual close still creates payables for newly eligible staff after an early close', async () => {
    staffRows.push(
      {
        id: 'staff-a',
        status: StaffStatus.active,
        roles: [StaffRole.assistant],
        user: { first_name: 'An', last_name: 'Nguyen' },
      },
      {
        id: 'staff-b',
        status: StaffStatus.active,
        roles: [StaffRole.communication],
        user: { first_name: 'Binh', last_name: 'Tran' },
      },
    );
    salaryDefaults.push(
      { roleType: StaffRole.assistant, amount: 1_000_000 },
      { roleType: StaffRole.communication, amount: 2_000_000 },
    );
    payables.push({
      id: 'existing',
      staffId: 'staff-a',
      roleType: StaffRole.assistant,
      month: '2026-09',
      status: 'pending',
      grossAmount: 1_000_000,
      operatingRatePercent: 0,
      taxRatePercent: 0,
      operatingDeductionAmount: 0,
      taxDeductionAmount: 0,
      netAmount: 1_000_000,
      createdAt: new Date('2026-09-10T00:00:00.000Z'),
    });

    const result = await service.closeMonth('2026-09');

    expect(result.skippedBecauseAlreadyClosed).toBeUndefined();
    expect(result.createdCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.items).toHaveLength(2);
    expect(
      result.items.map((item) => item.staffId).sort(),
    ).toEqual(['staff-a', 'staff-b']);
    expect(mockPrisma.staffFixedSalaryPayable.createMany).toHaveBeenCalled();
  });

  it('snapshots operating then tax using the shared deduction helper', () => {
    const deducted = calculateDeductionAmounts({
      grossAmount: 1_000_000,
      operatingRatePercent: 20,
      taxRatePercent: 10,
    });
    expect(deducted.operatingDeductionAmount).toBe(200_000);
    expect(deducted.taxDeductionAmount).toBe(80_000);
    expect(deducted.taxDeductionAmount).not.toBe(100_000);
    expect(deducted.netAmount).toBe(720_000);
  });
});

import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/client';
import { PaymentStatus, StaffRole, StaffStatus } from 'generated/enums';
import { getPreferredUserFullName } from '../common/user-name.util';
import {
  calculateDeductionAmounts,
  createMemoizedTaxDeductionResolver,
  parseMonthKeyToEffectiveDate,
} from '../payroll/deduction-rates';
import { PrismaService } from '../prisma/prisma.service';
import { getCurrentVietnamMonthKey } from './current-month.util';
import { resolveFixedSalaryAxis } from './fixed-salary-resolution.util';
import { isFixedSalaryStaffRole } from './fixed-salary-staff-roles';

export type StaffFixedSalaryPayableView = {
  id: string;
  staffId: string;
  staffFullName: string;
  roleType: StaffRole;
  month: string;
  status: PaymentStatus;
  grossAmount: number;
  operatingRatePercent: number;
  taxRatePercent: number;
  operatingDeductionAmount: number;
  taxDeductionAmount: number;
  netAmount: number;
  createdAt: string;
};

export type CloseFixedSalaryMonthResult = {
  month: string;
  createdCount: number;
  skippedCount: number;
  items: StaffFixedSalaryPayableView[];
};

export type FixedSalaryCloseCandidateRole = {
  roleType: StaffRole;
  /** `closed`: đã có khoản tháng này (số đóng băng); `unclosed`: số dự kiến theo mức hiện hành. */
  status: 'closed' | 'unclosed';
  grossAmount: number;
  netAmount: number;
};

export type FixedSalaryCloseCandidate = {
  staffId: string;
  staffFullName: string;
  totalGrossAmount: number;
  closedRoleCount: number;
  roles: FixedSalaryCloseCandidateRole[];
};

export type FixedSalaryCloseCandidatesResult = {
  month: string;
  items: FixedSalaryCloseCandidate[];
};

type PayableCreateRow = {
  staffId: string;
  roleType: StaffRole;
  month: string;
  status: PaymentStatus;
  grossAmount: number;
  operatingRatePercent: number;
  taxRatePercent: number;
  operatingDeductionAmount: number;
  taxDeductionAmount: number;
  netAmount: number;
};

@Injectable()
export class FixedSalaryCloseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Chốt tháng hiện tại. `staffIds` có thì chỉ chốt những nhân sự đó (role còn
   * thiếu); không có thì chốt mọi nhân sự đủ điều kiện. Cron ngày 28 cũng gọi
   * nhánh không có `staffIds` để chốt nốt người chưa chốt / chốt dở.
   */
  async closeCurrentMonth(
    staffIds?: string[],
  ): Promise<CloseFixedSalaryMonthResult> {
    return this.closeMonth(getCurrentVietnamMonthKey(), staffIds);
  }

  async listCloseCandidates(): Promise<FixedSalaryCloseCandidatesResult> {
    const month = getCurrentVietnamMonthKey();
    const [candidateRows, payableViews] = await Promise.all([
      this.buildPayableCandidates(month, new Date()),
      this.loadPayableViews(month),
    ]);

    const byStaff = new Map<string, FixedSalaryCloseCandidate>();
    const ensure = (staffId: string, staffFullName: string) => {
      let entry = byStaff.get(staffId);
      if (!entry) {
        entry = {
          staffId,
          staffFullName,
          totalGrossAmount: 0,
          closedRoleCount: 0,
          roles: [],
        };
        byStaff.set(staffId, entry);
      }
      return entry;
    };

    for (const payable of payableViews) {
      const entry = ensure(payable.staffId, payable.staffFullName);
      entry.roles.push({
        roleType: payable.roleType,
        status: 'closed',
        grossAmount: payable.grossAmount,
        netAmount: payable.netAmount,
      });
      entry.closedRoleCount += 1;
      entry.totalGrossAmount += payable.grossAmount;
    }

    const closedKeys = new Set(
      payableViews.map((row) => `${row.staffId}:${row.roleType}`),
    );
    const unclosedRows = candidateRows.filter(
      (row) => !closedKeys.has(`${row.staffId}:${row.roleType}`),
    );
    const names = await this.loadStaffNames(
      unclosedRows
        .map((row) => row.staffId)
        .filter((staffId) => !byStaff.has(staffId)),
    );
    for (const row of unclosedRows) {
      const entry = ensure(row.staffId, names.get(row.staffId) ?? row.staffId);
      entry.roles.push({
        roleType: row.roleType,
        status: 'unclosed',
        grossAmount: row.grossAmount,
        netAmount: row.netAmount,
      });
      entry.totalGrossAmount += row.grossAmount;
    }

    const items = Array.from(byStaff.values()).sort((a, b) =>
      a.staffFullName.localeCompare(b.staffFullName, 'vi'),
    );
    for (const item of items) {
      item.roles.sort((a, b) => a.roleType.localeCompare(b.roleType));
    }

    return { month, items };
  }

  async listPayables(monthKey?: string): Promise<{
    month: string;
    items: StaffFixedSalaryPayableView[];
  }> {
    const month = this.normalizeMonthKey(
      monthKey ?? getCurrentVietnamMonthKey(),
    );
    return {
      month,
      items: await this.loadPayableViews(month),
    };
  }

  async closeMonth(
    monthKey: string,
    staffIds?: string[],
  ): Promise<CloseFixedSalaryMonthResult> {
    const month = this.normalizeMonthKey(monthKey);
    const asOf = new Date();
    const candidates = await this.buildPayableCandidates(month, asOf, staffIds);

    const created = candidates.length
      ? await this.prisma.staffFixedSalaryPayable.createMany({
          data: candidates,
          skipDuplicates: true,
        })
      : { count: 0 };

    const createdCount = created.count;
    const skippedCount = candidates.length - createdCount;

    return {
      month,
      createdCount,
      skippedCount,
      items: await this.loadPayableViews(month),
    };
  }

  private normalizeMonthKey(monthKey: string): string {
    const trimmed = monthKey.trim();
    try {
      parseMonthKeyToEffectiveDate(trimmed);
    } catch {
      throw new BadRequestException('month must be in YYYY-MM format');
    }
    return trimmed;
  }

  private async buildPayableCandidates(
    month: string,
    asOf: Date,
    staffIds?: string[],
  ): Promise<PayableCreateRow[]> {
    const staffRows = await this.prisma.staffInfo.findMany({
      where: {
        status: StaffStatus.active,
        ...(staffIds ? { id: { in: staffIds } } : {}),
      },
      select: {
        id: true,
        roles: true,
      },
    });
    const activeStaff = staffRows.filter((row) => row.roles.length > 0);
    const activeStaffIds = activeStaff.map((row) => row.id);

    const [
      salaryDefaults,
      operatingDefaults,
      salaryOverrides,
      operatingOverrides,
    ] = await Promise.all([
      this.prisma.roleFixedSalaryDefault.findMany(),
      this.prisma.roleFixedSalaryOperatingRateDefault.findMany(),
      this.prisma.staffFixedSalaryOverride.findMany({
        where: { staffId: { in: activeStaffIds } },
      }),
      this.prisma.staffFixedSalaryOperatingRateOverride.findMany({
        where: { staffId: { in: activeStaffIds } },
      }),
    ]);

    const salaryDefaultByRole = new Map(
      salaryDefaults.map((row) => [row.roleType, row.amount]),
    );
    const operatingDefaultByRole = new Map(
      operatingDefaults.map((row) => [
        row.roleType,
        this.mapPercent(row.ratePercent),
      ]),
    );
    const resolveTax = createMemoizedTaxDeductionResolver(this.prisma, asOf);
    const candidates: PayableCreateRow[] = [];

    for (const staff of activeStaff) {
      for (const roleType of staff.roles) {
        if (!isFixedSalaryStaffRole(roleType)) {
          continue;
        }
        const salaryOverride = salaryOverrides.find(
          (row) => row.staffId === staff.id && row.roleType === roleType,
        );
        const operatingOverride = operatingOverrides.find(
          (row) => row.staffId === staff.id && row.roleType === roleType,
        );
        const amount = resolveFixedSalaryAxis({
          hasOverride: Boolean(salaryOverride),
          overrideValue: salaryOverride?.amount ?? null,
          roleDefaultValue: salaryDefaultByRole.get(roleType) ?? null,
        }).applied;

        if (amount == null || amount <= 0) {
          continue;
        }

        const operatingRatePercent =
          resolveFixedSalaryAxis({
            hasOverride: Boolean(operatingOverride),
            overrideValue: this.mapPercent(
              operatingOverride?.ratePercent ?? null,
            ),
            roleDefaultValue: operatingDefaultByRole.get(roleType) ?? null,
          }).applied ?? 0;
        const taxRatePercent = await resolveTax(staff.id, roleType);
        const deductions = calculateDeductionAmounts({
          grossAmount: amount,
          operatingRatePercent,
          taxRatePercent,
        });

        candidates.push({
          staffId: staff.id,
          roleType,
          month,
          status: PaymentStatus.pending,
          grossAmount: deductions.grossAmount,
          operatingRatePercent: this.normalizeStoredPercent(operatingRatePercent),
          taxRatePercent: this.normalizeStoredPercent(taxRatePercent),
          operatingDeductionAmount: deductions.operatingDeductionAmount,
          taxDeductionAmount: deductions.taxDeductionAmount,
          netAmount: deductions.netAmount,
        });
      }
    }

    return candidates;
  }

  private async loadStaffNames(
    staffIds: string[],
  ): Promise<Map<string, string>> {
    if (staffIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.staffInfo.findMany({
      where: { id: { in: Array.from(new Set(staffIds)) } },
      select: {
        id: true,
        user: {
          select: {
            first_name: true,
            last_name: true,
            accountHandle: true,
            email: true,
          },
        },
      },
    });
    return new Map(
      rows.map((row) => [row.id, getPreferredUserFullName(row.user) ?? row.id]),
    );
  }

  private async loadPayableViews(
    month: string,
  ): Promise<StaffFixedSalaryPayableView[]> {
    const rows = await this.prisma.staffFixedSalaryPayable.findMany({
      where: { month },
      orderBy: [
        { staff: { user: { first_name: 'asc' } } },
        { staff: { user: { last_name: 'asc' } } },
        { roleType: 'asc' },
      ],
      include: {
        staff: {
          select: {
            id: true,
            user: {
              select: {
                first_name: true,
                last_name: true,
                accountHandle: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      staffId: row.staffId,
      staffFullName: getPreferredUserFullName(row.staff.user) ?? row.staffId,
      roleType: row.roleType,
      month: row.month,
      status: row.status,
      grossAmount: row.grossAmount,
      operatingRatePercent: this.mapPercent(row.operatingRatePercent) ?? 0,
      taxRatePercent: this.mapPercent(row.taxRatePercent) ?? 0,
      operatingDeductionAmount: row.operatingDeductionAmount,
      taxDeductionAmount: row.taxDeductionAmount,
      netAmount: row.netAmount,
      createdAt:
        typeof row.createdAt === 'string'
          ? row.createdAt
          : row.createdAt.toISOString(),
    }));
  }

  private mapPercent(
    value: Prisma.Decimal | number | string | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return Math.round(numericValue * 100) / 100;
  }

  private normalizeStoredPercent(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }

    return Math.min(100, Math.round(value * 100) / 100);
  }
}

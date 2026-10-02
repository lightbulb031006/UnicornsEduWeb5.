import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/client';
import { StaffRole, StaffStatus } from 'generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from '../action-history/action-history.service';
import { getPreferredUserFullName } from '../common/user-name.util';
import {
  StaffFixedSalaryOverridesQueryDto,
  StaffRoleFixedSalaryOverrideItemDto,
  UpsertRoleFixedSalaryDefaultsDto,
  UpsertRoleFixedSalaryOperatingRatesDto,
  UpsertStaffFixedSalaryAmountDto,
  UpsertStaffFixedSalaryOperatingRateDto,
} from '../dtos/fixed-salary-settings.dto';
import { PrismaService } from '../prisma/prisma.service';
import { resolveFixedSalaryAxis } from './fixed-salary-resolution.util';
import {
  FIXED_SALARY_STAFF_ROLES,
  isFixedSalaryStaffRole,
} from './fixed-salary-staff-roles';

const TEACHER_FIXED_SALARY_MESSAGE =
  'Vai trò giáo viên không nhận lương cứng.';

export type RoleFixedSalaryDefaultView = {
  roleType: StaffRole;
  id: string | null;
  amount: number | null;
  updatedAt: string | null;
};

export type RoleFixedSalaryOperatingRateDefaultView = {
  roleType: StaffRole;
  id: string | null;
  operatingRatePercent: number | null;
  updatedAt: string | null;
};

type RoleFixedSalaryRow = {
  id: string;
  roleType: StaffRole;
  amount: number | null;
  updatedAt: Date | string;
};

type RoleOperatingRateRow = {
  id: string;
  roleType: StaffRole;
  ratePercent: Prisma.Decimal | number | string | null;
  updatedAt: Date | string;
};

type StaffOverrideAuditStaff = {
  user?: Parameters<typeof getPreferredUserFullName>[0];
};

type StaffOverrideWriteClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class FixedSalarySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

  async getRoleDefaults(): Promise<{ roles: RoleFixedSalaryDefaultView[] }> {
    const rows = await this.prisma.roleFixedSalaryDefault.findMany();
    const byRole = new Map(rows.map((row) => [row.roleType, row]));

    return {
      roles: FIXED_SALARY_STAFF_ROLES.map((roleType) =>
        this.mapSalaryView(roleType, byRole.get(roleType) ?? null),
      ),
    };
  }

  async getRoleOperatingRates(): Promise<{
    roles: RoleFixedSalaryOperatingRateDefaultView[];
  }> {
    const rows =
      await this.prisma.roleFixedSalaryOperatingRateDefault.findMany();
    const byRole = new Map(rows.map((row) => [row.roleType, row]));

    return {
      roles: FIXED_SALARY_STAFF_ROLES.map((roleType) =>
        this.mapOperatingRateView(roleType, byRole.get(roleType) ?? null),
      ),
    };
  }

  async upsertRoleDefaults(
    dto: UpsertRoleFixedSalaryDefaultsDto,
    actor?: ActionHistoryActor,
  ) {
    const seen = new Set<StaffRole>();
    const normalizedItems = dto.items.map((item) => {
      this.assertFixedSalaryStaffRole(item.roleType);
      if (seen.has(item.roleType)) {
        throw new BadRequestException(
          'Each roleType may appear only once in the payload.',
        );
      }
      seen.add(item.roleType);

      return {
        roleType: item.roleType,
        amount: this.normalizeAmount(item.amount),
      };
    });

    await this.prisma.$transaction(async (tx) => {
      for (const item of normalizedItems) {
        const existing = await tx.roleFixedSalaryDefault.findUnique({
          where: { roleType: item.roleType },
        });
        const beforeView = existing
          ? this.mapSalaryView(existing.roleType, existing)
          : null;

        if ((existing?.amount ?? null) === item.amount) {
          continue;
        }

        if (item.amount === null) {
          if (!existing) {
            continue;
          }

          await tx.roleFixedSalaryDefault.delete({
            where: { id: existing.id },
          });

          if (actor && beforeView) {
            await this.actionHistoryService.recordDelete(tx, {
              actor,
              entityType: 'role_fixed_salary_default',
              entityId: existing.id,
              description: 'Clear role default fixed salary',
              beforeValue: beforeView,
            });
          }

          continue;
        }

        const row = existing
          ? await tx.roleFixedSalaryDefault.update({
              where: { id: existing.id },
              data: { amount: item.amount },
            })
          : await tx.roleFixedSalaryDefault.create({
              data: {
                roleType: item.roleType,
                amount: item.amount,
              },
            });

        if (actor) {
          const mappedAfter = this.mapSalaryView(row.roleType, row);
          if (existing && beforeView) {
            await this.actionHistoryService.recordUpdate(tx, {
              actor,
              entityType: 'role_fixed_salary_default',
              entityId: row.id,
              description: 'Update role default fixed salary',
              beforeValue: beforeView,
              afterValue: mappedAfter,
            });
          } else {
            await this.actionHistoryService.recordCreate(tx, {
              actor,
              entityType: 'role_fixed_salary_default',
              entityId: row.id,
              description: 'Create role default fixed salary',
              afterValue: mappedAfter,
            });
          }
        }
      }
    });

    return this.getRoleDefaults();
  }

  async upsertRoleOperatingRates(
    dto: UpsertRoleFixedSalaryOperatingRatesDto,
    actor?: ActionHistoryActor,
  ) {
    const seen = new Set<StaffRole>();
    const normalizedItems = dto.items.map((item) => {
      this.assertFixedSalaryStaffRole(item.roleType);
      if (seen.has(item.roleType)) {
        throw new BadRequestException(
          'Each roleType may appear only once in the payload.',
        );
      }
      seen.add(item.roleType);

      return {
        roleType: item.roleType,
        operatingRatePercent: this.normalizeOperatingRatePercent(
          item.operatingRatePercent,
        ),
      };
    });

    await this.prisma.$transaction(async (tx) => {
      for (const item of normalizedItems) {
        const existing =
          await tx.roleFixedSalaryOperatingRateDefault.findUnique({
            where: { roleType: item.roleType },
          });
        const beforeView = existing
          ? this.mapOperatingRateView(existing.roleType, existing)
          : null;
        const beforePercent = this.mapPercent(existing?.ratePercent ?? null);

        if (beforePercent === item.operatingRatePercent) {
          continue;
        }

        if (item.operatingRatePercent === null) {
          if (!existing) {
            continue;
          }

          await tx.roleFixedSalaryOperatingRateDefault.delete({
            where: { id: existing.id },
          });

          if (actor && beforeView) {
            await this.actionHistoryService.recordDelete(tx, {
              actor,
              entityType: 'role_fixed_salary_operating_rate_default',
              entityId: existing.id,
              description: 'Clear role default fixed-salary operating rate',
              beforeValue: beforeView,
            });
          }

          continue;
        }

        const row = existing
          ? await tx.roleFixedSalaryOperatingRateDefault.update({
              where: { id: existing.id },
              data: { ratePercent: item.operatingRatePercent },
            })
          : await tx.roleFixedSalaryOperatingRateDefault.create({
              data: {
                roleType: item.roleType,
                ratePercent: item.operatingRatePercent,
              },
            });

        if (actor) {
          const mappedAfter = this.mapOperatingRateView(row.roleType, row);
          if (existing && beforeView) {
            await this.actionHistoryService.recordUpdate(tx, {
              actor,
              entityType: 'role_fixed_salary_operating_rate_default',
              entityId: row.id,
              description: 'Update role default fixed-salary operating rate',
              beforeValue: beforeView,
              afterValue: mappedAfter,
            });
          } else {
            await this.actionHistoryService.recordCreate(tx, {
              actor,
              entityType: 'role_fixed_salary_operating_rate_default',
              entityId: row.id,
              description: 'Create role default fixed-salary operating rate',
              afterValue: mappedAfter,
            });
          }
        }
      }
    });

    return this.getRoleOperatingRates();
  }

  async getStaffOverrides(query: StaffFixedSalaryOverridesQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 40, 1), 100);
    const staffRows = await this.prisma.staffInfo.findMany({
      where: query.staffId
        ? { id: query.staffId }
        : {
            status: StaffStatus.active,
            ...this.buildStaffSearchWhere(query.search),
          },
      take: limit,
      orderBy: [
        { user: { first_name: 'asc' } },
        { user: { last_name: 'asc' } },
      ],
      select: {
        id: true,
        roles: true,
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

    const staffWithRoles = staffRows.filter((row) => row.roles.length > 0);
    const staffIds = staffWithRoles.map((row) => row.id);

    const [salaryDefaults, operatingDefaults, salaryOverrides, operatingOverrides] =
      await Promise.all([
        this.prisma.roleFixedSalaryDefault.findMany(),
        this.prisma.roleFixedSalaryOperatingRateDefault.findMany(),
        this.prisma.staffFixedSalaryOverride.findMany({
          where: { staffId: { in: staffIds } },
        }),
        this.prisma.staffFixedSalaryOperatingRateOverride.findMany({
          where: { staffId: { in: staffIds } },
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

    return {
      staff: staffWithRoles.map((staff) => ({
        staffId: staff.id,
        fullName: getPreferredUserFullName(staff.user) ?? staff.id,
        roles: staff.roles.filter(isFixedSalaryStaffRole).map((roleType) => {
          const salaryOverride = salaryOverrides.find(
            (row) => row.staffId === staff.id && row.roleType === roleType,
          );
          const operatingOverride = operatingOverrides.find(
            (row) => row.staffId === staff.id && row.roleType === roleType,
          );

          return {
            roleType,
            amount: resolveFixedSalaryAxis({
              hasOverride: Boolean(salaryOverride),
              overrideValue: salaryOverride?.amount ?? null,
              roleDefaultValue: salaryDefaultByRole.get(roleType) ?? null,
            }),
            operatingRate: resolveFixedSalaryAxis({
              hasOverride: Boolean(operatingOverride),
              overrideValue: this.mapPercent(
                operatingOverride?.ratePercent ?? null,
              ),
              roleDefaultValue: operatingDefaultByRole.get(roleType) ?? null,
            }),
          };
        }),
      })),
    };
  }

  async upsertStaffAmountOverride(
    dto: UpsertStaffFixedSalaryAmountDto,
    actor?: ActionHistoryActor,
  ) {
    const staff = await this.requireStaffRole(dto.staffId, dto.roleType);
    const amount = this.normalizeAmount(dto.amount);

    await this.prisma.$transaction(async (tx) => {
      await this.writeStaffAmountOverrideInTx(tx, {
        staffId: dto.staffId,
        roleType: dto.roleType,
        amount,
        staff,
        actor,
      });
    });

    return this.getStaffOverrides({ staffId: dto.staffId, limit: 1 });
  }

  async upsertStaffOperatingRateOverride(
    dto: UpsertStaffFixedSalaryOperatingRateDto,
    actor?: ActionHistoryActor,
  ) {
    const staff = await this.requireStaffRole(dto.staffId, dto.roleType);
    const operatingRatePercent = this.normalizeOperatingRatePercent(
      dto.operatingRatePercent,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.writeStaffOperatingRateOverrideInTx(tx, {
        staffId: dto.staffId,
        roleType: dto.roleType,
        operatingRatePercent,
        staff,
        actor,
      });
    });

    return this.getStaffOverrides({ staffId: dto.staffId, limit: 1 });
  }

  assertStaffOverrideItems(
    nextRoles: StaffRole[],
    items: StaffRoleFixedSalaryOverrideItemDto[],
  ) {
    const seen = new Set<StaffRole>();

    for (const item of items) {
      if (seen.has(item.roleType)) {
        throw new BadRequestException(
          'Danh sách mức đè lương cứng không được trùng vai trò.',
        );
      }
      seen.add(item.roleType);

      this.assertFixedSalaryStaffRole(item.roleType);

      if (!nextRoles.includes(item.roleType)) {
        throw new BadRequestException(
          'Fixed-salary override is only allowed for a role this staff currently holds.',
        );
      }
    }
  }

  async syncStaffRoleOverridesInTx(
    tx: Prisma.TransactionClient,
    params: {
      staffId: string;
      nextRoles: StaffRole[];
      items: StaffRoleFixedSalaryOverrideItemDto[];
      staff: StaffOverrideAuditStaff;
      actor?: ActionHistoryActor;
    },
  ) {
    this.assertStaffOverrideItems(params.nextRoles, params.items);

    const [salaryOverrides, operatingOverrides] = await Promise.all([
      tx.staffFixedSalaryOverride.findMany({
        where: { staffId: params.staffId },
      }),
      tx.staffFixedSalaryOperatingRateOverride.findMany({
        where: { staffId: params.staffId },
      }),
    ]);

    for (const row of salaryOverrides) {
      if (
        !params.nextRoles.includes(row.roleType) ||
        !isFixedSalaryStaffRole(row.roleType)
      ) {
        await this.writeStaffAmountOverrideInTx(tx, {
          staffId: params.staffId,
          roleType: row.roleType,
          amount: null,
          staff: params.staff,
          actor: params.actor,
          removedWithRole: !params.nextRoles.includes(row.roleType),
        });
      }
    }

    for (const row of operatingOverrides) {
      if (
        !params.nextRoles.includes(row.roleType) ||
        !isFixedSalaryStaffRole(row.roleType)
      ) {
        await this.writeStaffOperatingRateOverrideInTx(tx, {
          staffId: params.staffId,
          roleType: row.roleType,
          operatingRatePercent: null,
          staff: params.staff,
          actor: params.actor,
          removedWithRole: !params.nextRoles.includes(row.roleType),
        });
      }
    }

    for (const item of params.items) {
      if (item.amount !== undefined) {
        await this.writeStaffAmountOverrideInTx(tx, {
          staffId: params.staffId,
          roleType: item.roleType,
          amount: this.normalizeAmount(item.amount),
          staff: params.staff,
          actor: params.actor,
        });
      }

      if (item.operatingRatePercent !== undefined) {
        await this.writeStaffOperatingRateOverrideInTx(tx, {
          staffId: params.staffId,
          roleType: item.roleType,
          operatingRatePercent: this.normalizeOperatingRatePercent(
            item.operatingRatePercent,
          ),
          staff: params.staff,
          actor: params.actor,
        });
      }
    }
  }

  private async requireStaffRole(staffId: string, roleType: StaffRole) {
    this.assertFixedSalaryStaffRole(roleType);

    const staff = await this.prisma.staffInfo.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        roles: true,
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

    if (!staff) {
      throw new NotFoundException('Staff not found.');
    }

    if (!staff.roles.includes(roleType)) {
      throw new BadRequestException(
        'Fixed-salary override is only allowed for a role this staff currently holds.',
      );
    }

    return staff;
  }

  private assertFixedSalaryStaffRole(roleType: StaffRole) {
    if (!isFixedSalaryStaffRole(roleType)) {
      throw new BadRequestException(TEACHER_FIXED_SALARY_MESSAGE);
    }
  }

  private async writeStaffAmountOverrideInTx(
    tx: StaffOverrideWriteClient,
    params: {
      staffId: string;
      roleType: StaffRole;
      amount: number | null;
      staff: StaffOverrideAuditStaff;
      actor?: ActionHistoryActor;
      removedWithRole?: boolean;
    },
  ) {
    const existing = await tx.staffFixedSalaryOverride.findUnique({
      where: {
        staffId_roleType: {
          staffId: params.staffId,
          roleType: params.roleType,
        },
      },
    });
    const beforeView = existing
      ? this.mapStaffSalaryOverrideView(existing, params.staff)
      : null;

    if (params.amount === null) {
      if (!existing) {
        return;
      }

      await tx.staffFixedSalaryOverride.delete({
        where: { id: existing.id },
      });

      if (params.actor && beforeView) {
        await this.actionHistoryService.recordDelete(tx, {
          actor: params.actor,
          entityType: 'staff_fixed_salary_override',
          entityId: existing.id,
          description: params.removedWithRole
            ? `Xóa mức đè lương cứng vì tắt vai trò ${params.roleType}`
            : 'Clear staff fixed salary override',
          beforeValue: beforeView,
        });
      }

      return;
    }

    if (existing?.amount === params.amount) {
      return;
    }

    const row = existing
      ? await tx.staffFixedSalaryOverride.update({
          where: { id: existing.id },
          data: { amount: params.amount },
        })
      : await tx.staffFixedSalaryOverride.create({
          data: {
            staffId: params.staffId,
            roleType: params.roleType,
            amount: params.amount,
          },
        });

    if (params.actor) {
      const afterView = this.mapStaffSalaryOverrideView(row, params.staff);
      if (existing && beforeView) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: params.actor,
          entityType: 'staff_fixed_salary_override',
          entityId: row.id,
          description: 'Update staff fixed salary override',
          beforeValue: beforeView,
          afterValue: afterView,
        });
      } else {
        await this.actionHistoryService.recordCreate(tx, {
          actor: params.actor,
          entityType: 'staff_fixed_salary_override',
          entityId: row.id,
          description: 'Create staff fixed salary override',
          afterValue: afterView,
        });
      }
    }
  }

  private async writeStaffOperatingRateOverrideInTx(
    tx: StaffOverrideWriteClient,
    params: {
      staffId: string;
      roleType: StaffRole;
      operatingRatePercent: number | null;
      staff: StaffOverrideAuditStaff;
      actor?: ActionHistoryActor;
      removedWithRole?: boolean;
    },
  ) {
    const existing = await tx.staffFixedSalaryOperatingRateOverride.findUnique({
      where: {
        staffId_roleType: {
          staffId: params.staffId,
          roleType: params.roleType,
        },
      },
    });
    const beforeView = existing
      ? this.mapStaffOperatingOverrideView(existing, params.staff)
      : null;
    const beforePercent = this.mapPercent(existing?.ratePercent ?? null);

    if (params.operatingRatePercent === null) {
      if (!existing) {
        return;
      }

      await tx.staffFixedSalaryOperatingRateOverride.delete({
        where: { id: existing.id },
      });

      if (params.actor && beforeView) {
        await this.actionHistoryService.recordDelete(tx, {
          actor: params.actor,
          entityType: 'staff_fixed_salary_operating_rate_override',
          entityId: existing.id,
          description: params.removedWithRole
            ? `Xóa mức đè % vận hành lương cứng vì tắt vai trò ${params.roleType}`
            : 'Clear staff fixed-salary operating-rate override',
          beforeValue: beforeView,
        });
      }

      return;
    }

    if (beforePercent === params.operatingRatePercent) {
      return;
    }

    const row = existing
      ? await tx.staffFixedSalaryOperatingRateOverride.update({
          where: { id: existing.id },
          data: { ratePercent: params.operatingRatePercent },
        })
      : await tx.staffFixedSalaryOperatingRateOverride.create({
          data: {
            staffId: params.staffId,
            roleType: params.roleType,
            ratePercent: params.operatingRatePercent,
          },
        });

    if (params.actor) {
      const afterView = this.mapStaffOperatingOverrideView(row, params.staff);
      if (existing && beforeView) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: params.actor,
          entityType: 'staff_fixed_salary_operating_rate_override',
          entityId: row.id,
          description: 'Update staff fixed-salary operating-rate override',
          beforeValue: beforeView,
          afterValue: afterView,
        });
      } else {
        await this.actionHistoryService.recordCreate(tx, {
          actor: params.actor,
          entityType: 'staff_fixed_salary_operating_rate_override',
          entityId: row.id,
          description: 'Create staff fixed-salary operating-rate override',
          afterValue: afterView,
        });
      }
    }
  }

  private buildStaffSearchWhere(search?: string): Prisma.StaffInfoWhereInput {
    const tokens = (search ?? '')
      .trim()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (tokens.length === 0) {
      return {};
    }

    return {
      AND: tokens.map((token) => ({
        OR: [
          {
            id: {
              contains: token,
              mode: 'insensitive',
            },
          },
          {
            user: {
              first_name: {
                contains: token,
                mode: 'insensitive',
              },
            },
          },
          {
            user: {
              last_name: {
                contains: token,
                mode: 'insensitive',
              },
            },
          },
          {
            user: {
              accountHandle: {
                contains: token,
                mode: 'insensitive',
              },
            },
          },
        ],
      })),
    };
  }

  private mapStaffSalaryOverrideView(
    row: {
      id: string;
      staffId: string;
      roleType: StaffRole;
      amount: number;
    },
    staff: { user?: Parameters<typeof getPreferredUserFullName>[0] },
  ) {
    return {
      id: row.id,
      staffId: row.staffId,
      staffName: getPreferredUserFullName(staff.user) ?? row.staffId,
      roleType: row.roleType,
      amount: row.amount,
    };
  }

  private mapStaffOperatingOverrideView(
    row: {
      id: string;
      staffId: string;
      roleType: StaffRole;
      ratePercent: Prisma.Decimal | number | string | null;
    },
    staff: { user?: Parameters<typeof getPreferredUserFullName>[0] },
  ) {
    return {
      id: row.id,
      staffId: row.staffId,
      staffName: getPreferredUserFullName(staff.user) ?? row.staffId,
      roleType: row.roleType,
      operatingRatePercent: this.mapPercent(row.ratePercent),
    };
  }

  private normalizeAmount(value: number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(
        'Fixed salary amount must be a non-negative integer.',
      );
    }

    return value;
  }

  private normalizeOperatingRatePercent(
    value: number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new BadRequestException(
        'Fixed-salary operating rate percent must be between 0 and 100.',
      );
    }

    return Math.round(value * 100) / 100;
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

  private isoDate(value: Date | string): string {
    return typeof value === 'string' ? value : value.toISOString();
  }

  private mapSalaryView(
    roleType: StaffRole,
    row: RoleFixedSalaryRow | null | undefined,
  ): RoleFixedSalaryDefaultView {
    if (!row) {
      return {
        roleType,
        id: null,
        amount: null,
        updatedAt: null,
      };
    }

    return {
      roleType,
      id: row.id,
      amount: row.amount,
      updatedAt: this.isoDate(row.updatedAt),
    };
  }

  private mapOperatingRateView(
    roleType: StaffRole,
    row: RoleOperatingRateRow | null | undefined,
  ): RoleFixedSalaryOperatingRateDefaultView {
    if (!row) {
      return {
        roleType,
        id: null,
        operatingRatePercent: null,
        updatedAt: null,
      };
    }

    return {
      roleType,
      id: row.id,
      operatingRatePercent: this.mapPercent(row.ratePercent),
      updatedAt: this.isoDate(row.updatedAt),
    };
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../../generated/client';
import { StaffRole } from 'generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from '../action-history/action-history.service';
import {
  BulkUpsertStaffTaxDeductionOverridesDto,
  CreateRoleTaxDeductionRateDto,
  CreateStaffTaxDeductionOverrideDto,
  TaxDeductionSettingsQueryDto,
  UpdateRoleTaxDeductionRateDto,
  UpdateStaffTaxDeductionOverrideDto,
} from '../dtos/deduction-settings.dto';
import { PrismaService } from '../prisma/prisma.service';
import { getUserFullNameFromParts } from '../common/user-name.util';

type RoleTaxRateRow = {
  id: string;
  roleType: StaffRole;
  ratePercent: Prisma.Decimal | number | string;
  effectiveFrom: Date | string;
  createdAt: Date | string;
};

type StaffTaxOverrideRow = {
  id: string;
  staffId: string;
  staffName: string | null;
  roleType: StaffRole;
  ratePercent: Prisma.Decimal | number | string;
  effectiveFrom: Date | string;
  createdAt: Date | string;
};

function normalizeRatePercent(value: Prisma.Decimal | number | string) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  const roundedValue = Math.round(numericValue * 100) / 100;
  if (roundedValue < 0) {
    return 0;
  }
  if (roundedValue > 100) {
    return 100;
  }
  return roundedValue;
}

function parseAsOfDateOrThrow(value?: string) {
  if (!value) {
    return new Date();
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new BadRequestException('asOfDate must be a valid date.');
  }

  return parsedDate;
}

function normalizePostgresError(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  ) {
    throw new BadRequestException(
      'A rate already exists for this effective date.',
    );
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2010'
  ) {
    const message = String((error as { message?: string }).message ?? '');
    if (message.includes('23505')) {
      throw new BadRequestException(
        'A rate already exists for this effective date.',
      );
    }
  }
}

@Injectable()
export class DeductionSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

  private buildStaffDisplayName(
    staff: {
      user?: { first_name: string | null; last_name: string | null } | null;
    } | null,
  ) {
    return getUserFullNameFromParts(staff?.user);
  }

  async getTaxDeductionSettings(query: TaxDeductionSettingsQueryDto) {
    const asOfDate = parseAsOfDateOrThrow(query.asOfDate);
    const normalizedRoleType = query.roleType ?? null;
    const normalizedStaffId = query.staffId?.trim() || null;

    const roleTypeFilterSql = normalizedRoleType
      ? Prisma.sql`AND role_type = ${normalizedRoleType}::"StaffRole"`
      : Prisma.empty;
    const staffIdFilterSql = normalizedStaffId
      ? Prisma.sql`AND staff_id = ${normalizedStaffId}`
      : Prisma.empty;

    const [roleDefaultHistoryRows, roleDefaultCurrentRows] = await Promise.all([
      this.prisma.$queryRaw<RoleTaxRateRow[]>(Prisma.sql`
          SELECT
            id,
            role_type AS "roleType",
            rate_percent AS "ratePercent",
            effective_from AS "effectiveFrom",
            created_at AS "createdAt"
          FROM role_tax_deduction_rates
          WHERE 1 = 1
            ${roleTypeFilterSql}
          ORDER BY role_type ASC, effective_from DESC, created_at DESC
        `),
      this.prisma.$queryRaw<RoleTaxRateRow[]>(Prisma.sql`
          SELECT DISTINCT ON (role_type)
            id,
            role_type AS "roleType",
            rate_percent AS "ratePercent",
            effective_from AS "effectiveFrom",
            created_at AS "createdAt"
          FROM role_tax_deduction_rates
          WHERE effective_from <= ${asOfDate}
            ${roleTypeFilterSql}
          ORDER BY role_type ASC, effective_from DESC, created_at DESC
        `),
    ]);

    const [staffOverrideHistoryRows, staffOverrideCurrentRows] =
      await Promise.all([
        this.prisma.$queryRaw<StaffTaxOverrideRow[]>(Prisma.sql`
          SELECT
            overrides.id,
            overrides.staff_id AS "staffId",
            NULLIF(
              TRIM(
                CONCAT(
                  COALESCE(staff_user.first_name, ''),
                  ' ',
                  COALESCE(staff_user.last_name, '')
                )
              ),
              ''
            ) AS "staffName",
            overrides.role_type AS "roleType",
            overrides.rate_percent AS "ratePercent",
            overrides.effective_from AS "effectiveFrom",
            overrides.created_at AS "createdAt"
          FROM staff_tax_deduction_overrides overrides
          INNER JOIN staff_info ON staff_info.id = overrides.staff_id
          INNER JOIN users staff_user ON staff_user.id = staff_info.user_id
          WHERE 1 = 1
            ${roleTypeFilterSql}
            ${staffIdFilterSql}
          ORDER BY
            overrides.staff_id ASC,
            overrides.role_type ASC,
            overrides.effective_from DESC,
            overrides.created_at DESC
        `),
        this.prisma.$queryRaw<StaffTaxOverrideRow[]>(Prisma.sql`
          SELECT DISTINCT ON (overrides.staff_id, overrides.role_type)
            overrides.id,
            overrides.staff_id AS "staffId",
            NULLIF(
              TRIM(
                CONCAT(
                  COALESCE(staff_user.first_name, ''),
                  ' ',
                  COALESCE(staff_user.last_name, '')
                )
              ),
              ''
            ) AS "staffName",
            overrides.role_type AS "roleType",
            overrides.rate_percent AS "ratePercent",
            overrides.effective_from AS "effectiveFrom",
            overrides.created_at AS "createdAt"
          FROM staff_tax_deduction_overrides overrides
          INNER JOIN staff_info ON staff_info.id = overrides.staff_id
          INNER JOIN users staff_user ON staff_user.id = staff_info.user_id
          WHERE overrides.effective_from <= ${asOfDate}
            ${roleTypeFilterSql}
            ${staffIdFilterSql}
          ORDER BY
            overrides.staff_id ASC,
            overrides.role_type ASC,
            overrides.effective_from DESC,
            overrides.created_at DESC
        `),
      ]);

    return {
      asOfDate: asOfDate.toISOString().slice(0, 10),
      roleDefaults: {
        current: roleDefaultCurrentRows.map((row) =>
          this.mapRoleTaxRateRow(row),
        ),
        history: roleDefaultHistoryRows.map((row) =>
          this.mapRoleTaxRateRow(row),
        ),
      },
      staffOverrides: {
        current: staffOverrideCurrentRows.map((row) =>
          this.mapStaffTaxOverrideRow(row),
        ),
        history: staffOverrideHistoryRows.map((row) =>
          this.mapStaffTaxOverrideRow(row),
        ),
      },
    };
  }

  async appendRoleTaxDeductionRate(
    dto: CreateRoleTaxDeductionRateDto,
    actor?: ActionHistoryActor,
  ) {
    const ratePercent = normalizeRatePercent(dto.ratePercent);
    const effectiveFrom = parseAsOfDateOrThrow(dto.effectiveFrom);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.roleTaxDeductionRate.create({
          data: {
            roleType: dto.roleType,
            ratePercent,
            effectiveFrom,
          },
        });

        if (actor) {
          await this.actionHistoryService.recordCreate(tx, {
            actor,
            entityType: 'tax_deduction_role_rate',
            entityId: row.id,
            description: 'Append tax deduction role default rate',
            afterValue: this.mapRoleTaxRateRow(row),
          });
        }

        return row;
      });

      return this.mapRoleTaxRateRow(created);
    } catch (error) {
      normalizePostgresError(error);
      throw error;
    }
  }

  async updateRoleTaxDeductionRate(
    id: string,
    dto: UpdateRoleTaxDeductionRateDto,
    actor?: ActionHistoryActor,
  ) {
    const ratePercent = normalizeRatePercent(dto.ratePercent);
    const effectiveFrom = parseAsOfDateOrThrow(dto.effectiveFrom);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.roleTaxDeductionRate.findUnique({
          where: { id },
        });

        if (!existing) {
          throw new NotFoundException(
            'Role default tax deduction rate not found.',
          );
        }

        const beforeValue = this.mapRoleTaxRateRow({
          id: existing.id,
          roleType: existing.roleType,
          ratePercent: existing.ratePercent,
          effectiveFrom: existing.effectiveFrom,
          createdAt: existing.createdAt,
        });

        const row = await tx.roleTaxDeductionRate.update({
          where: { id },
          data: {
            ratePercent,
            effectiveFrom,
          },
        });

        const afterValue = this.mapRoleTaxRateRow({
          id: row.id,
          roleType: row.roleType,
          ratePercent: row.ratePercent,
          effectiveFrom: row.effectiveFrom,
          createdAt: row.createdAt,
        });

        if (actor) {
          await this.actionHistoryService.recordUpdate(tx, {
            actor,
            entityType: 'tax_deduction_role_rate',
            entityId: row.id,
            description: 'Update tax deduction role default rate',
            beforeValue,
            afterValue,
          });
        }

        return afterValue;
      });

      return updated;
    } catch (error) {
      normalizePostgresError(error);
      throw error;
    }
  }

  async appendStaffTaxDeductionOverride(
    dto: CreateStaffTaxDeductionOverrideDto,
    actor?: ActionHistoryActor,
  ) {
    const ratePercent = normalizeRatePercent(dto.ratePercent);
    const effectiveFrom = parseAsOfDateOrThrow(dto.effectiveFrom);
    const rowId = randomUUID();

    try {
      const createdRows = await this.prisma.$transaction(async (tx) => {
        const staffExistsRows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT id
            FROM staff_info
            WHERE id = ${dto.staffId}
            LIMIT 1
          `,
        );

        if (staffExistsRows.length === 0) {
          throw new BadRequestException('Staff not found.');
        }

        const rows = await tx.$queryRaw<StaffTaxOverrideRow[]>(Prisma.sql`
          INSERT INTO staff_tax_deduction_overrides (
            id,
            staff_id,
            role_type,
            rate_percent,
            effective_from
          )
          VALUES (
            ${rowId},
            ${dto.staffId},
            ${dto.roleType}::"StaffRole",
            ${ratePercent},
            ${effectiveFrom}
          )
          RETURNING
            id,
            staff_id AS "staffId",
            NULL::text AS "staffName",
            role_type AS "roleType",
            rate_percent AS "ratePercent",
            effective_from AS "effectiveFrom",
            created_at AS "createdAt"
        `);

        if (rows.length > 0 && actor) {
          await this.actionHistoryService.recordCreate(tx, {
            actor,
            entityType: 'tax_deduction_staff_override',
            entityId: rows[0].id,
            description: 'Append tax deduction staff override',
            afterValue: this.mapStaffTaxOverrideRow(rows[0]),
          });
        }

        return rows;
      });

      return this.mapStaffTaxOverrideRow(createdRows[0]);
    } catch (error) {
      normalizePostgresError(error);
      throw error;
    }
  }

  async updateStaffTaxDeductionOverride(
    id: string,
    dto: UpdateStaffTaxDeductionOverrideDto,
    actor?: ActionHistoryActor,
  ) {
    const ratePercent = normalizeRatePercent(dto.ratePercent);
    const effectiveFrom = parseAsOfDateOrThrow(dto.effectiveFrom);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.staffTaxDeductionOverride.findUnique({
          where: { id },
          include: {
            staff: {
              select: {
                user: {
                  select: {
                    first_name: true,
                    last_name: true,
                  },
                },
              },
            },
          },
        });

        if (!existing) {
          throw new NotFoundException(
            'Staff override tax deduction rate not found.',
          );
        }

        const beforeValue = this.mapStaffTaxOverrideRow({
          id: existing.id,
          staffId: existing.staffId,
          staffName: this.buildStaffDisplayName(existing.staff),
          roleType: existing.roleType,
          ratePercent: existing.ratePercent,
          effectiveFrom: existing.effectiveFrom,
          createdAt: existing.createdAt,
        });

        const row = await tx.staffTaxDeductionOverride.update({
          where: { id },
          data: {
            ratePercent,
            effectiveFrom,
          },
          include: {
            staff: {
              select: {
                user: {
                  select: {
                    first_name: true,
                    last_name: true,
                  },
                },
              },
            },
          },
        });

        const afterValue = this.mapStaffTaxOverrideRow({
          id: row.id,
          staffId: row.staffId,
          staffName: this.buildStaffDisplayName(row.staff),
          roleType: row.roleType,
          ratePercent: row.ratePercent,
          effectiveFrom: row.effectiveFrom,
          createdAt: row.createdAt,
        });

        if (actor) {
          await this.actionHistoryService.recordUpdate(tx, {
            actor,
            entityType: 'tax_deduction_staff_override',
            entityId: row.id,
            description: 'Update tax deduction staff override',
            beforeValue,
            afterValue,
          });
        }

        return afterValue;
      });

      return updated;
    } catch (error) {
      normalizePostgresError(error);
      throw error;
    }
  }

  async bulkUpsertStaffTaxDeductionOverrides(
    dto: BulkUpsertStaffTaxDeductionOverridesDto,
    actor?: ActionHistoryActor,
  ) {
    const normalizedStaffId = dto.staffId.trim();
    const normalizedItems = dto.items.map((item) => ({
      roleType: item.roleType,
      overrideId: item.overrideId?.trim() || null,
      ratePercent: normalizeRatePercent(item.ratePercent),
      effectiveFrom: parseAsOfDateOrThrow(item.effectiveFrom),
    }));

    const seenRoles = new Set<StaffRole>();
    for (const item of normalizedItems) {
      if (seenRoles.has(item.roleType)) {
        throw new BadRequestException(
          'Duplicate roleType found in bulk payload.',
        );
      }
      seenRoles.add(item.roleType);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const staffExists = await tx.staffInfo.findUnique({
          where: { id: normalizedStaffId },
          select: { id: true },
        });

        if (!staffExists) {
          throw new BadRequestException('Staff not found.');
        }

        const overrideIds = normalizedItems
          .map((item) => item.overrideId)
          .filter((value): value is string => !!value);
        const existingOverrides = overrideIds.length
          ? await tx.staffTaxDeductionOverride.findMany({
              where: {
                id: { in: overrideIds },
                staffId: normalizedStaffId,
              },
              include: {
                staff: {
                  select: {
                    user: {
                      select: {
                        first_name: true,
                        last_name: true,
                      },
                    },
                  },
                },
              },
            })
          : [];
        const existingMap = new Map(
          existingOverrides.map((item) => [item.id, item]),
        );

        const results: Array<ReturnType<typeof this.mapStaffTaxOverrideRow>> =
          [];

        for (const item of normalizedItems) {
          if (item.overrideId) {
            const existing = existingMap.get(item.overrideId);
            if (!existing) {
              throw new NotFoundException(
                `Staff override tax deduction rate not found: ${item.overrideId}.`,
              );
            }

            const beforeValue = this.mapStaffTaxOverrideRow({
              id: existing.id,
              staffId: existing.staffId,
              staffName: this.buildStaffDisplayName(existing.staff),
              roleType: existing.roleType,
              ratePercent: existing.ratePercent,
              effectiveFrom: existing.effectiveFrom,
              createdAt: existing.createdAt,
            });

            const updated = await tx.staffTaxDeductionOverride.update({
              where: { id: item.overrideId },
              data: {
                roleType: item.roleType,
                ratePercent: item.ratePercent,
                effectiveFrom: item.effectiveFrom,
              },
              include: {
                staff: {
                  select: {
                    user: {
                      select: {
                        first_name: true,
                        last_name: true,
                      },
                    },
                  },
                },
              },
            });

            const afterValue = this.mapStaffTaxOverrideRow({
              id: updated.id,
              staffId: updated.staffId,
              staffName: this.buildStaffDisplayName(updated.staff),
              roleType: updated.roleType,
              ratePercent: updated.ratePercent,
              effectiveFrom: updated.effectiveFrom,
              createdAt: updated.createdAt,
            });

            if (actor) {
              await this.actionHistoryService.recordUpdate(tx, {
                actor,
                entityType: 'tax_deduction_staff_override',
                entityId: updated.id,
                description: 'Bulk update tax deduction staff override',
                beforeValue,
                afterValue,
              });
            }

            results.push(afterValue);
            continue;
          }

          const created = await tx.staffTaxDeductionOverride.create({
            data: {
              id: randomUUID(),
              staffId: normalizedStaffId,
              roleType: item.roleType,
              ratePercent: item.ratePercent,
              effectiveFrom: item.effectiveFrom,
            },
            include: {
              staff: {
                select: {
                  user: {
                    select: {
                      first_name: true,
                      last_name: true,
                    },
                  },
                },
              },
            },
          });

          const createdValue = this.mapStaffTaxOverrideRow({
            id: created.id,
            staffId: created.staffId,
            staffName: this.buildStaffDisplayName(created.staff),
            roleType: created.roleType,
            ratePercent: created.ratePercent,
            effectiveFrom: created.effectiveFrom,
            createdAt: created.createdAt,
          });

          if (actor) {
            await this.actionHistoryService.recordCreate(tx, {
              actor,
              entityType: 'tax_deduction_staff_override',
              entityId: created.id,
              description: 'Bulk create tax deduction staff override',
              afterValue: createdValue,
            });
          }

          results.push(createdValue);
        }

        return {
          staffId: normalizedStaffId,
          updatedCount: results.length,
          overrides: results,
        };
      });
    } catch (error) {
      normalizePostgresError(error);
      throw error;
    }
  }

  private mapRoleTaxRateRow(row: RoleTaxRateRow) {
    return {
      id: row.id,
      roleType: row.roleType,
      ratePercent: normalizeRatePercent(row.ratePercent),
      effectiveFrom: new Date(row.effectiveFrom).toISOString().slice(0, 10),
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }

  private mapStaffTaxOverrideRow(row: StaffTaxOverrideRow) {
    return {
      id: row.id,
      staffId: row.staffId,
      staffName: row.staffName,
      roleType: row.roleType,
      ratePercent: normalizeRatePercent(row.ratePercent),
      effectiveFrom: new Date(row.effectiveFrom).toISOString().slice(0, 10),
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }
}

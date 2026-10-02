import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { StaffRole } from 'generated/enums';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FIXED_SALARY_STAFF_ROLES } from '../fixed-salary-settings/fixed-salary-staff-roles';

function toNullableNumber({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return Number(value);
}

/** Keep omitted fields as undefined so one axis can be skipped without clearing the other. */
function toOptionalNullableNumber({ value }: { value: unknown }) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  return Number(value);
}

export class UpsertRoleFixedSalaryDefaultItemDto {
  @ApiProperty({
    description:
      'Staff role this default fixed salary applies to. Teacher is excluded — session allowance only.',
    enum: FIXED_SALARY_STAFF_ROLES,
  })
  @IsIn(FIXED_SALARY_STAFF_ROLES)
  roleType: StaffRole;

  @ApiPropertyOptional({
    description:
      'Default fixed salary in VND. Null or omitted means the role is unconfigured (not 0).',
    nullable: true,
    example: 8_000_000,
    minimum: 0,
  })
  @Transform(toNullableNumber)
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  amount?: number | null;
}

export class UpsertRoleFixedSalaryDefaultsDto {
  @ApiProperty({
    description:
      'Role default salary rows to upsert. Unchanged roles may be omitted. Duplicate roleType values are rejected.',
    type: UpsertRoleFixedSalaryDefaultItemDto,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpsertRoleFixedSalaryDefaultItemDto)
  items: UpsertRoleFixedSalaryDefaultItemDto[];
}

export class UpsertRoleFixedSalaryOperatingRateItemDto {
  @ApiProperty({
    description:
      'Staff role this default fixed-salary operating percent applies to. Teacher is excluded.',
    enum: FIXED_SALARY_STAFF_ROLES,
  })
  @IsIn(FIXED_SALARY_STAFF_ROLES)
  roleType: StaffRole;

  @ApiPropertyOptional({
    description:
      'Operating deduction percent for this role’s fixed salary only. Null means unconfigured (not 0%). Does not affect teacher session allowance.',
    nullable: true,
    example: 10,
    minimum: 0,
    maximum: 100,
  })
  @Transform(toNullableNumber)
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  operatingRatePercent?: number | null;
}

export class UpsertRoleFixedSalaryOperatingRatesDto {
  @ApiProperty({
    description:
      'Role default operating-rate rows to upsert. Unchanged roles may be omitted. Duplicate roleType values are rejected.',
    type: UpsertRoleFixedSalaryOperatingRateItemDto,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpsertRoleFixedSalaryOperatingRateItemDto)
  items: UpsertRoleFixedSalaryOperatingRateItemDto[];
}

export class StaffFixedSalaryOverridesQueryDto {
  @ApiPropertyOptional({
    description: 'Search by staff first name, last name, handle, or id.',
    example: 'An',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Exact staff id. When set, search is ignored.',
  })
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: 40,
    description: 'Max staff rows to return.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class UpsertStaffFixedSalaryAmountDto {
  @ApiProperty({
    description: 'Staff id. Override is only allowed for a role this staff currently holds.',
  })
  @IsString()
  staffId: string;

  @ApiProperty({
    description:
      'Staff role to override independently of other roles on the same person. Teacher is excluded.',
    enum: FIXED_SALARY_STAFF_ROLES,
  })
  @IsIn(FIXED_SALARY_STAFF_ROLES)
  roleType: StaffRole;

  @ApiPropertyOptional({
    description:
      'Override amount in VND. Null clears this axis only (back to role default). 0 is stored and means the person is excluded from this role’s fixed salary.',
    nullable: true,
    example: 0,
    minimum: 0,
  })
  @Transform(toNullableNumber)
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  amount?: number | null;
}

export class StaffRoleFixedSalaryOverrideItemDto {
  @ApiProperty({
    description:
      'Staff role to write overrides for. Must also appear in the accompanying roles list. Teacher is excluded.',
    enum: FIXED_SALARY_STAFF_ROLES,
  })
  @IsIn(FIXED_SALARY_STAFF_ROLES)
  roleType: StaffRole;

  @ApiPropertyOptional({
    description:
      'Amount axis only. Null clears this override (role default applies). 0 stores an intentional exclusion. Omit to leave the amount override unchanged.',
    nullable: true,
    example: 0,
    minimum: 0,
  })
  @Transform(toOptionalNullableNumber)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(0)
  amount?: number | null;

  @ApiPropertyOptional({
    description:
      '% vận hành axis only. Null clears this override. 0 stores an intentional 0%. Omit to leave the operating-rate override unchanged.',
    nullable: true,
    example: 12,
    minimum: 0,
    maximum: 100,
  })
  @Transform(toOptionalNullableNumber)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  operatingRatePercent?: number | null;
}

export class UpsertStaffFixedSalaryOperatingRateDto {
  @ApiProperty({
    description: 'Staff id. Override is only allowed for a role this staff currently holds.',
  })
  @IsString()
  staffId: string;

  @ApiProperty({
    description:
      'Staff role to override independently of other roles on the same person. Teacher is excluded.',
    enum: FIXED_SALARY_STAFF_ROLES,
  })
  @IsIn(FIXED_SALARY_STAFF_ROLES)
  roleType: StaffRole;

  @ApiPropertyOptional({
    description:
      'Override operating percent. Null clears this axis only. 0 is stored as an intentional 0%. Does not write the salary-amount override.',
    nullable: true,
    example: 12,
    minimum: 0,
    maximum: 100,
  })
  @Transform(toNullableNumber)
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  operatingRatePercent?: number | null;
}

export class StaffFixedSalaryPayablesQueryDto {
  @ApiPropertyOptional({
    description:
      'Month to list (YYYY-MM). Defaults to the current calendar month in Asia/Ho_Chi_Minh.',
    example: '2026-09',
  })
  @IsOptional()
  @IsString()
  month?: string;
}

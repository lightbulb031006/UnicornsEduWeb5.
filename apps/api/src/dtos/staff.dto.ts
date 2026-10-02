import { Transform, Type } from 'class-transformer';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { StaffRoleFixedSalaryOverrideItemDto } from './fixed-salary-settings.dto';
import { Gender, PaymentStatus, StaffRole, StaffStatus } from 'generated/enums';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsDateString,
  IsEnum,
  IsNumber,
  Matches,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsStaffId } from '../common/entity-id.validators';

export class SearchAssignableStaffUsersDto {
  @ApiProperty({
    description: 'Full or partial email to search existing users',
    example: 'teacher@example.com',
  })
  @IsString()
  @MinLength(2)
  email: string;
}

export class SearchCustomerCareStaffDto {
  @ApiPropertyOptional({
    description: 'Full or partial staff full name',
    example: 'Nguyen',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Max number of options to return (default 20, max 50)',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SearchStaffOptionsDto {
  @ApiPropertyOptional({
    description: 'Full or partial staff full name',
    example: 'Nguyen',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Max number of options to return (default 20, max 50)',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateStaffDto {
  @ApiPropertyOptional({
    example: 'Nguyen',
    description:
      'Staff first name. Preferred over full_name; required when full_name is omitted.',
  })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({
    example: 'Van B',
    description: 'Staff last name.',
  })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({
    example: 'Nguyen Van B',
    description:
      'Deprecated compatibility field. Backend will split this into user first_name/last_name.',
  })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiProperty({
    example: '012345678901',
    description: 'Số CCCD gồm đúng 12 chữ số',
  })
  @IsString()
  @Matches(/^\d{12}$/, { message: 'Số CCCD phải gồm đúng 12 chữ số.' })
  cccd_number: string;

  @ApiPropertyOptional({ example: 'Kinh' })
  @IsOptional()
  @IsString()
  ethnicity?: string;

  @ApiPropertyOptional({ enum: Gender, example: Gender.male })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '123 Nguyễn Trãi, Quận 1, TP.HCM' })
  @IsOptional()
  @IsString()
  current_address?: string;

  @ApiPropertyOptional({ example: '2022-01-15' })
  @IsOptional()
  @IsDateString()
  cccd_issued_date?: string;

  @ApiPropertyOptional({ example: 'Cục CSQLHC về TTXH' })
  @IsOptional()
  @IsString()
  cccd_issued_place?: string;

  @ApiPropertyOptional({ example: '1998-01-01' })
  @IsOptional()
  @IsDateString()
  birth_date?: string;

  @ApiPropertyOptional({ example: 'HCMUT' })
  @IsOptional()
  @IsString()
  university?: string;

  @ApiPropertyOptional({ example: 'Le Hong Phong' })
  @IsOptional()
  @IsString()
  high_school?: string;

  @ApiPropertyOptional({ example: 'Math' })
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  bank_account?: string;

  @ApiPropertyOptional({ example: 'https://example.com/qr.png' })
  @IsOptional()
  @IsString()
  bank_qr_link?: string;

  @ApiProperty({ enum: StaffRole, isArray: true })
  @IsArray()
  @IsEnum(StaffRole, { each: true })
  roles: StaffRole[];

  @ApiProperty({ description: 'User id' })
  @IsUUID()
  user_id: string;

  @ApiPropertyOptional({
    description:
      'Staff id of the assistant who manages this CSKH staff (only valid when staff has customer_care role)',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @IsOptional()
  @IsStaffId()
  customer_care_managed_by_staff_id?: string | null;

  @ApiPropertyOptional({
    example: 'https://drive.google.com/drive/folders/abc123',
    description:
      'Link Google Drive hoặc URL thành tích cá nhân của nhân sự (không bắt buộc)',
  })
  @IsOptional()
  @IsString()
  personal_achievement_link?: string | null;

  @ApiPropertyOptional({
    example: 'https://meet.google.com/abc-defg-hij',
    description:
      'Link Google Meet cố định của gia sư (không bắt buộc; có thể để trống để hệ thống tự tạo khi cần)',
  })
  @IsOptional()
  @IsString()
  google_meet_link?: string | null;

  @ApiPropertyOptional({
    example: 3,
    description:
      'Tỷ lệ % hoa hồng trên tổng doanh thu hệ thống, áp dụng cho nhân sự có vai trò lesson_plan_head (Trưởng giáo án). Đơn vị phần trăm (VD: 3 = 3%).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  revenue_share_percent?: number | null;
}

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  @ApiProperty({
    description: 'Staff id',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @IsStaffId()
  id: string;

  @ApiPropertyOptional({ enum: StaffStatus })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;
}

export class UpdateStaffWithFixedSalaryOverridesDto extends OmitType(
  UpdateStaffDto,
  ['id'] as const,
) {
  @ApiProperty({
    enum: StaffRole,
    isArray: true,
    description:
      'Authoritative role list after this save. Overrides are applied only after these roles are written in the same transaction.',
  })
  @IsArray()
  @IsEnum(StaffRole, { each: true })
  roles: StaffRole[];

  @ApiProperty({
    type: StaffRoleFixedSalaryOverrideItemDto,
    isArray: true,
    description:
      'Per-role lương cứng / % vận hành overrides for roles in `roles`. Null on an axis clears that override only. 0 is stored as an intentional exclusion. Omitted axes are left unchanged. Roles removed from `roles` have both override rows deleted in this same transaction; action-history records that deletion with the disabled role. Closed-month staff_fixed_salary_payables are never written.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffRoleFixedSalaryOverrideItemDto)
  roleFixedSalaryOverrides: StaffRoleFixedSalaryOverrideItemDto[];
}

export class UpdateStaffStatusDto {
  @ApiProperty({ enum: StaffStatus })
  @IsEnum(StaffStatus)
  status: StaffStatus;

  @ApiPropertyOptional({
    description: 'Optional audit reason for the staff status transition.',
    example: 'Nhân sự kết thúc hợp tác.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class PatchStaffClassTeacherOperatingDeductionDto {
  @ApiProperty({
    description:
      '% khấu trừ vận hành (cột `class_teachers.tax_rate_percent` / Prisma `operatingDeductionRatePercent`)',
    example: 7.5,
    minimum: 0,
    maximum: 100,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'operating_deduction_rate_percent phải là số 0–100 tối đa 2 chữ số thập phân.',
    },
  )
  @Min(0)
  @Max(100)
  operating_deduction_rate_percent: number;
}

export interface StaffIncomeAmountSummaryDto {
  total: number;
  paid: number;
  unpaid: number;
}

/**
 * Tổng hợp theo lớp (giáo viên) cho card "Lớp phụ trách".
 * `total` / `paid` / `unpaid` đều là gross allowance, chưa trừ CPVH/thuế.
 *
 * Visibility: luôn gồm phân công hiện tại (`class_teachers.status` null/`active`);
 * lớp nghỉ dạy (`inactive` hoặc không còn phân công) chỉ có mặt khi còn trợ cấp
 * trong tháng đang chọn và/hoặc còn `unpaid`/`pending` — khi đó `isCurrentTeacherAssignment=false`.
 */
export interface StaffIncomeClassSummaryDto extends StaffIncomeAmountSummaryDto {
  classId: string;
  className: string;
  /**
   * True khi gia sư còn phân công hiện tại trên lớp (`class_teachers.status` null/`active`).
   * False = nghỉ dạy theo lớp nhưng vẫn còn thu nhập/trợ cấp trong kỳ hoặc snapshot chưa nhận.
   */
  isCurrentTeacherAssignment: boolean;
}

export interface StaffIncomeRoleSummaryDto extends StaffIncomeAmountSummaryDto {
  role: string;
  label: string;
}

export interface StaffFixedSalaryRoleSummaryDto extends StaffIncomeRoleSummaryDto {
  grossTotal: number;
  operatingDeductionTotal: number;
  taxDeductionTotal: number;
}

export interface StaffFixedSalaryPayableItemDto {
  id: string;
  roleType: StaffRole;
  roleLabel: string;
  month: string;
  status: PaymentStatus;
  note: string | null;
  grossAmount: number;
  operatingRatePercent: number;
  taxRatePercent: number;
  operatingDeductionAmount: number;
  taxDeductionAmount: number;
  netAmount: number;
}

export interface StaffIncomeDepositSessionDto {
  id: string;
  date: string;
  teacherPaymentStatus: string | null;
  teacherAllowanceTotal: number;
}

export interface StaffIncomeDepositClassSummaryDto {
  classId: string;
  className: string;
  total: number;
  sessions: StaffIncomeDepositSessionDto[];
}

export interface StaffIncomeSummaryDto {
  recentUnpaidDays: number;
  /**
   * Gross “Chưa nhận”: toàn bộ khoản pending/unpaid hiện tại từ mọi nguồn, không giới hạn tháng
   * hoặc cửa sổ `days`; không gồm session trạng thái cọc.
   */
  snapshotUnpaidTotal: number;
  /**
   * Net “Chưa nhận”: cùng phạm vi `snapshotUnpaidTotal`; giáo viên trừ vận hành hiện hành theo lớp
   * rồi tính thuế trên phần sau vận hành; các role khác chỉ trừ thuế hiện hành, không trừ vận hành.
   */
  snapshotUnpaidNetTotal: number;
  /** Tổng trợ cấp net đã thanh toán trong năm (theo `year`) */
  yearPaidNetTotal: number;
  /** Card “Tổng nhận”: NET của tháng đang chọn = `monthlyIncomeTotals.total`. */
  incomeStatsTotalNet: number;
  /** Tổng NET đã nhận/chưa nhận hiện tại; giữ để tương thích contract cũ. */
  totalReceivedNet: number;
  monthlyIncomeTotals: StaffIncomeAmountSummaryDto;
  monthlyGrossTotals: StaffIncomeAmountSummaryDto;
  monthlyTaxTotals: StaffIncomeAmountSummaryDto;
  monthlyOperatingDeductionTotals: StaffIncomeAmountSummaryDto;
  monthlyTotalDeductionTotals: StaffIncomeAmountSummaryDto;
  sessionMonthlyTotals: StaffIncomeAmountSummaryDto;
  sessionMonthlyGrossTotals: StaffIncomeAmountSummaryDto;
  sessionMonthlyTaxTotals: StaffIncomeAmountSummaryDto;
  sessionMonthlyOperatingDeductionTotals: StaffIncomeAmountSummaryDto;
  sessionMonthlyTotalDeductionTotals: StaffIncomeAmountSummaryDto;
  sessionYearTotal: number;
  yearIncomeTotal: number;
  yearGrossIncomeTotal: number;
  yearTaxTotal: number;
  yearOperatingDeductionTotal: number;
  yearTotalDeductionTotal: number;
  depositYearTotal: number;
  depositYearByClass: StaffIncomeDepositClassSummaryDto[];
  classMonthlySummaries: StaffIncomeClassSummaryDto[];
  /**
   * Thưởng trong tháng đang xem: **thực nhận** sau khấu trừ thuế (theo % hiện hành của role ưu tiên trên hồ sơ).
   * Giá trị gross thưởng nằm trong `monthlyGrossTotals`; thuế thưởng trong `monthlyTaxTotals`.
   */
  bonusMonthlyTotals: StaffIncomeAmountSummaryDto;
  otherRoleSummaries: StaffIncomeRoleSummaryDto[];
  /** Lương cứng theo role: tách khỏi trợ cấp / thưởng / trợ cấp thêm. Net-first như Công việc khác. */
  fixedSalaryRoleSummaries: StaffFixedSalaryRoleSummaryDto[];
  /** Khoản lương cứng tháng đang xem, cộng mọi khoản pending khác tháng (để sửa trước khi trả). */
  fixedSalaryPayables: StaffFixedSalaryPayableItemDto[];
}

export class StaffPaymentMonthDto {
  @ApiProperty({
    description: 'Month in 01-12 format',
    example: '03',
  })
  @Matches(/^(0[1-9]|1[0-2])$/, {
    message: 'month must use 01-12 format.',
  })
  month: string;

  @ApiProperty({
    description: 'Year in YYYY format',
    example: '2026',
  })
  @Matches(/^\d{4}$/, {
    message: 'year must use YYYY format.',
  })
  year: string;

  @ApiPropertyOptional({
    description:
      'Kế toán xác nhận vẫn thanh toán dù nhân sự còn báo cáo khảo sát quá hạn (bỏ qua cảnh báo SURVEY_OVERDUE_WARNING).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  confirmOverdueSurveyReports?: boolean;
}

export class StaffDepositPaymentYearDto {
  @ApiProperty({
    description: 'Year in YYYY format',
    example: '2026',
  })
  @Matches(/^\d{4}$/, {
    message: 'year must use YYYY format.',
  })
  year: string;
}

export interface StaffPaymentPreviewTotalsDto {
  grossTotal: number;
  operatingTotal: number;
  taxTotal: number;
  netTotal: number;
  itemCount: number;
}

export interface StaffPaymentPreviewItemDto {
  id: string;
  label: string;
  secondaryLabel: string | null;
  classId?: string | null;
  date: string | null;
  currentStatus: string | null;
  taxRatePercent: number;
  grossAmount: number;
  operatingAmount: number;
  taxAmount: number;
  netAmount: number;
}

export interface StaffPaymentPreviewSourceDto extends StaffPaymentPreviewTotalsDto {
  sourceType: string;
  sourceLabel: string;
  items: StaffPaymentPreviewItemDto[];
}

export interface StaffPaymentPreviewSectionDto extends StaffPaymentPreviewTotalsDto {
  role: StaffRole | null;
  label: string;
  sources: StaffPaymentPreviewSourceDto[];
}

export interface StaffPaymentPreviewDto {
  staffId: string;
  month: string;
  taxAsOfDate: string;
  summary: StaffPaymentPreviewTotalsDto;
  sections: StaffPaymentPreviewSectionDto[];
}

export class StaffPayAllPaymentsDto extends StaffPaymentMonthDto {}

export const STAFF_PAYMENT_SOURCE_TYPES = [
  'teacher_session',
  'customer_care',
  'assistant_share',
  'training_manager',
  'lesson_output',
  'revenue_share',
  'extra_allowance',
  'bonus',
  'fixed_salary',
] as const;

export class UpdateStaffFixedSalaryPayableDto {
  @ApiPropertyOptional({
    description:
      'Gross amount in VND. Recalculates net from the frozen operating and tax percents on this payable.',
    example: 4_000_000,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({
    description: 'Optional note. Empty string clears the note.',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    const trimmed = String(value).trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  @ValidateIf((_, value) => value != null)
  @IsString()
  note?: string | null;
}

export type StaffPaymentSourceTypeDto =
  (typeof STAFF_PAYMENT_SOURCE_TYPES)[number];

export class StaffPaySelectedPaymentItemDto {
  @ApiProperty({
    description: 'Payment preview source type',
    enum: STAFF_PAYMENT_SOURCE_TYPES,
    example: 'customer_care',
  })
  @IsString()
  @IsIn(STAFF_PAYMENT_SOURCE_TYPES)
  sourceType: StaffPaymentSourceTypeDto;

  @ApiProperty({
    description: 'Entity id from payment preview item',
    example: '53d7f00c-4ae7-4a1d-b4d3-67415159f4c8',
  })
  @IsUUID('4')
  id: string;
}

export class StaffPaySelectedPaymentsDto extends StaffPaymentMonthDto {
  @ApiProperty({
    description: 'Selected payable items from payment preview',
    type: [StaffPaySelectedPaymentItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StaffPaySelectedPaymentItemDto)
  items: StaffPaySelectedPaymentItemDto[];
}

export interface StaffOverdueSurveyWarningItemDto {
  surveyId: string;
  surveyName: string;
  classNames: string[];
}

export interface StaffPayAllPaymentsSourceResultDto {
  sourceType: string;
  sourceLabel: string;
  updatedCount: number;
}

export interface StaffPayAllPaymentsResultDto {
  staffId: string;
  month: string;
  requestedItemCount: number;
  updatedCount: number;
  updatedBySource: StaffPayAllPaymentsSourceResultDto[];
}

export interface StaffDepositPaymentPreviewTotalsDto {
  preTaxTotal: number;
  taxTotal: number;
  netTotal: number;
  itemCount: number;
}

export interface StaffDepositPaymentPreviewSessionDto {
  id: string;
  date: string;
  currentStatus: string | null;
  preTaxAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  netAmount: number;
}

export interface StaffDepositPaymentPreviewClassDto extends StaffDepositPaymentPreviewTotalsDto {
  classId: string;
  className: string;
  sessions: StaffDepositPaymentPreviewSessionDto[];
}

export interface StaffDepositPaymentPreviewDto {
  staffId: string;
  year: string;
  taxAsOfDate: string;
  summary: StaffDepositPaymentPreviewTotalsDto;
  classes: StaffDepositPaymentPreviewClassDto[];
}

export class StaffPayDepositSessionsDto {
  @ApiProperty({
    description: 'Selected deposit session ids to be paid',
    type: [String],
    example: ['53d7f00c-4ae7-4a1d-b4d3-67415159f4c8'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  sessionIds: string[];

  @ApiPropertyOptional({
    description:
      'Kế toán xác nhận vẫn thanh toán dù nhân sự còn báo cáo khảo sát quá hạn (bỏ qua cảnh báo SURVEY_OVERDUE_WARNING).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  confirmOverdueSurveyReports?: boolean;
}

export interface StaffPayDepositSessionsResultDto {
  staffId: string;
  taxAsOfDate: string;
  teacherTaxRatePercent: number;
  requestedItemCount: number;
  updatedCount: number;
  updatedSessionIds: string[];
}

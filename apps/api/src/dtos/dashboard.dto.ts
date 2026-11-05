import type { StudentCustomerSource } from 'generated/enums';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { STUDENT_CUSTOMER_SOURCE_VALUES } from './student.dto';

export const ADMIN_DASHBOARD_FINANCIAL_DETAIL_ROW_KEYS = [
  'topup',
  'revenue',
  'prepaid',
  'uncollected',
  'pending-payroll',
  'personnel-cost',
  'other-cost',
  'profit',
  'total-in',
  'customer-source',
] as const;

export const ADMIN_DASHBOARD_CUSTOMER_SOURCE_KEYS =
  STUDENT_CUSTOMER_SOURCE_VALUES;

export type AdminDashboardFinancialDetailRowKeyDto =
  (typeof ADMIN_DASHBOARD_FINANCIAL_DETAIL_ROW_KEYS)[number];

export class GetAdminDashboardQueryDto {
  @ApiPropertyOptional({
    description: 'Month in 01-12 format. Defaults to current month.',
    example: '03',
  })
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])$/, {
    message: 'month must use 01-12 format.',
  })
  month?: string;

  @ApiPropertyOptional({
    description: 'Year in YYYY format. Defaults to current year.',
    example: '2026',
  })
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'year must use YYYY format.',
  })
  year?: string;

  @ApiPropertyOptional({
    description: 'Number of rows returned for action alert groups.',
    example: 6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  alertLimit?: number;

  @ApiPropertyOptional({
    description: 'Number of rows returned for top classes table.',
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  topClassLimit?: number;

  @ApiPropertyOptional({
    description:
      'Date range start in YYYY-MM-DD format. When provided together with dateTo, overrides month/year and activates date-range mode for financial calculations.',
    example: '2026-04-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateFrom must use YYYY-MM-DD format.',
  })
  dateFrom?: string;

  @ApiPropertyOptional({
    description:
      'Date range end (inclusive) in YYYY-MM-DD format. Must be used together with dateFrom.',
    example: '2026-04-30',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateTo must use YYYY-MM-DD format.',
  })
  dateTo?: string;
}

export class GetAdminTopupHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Month in 01-12 format. Defaults to current month.',
    example: '03',
  })
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])$/, {
    message: 'month must use 01-12 format.',
  })
  month?: string;

  @ApiPropertyOptional({
    description: 'Year in YYYY format. Defaults to current year.',
    example: '2026',
  })
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'year must use YYYY format.',
  })
  year?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of topup rows returned.',
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Date range start in YYYY-MM-DD format.',
    example: '2026-04-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateFrom must use YYYY-MM-DD format.',
  })
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Date range end (inclusive) in YYYY-MM-DD format.',
    example: '2026-04-30',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateTo must use YYYY-MM-DD format.',
  })
  dateTo?: string;
}

export class GetAdminStudentBalanceDetailsQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of student rows returned.',
    example: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Month in 01-12 format. Defaults to current month; scopes prepaid drill-down to students with session activity in this month.',
    example: '03',
  })
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])$/, {
    message: 'month must use 01-12 format.',
  })
  month?: string;

  @ApiPropertyOptional({
    description:
      'Year in YYYY format. Defaults to current year; pairs with month.',
    example: '2026',
  })
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'year must use YYYY format.',
  })
  year?: string;

  @ApiPropertyOptional({
    description: 'Date range start in YYYY-MM-DD format.',
    example: '2026-04-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateFrom must use YYYY-MM-DD format.',
  })
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Date range end (inclusive) in YYYY-MM-DD format.',
    example: '2026-04-30',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateTo must use YYYY-MM-DD format.',
  })
  dateTo?: string;
}

export const ADMIN_DASHBOARD_STUDENT_CHURN_TYPES = [
  'new',
  'dropped',
  'trial_dropped',
  'active',
] as const;

export type AdminDashboardStudentChurnTypeDto =
  (typeof ADMIN_DASHBOARD_STUDENT_CHURN_TYPES)[number];

export class GetAdminStudentChurnDetailsQueryDto {
  @ApiProperty({
    description:
      'Churn type: new (enrolled in period), dropped (Học sinh cũ nghỉ in period), trial_dropped (Học sinh thử nghỉ in period) or active (snapshot).',
    enum: ADMIN_DASHBOARD_STUDENT_CHURN_TYPES,
    example: 'new',
  })
  @IsIn(ADMIN_DASHBOARD_STUDENT_CHURN_TYPES)
  type: AdminDashboardStudentChurnTypeDto;

  @ApiPropertyOptional({
    description: 'Month in 01-12 format. Defaults to current month.',
    example: '03',
  })
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])$/, {
    message: 'month must use 01-12 format.',
  })
  month?: string;

  @ApiPropertyOptional({
    description: 'Year in YYYY format. Defaults to current year.',
    example: '2026',
  })
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'year must use YYYY format.',
  })
  year?: string;

  @ApiPropertyOptional({
    description: 'Date range start in YYYY-MM-DD format.',
    example: '2026-04-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateFrom must use YYYY-MM-DD format.',
  })
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Date range end (inclusive) in YYYY-MM-DD format.',
    example: '2026-04-30',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateTo must use YYYY-MM-DD format.',
  })
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of student rows returned.',
    example: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class GetAdminDashboardFinancialDetailQueryDto {
  @ApiProperty({
    description: 'Financial summary row key.',
    enum: ADMIN_DASHBOARD_FINANCIAL_DETAIL_ROW_KEYS,
    example: 'personnel-cost',
  })
  @IsIn(ADMIN_DASHBOARD_FINANCIAL_DETAIL_ROW_KEYS)
  rowKey!: AdminDashboardFinancialDetailRowKeyDto;

  @ApiPropertyOptional({
    description:
      'Nguồn khách cần mở chi tiết. Bắt buộc khi rowKey là customer-source. unassigned = Chưa gán.',
    enum: ADMIN_DASHBOARD_CUSTOMER_SOURCE_KEYS,
    example: 'tiktok',
  })
  @ValidateIf(
    (dto: GetAdminDashboardFinancialDetailQueryDto) =>
      dto.rowKey === 'customer-source',
  )
  @IsIn(ADMIN_DASHBOARD_CUSTOMER_SOURCE_KEYS)
  customerSource?: (typeof ADMIN_DASHBOARD_CUSTOMER_SOURCE_KEYS)[number];

  @ApiPropertyOptional({
    description: 'Month in 01-12 format. Defaults to current month.',
    example: '03',
  })
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])$/, {
    message: 'month must use 01-12 format.',
  })
  month?: string;

  @ApiPropertyOptional({
    description: 'Year in YYYY format. Defaults to current year.',
    example: '2026',
  })
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'year must use YYYY format.',
  })
  year?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of detail rows returned.',
    example: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Date range start in YYYY-MM-DD format. When provided together with dateTo, activates date-range mode for this popup.',
    example: '2026-04-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateFrom must use YYYY-MM-DD format.',
  })
  dateFrom?: string;

  @ApiPropertyOptional({
    description:
      'Date range end (inclusive) in YYYY-MM-DD format. Must be used together with dateFrom.',
    example: '2026-04-30',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateTo must use YYYY-MM-DD format.',
  })
  dateTo?: string;
}

export interface AdminDashboardPeriodDto {
  month: string;
  year: string;
  /** Human-readable period label; may be a date range string in date-range mode. */
  monthLabel: string;
  viewMode: 'month' | 'range';
  dateFrom?: string;
  dateTo?: string;
}

export interface AdminDashboardSummaryDto {
  activeClasses: number;
  activeStudents: number;
  /** All StudentInfo (toàn hệ thống, không lọc theo CSKH) có createdAt rơi trong kỳ đang chọn. */
  newStudentsThisMonth: number;
  /** Học sinh cũ nghỉ (toàn hệ thống): dropOutDate rơi trong kỳ, đã nạp ví thành công và học ≥2 buổi. */
  droppedStudentsThisMonth: number;
  /** Học sinh thử nghỉ (toàn hệ thống): dropOutDate rơi trong kỳ, không đủ điều kiện cũ nghỉ. */
  trialDroppedStudentsThisMonth: number;
  monthlyTopupTotal: number;
  totalLearnedTuition: number;
  monthlyRevenue: number;
  monthlyExpense: number;
  monthlyProfit: number;
  prepaidTuitionTotal: number;
  pendingCollectionTotal: number;
  pendingPayrollTotal: number;
  /** All-time pending/unpaid payroll by source (snapshot; not filtered by month/range). */
  pendingPayrollBreakdown: AdminDashboardPendingPayrollBreakdownDto;
  expiringStudentsCount: number;
  debtStudentsCount: number;
  unpaidStaffCount: number;
  classAlertCount: number;
  currentSurveyRound: number;
  totalAlerts: number;
}

export interface AdminDashboardPendingPayrollBreakdownDto {
  sessionAmount: number;
  customerCareAmount: number;
  lessonAmount: number;
  bonusAmount: number;
  extraAllowanceAmount: number;
  fixedSalaryAmount: number;
  assistantAmount: number;
  trainingManagerAmount: number;
}

export interface AdminDashboardTrendPointDto {
  monthKey: string;
  month: string;
  revenue: number;
  expense: number;
  profit: number;
}

export interface AdminDashboardBreakdownItemDto {
  key:
    | 'revenue'
    | 'teacherCost'
    | 'customerCareCost'
    | 'lessonCost'
    | 'bonusCost'
    | 'extraAllowanceCost'
    | 'fixedSalaryCost'
    | 'assistantCost'
    | 'trainingManagerCost'
    | 'operatingCost';
  label: string;
  kind: 'revenue' | 'expense';
  amount: number;
}

export const ADMIN_DASHBOARD_ACTION_ALERT_GROUPS = [
  'expiring',
  'debt',
  'payroll',
  'class',
] as const;

export type AdminDashboardActionAlertGroupDto =
  (typeof ADMIN_DASHBOARD_ACTION_ALERT_GROUPS)[number];

export interface AdminDashboardActionAlertDto {
  type:
    | 'Sắp hết tiền'
    | 'Chưa thu'
    | 'Nhân sự chưa thanh toán'
    | 'Lớp cảnh báo';
  subject: string;
  owner: string | null;
  due: string;
  amount: number;
  /**
   * Optional non-money detail line. When set, the FE renders this instead of a
   * currency-formatted amount (used by survey alerts, e.g. "Mới nhất: lần 5").
   */
  detail?: string | null;
  severity: 'warning' | 'destructive' | 'info';
  targetType: 'student' | 'staff' | 'class';
  targetId: string;
}

export class GetAdminDashboardActionAlertsQueryDto {
  @ApiProperty({
    description: 'Action alert group to paginate.',
    enum: ADMIN_DASHBOARD_ACTION_ALERT_GROUPS,
    example: 'expiring',
  })
  @IsIn(ADMIN_DASHBOARD_ACTION_ALERT_GROUPS)
  group!: AdminDashboardActionAlertGroupDto;

  @ApiPropertyOptional({
    description: 'Month in 01-12 format. Defaults to current month.',
    example: '03',
  })
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])$/, {
    message: 'month must use 01-12 format.',
  })
  month?: string;

  @ApiPropertyOptional({
    description: 'Year in YYYY format. Defaults to current year.',
    example: '2026',
  })
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'year must use YYYY format.',
  })
  year?: string;

  @ApiPropertyOptional({
    description: 'Page number (1-based).',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Rows per page.',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export interface AdminDashboardActionAlertListDto {
  data: AdminDashboardActionAlertDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface AdminDashboardClassPerformanceDto {
  classId: string;
  name: string;
  students: number;
  revenue: number;
  profit: number;
  balanceRisk: number;
}

export interface AdminDashboardYearlySummaryDto {
  quarter: string;
  classes: number;
  revenue: number;
  expense: number;
  profit: number;
}

export interface AdminDashboardMonthlyStatisticDto {
  monthKey: string;
  month: string;
  students: number;
  classes: number;
  teachers: number;
  revenue: number;
  expense: number;
  profit: number;
  teacherCost: number;
  customerCareCost: number;
  lessonCost: number;
  bonusCost: number;
  extraAllowanceCost: number;
  fixedSalaryCost: number;
  assistantCost: number;
  trainingManagerCost: number;
  operatingCost: number;
  totalTopup: number;
  totalUnpaid: number;
}

export interface AdminDashboardMonthlyStatisticsDto {
  fromMonthKey: string;
  toMonthKey: string;
  months: AdminDashboardMonthlyStatisticDto[];
}

export class GetAdminMonthlyStatisticsQueryDto {
  @ApiProperty({
    description: 'Start month in 01-12 format.',
    example: '09',
  })
  @Matches(/^(0[1-9]|1[0-2])$/, {
    message: 'fromMonth must use 01-12 format.',
  })
  fromMonth: string;

  @ApiProperty({
    description: 'Start year in YYYY format.',
    example: '2025',
  })
  @Matches(/^\d{4}$/, {
    message: 'fromYear must use YYYY format.',
  })
  fromYear: string;

  @ApiProperty({
    description: 'End month in 01-12 format (inclusive).',
    example: '08',
  })
  @Matches(/^(0[1-9]|1[0-2])$/, {
    message: 'toMonth must use 01-12 format.',
  })
  toMonth: string;

  @ApiProperty({
    description: 'End year in YYYY format (inclusive).',
    example: '2026',
  })
  @Matches(/^\d{4}$/, {
    message: 'toYear must use YYYY format.',
  })
  toYear: string;
}

export interface AdminDashboardTopupHistoryItemDto {
  id: string;
  dateTime: string;
  studentName: string;
  amount: number;
  note: string;
  cumulativeBefore: number;
  cumulativeAfter: number;
}

export interface AdminDashboardStudentBalanceItemDto {
  studentId: string;
  studentName: string;
  className: string;
  balance: number;
}

export interface AdminDashboardStudentChurnItemDto {
  studentId: string;
  studentName: string;
  className: string;
  eventDate: string;
  /** Chỉ có ở `dropped` / `trial_dropped`: lý do nghỉ trên hồ sơ, `null` khi chưa điền. */
  dropOutReason?: string | null;
}

/** Một khoá học (phân loại lớp) đang có lớp `running`. */
export interface AdminDashboardActiveClassBreakdownItemDto {
  courseId: string;
  courseName: string;
  classCount: number;
  studentCount: number;
}

/**
 * Snapshot lớp đang chạy, nhóm theo khoá học.
 * `studentCount` ở gốc là số học sinh không trùng (khớp `summary.activeStudents`).
 * Tổng `items[].studentCount` có thể lớn hơn vì một học sinh học nhiều khoá.
 */
export interface AdminDashboardActiveClassBreakdownDto {
  courseTypeCount: number;
  classCount: number;
  studentCount: number;
  items: AdminDashboardActiveClassBreakdownItemDto[];
}

export interface AdminDashboardFinancialDetailSourceDto {
  key: string;
  label: string;
  amount: number;
  note: string;
  tone: 'positive' | 'negative' | 'neutral';
}

export interface AdminDashboardFinancialDetailItemDto {
  id: string;
  label: string;
  secondaryLabel: string | null;
  amount: number;
  note: string | null;
  /**
   * Số tiền theo `sources[].key` (có dấu, phạt âm). Có trên Chi phí nhân sự và
   * Trợ cấp chờ thanh toán; FE dùng để lọc theo thẻ nguồn.
   */
  sourceAmounts?: Record<string, number>;
}

export interface AdminDashboardCustomerSourceRowDto {
  key: (typeof ADMIN_DASHBOARD_CUSTOMER_SOURCE_KEYS)[number];
  label: string;
  studentCount: number;
  revenue: number;
  /** Một chữ số thập phân. Tổng bảy dòng là 100 khi doanh thu kỳ > 0, và 0 khi doanh thu kỳ = 0. */
  sharePercent: number;
}

export interface AdminDashboardFinancialDetailDto {
  rowKey: AdminDashboardFinancialDetailRowKeyDto;
  title: string;
  description: string;
  amount: number;
  sources: AdminDashboardFinancialDetailSourceDto[];
  items: AdminDashboardFinancialDetailItemDto[];
  emptyState: string;
}

export class GetAdminDashboardFinancialExportQueryDto {
  @ApiPropertyOptional({
    description: 'Month in 01-12 format. Defaults to current month.',
    example: '03',
  })
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])$/, {
    message: 'month must use 01-12 format.',
  })
  month?: string;

  @ApiPropertyOptional({
    description: 'Year in YYYY format. Defaults to current year.',
    example: '2026',
  })
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'year must use YYYY format.',
  })
  year?: string;

  @ApiPropertyOptional({
    description:
      'Maximum number of detail rows returned per section (revenue / personnel / other cost). Defaults to 5000.',
    example: 5000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Date range start in YYYY-MM-DD format. When provided together with dateTo, activates date-range mode.',
    example: '2026-01-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateFrom must use YYYY-MM-DD format.',
  })
  dateFrom?: string;

  @ApiPropertyOptional({
    description:
      'Date range end (inclusive) in YYYY-MM-DD format. Must be used together with dateFrom.',
    example: '2026-08-03',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateTo must use YYYY-MM-DD format.',
  })
  dateTo?: string;
}

export interface AdminDashboardFinancialExportRevenueItemDto {
  studentId: string;
  studentName: string;
  className: string;
  amount: number;
  attendanceCount: number;
}

export interface AdminDashboardFinancialExportPersonnelItemDto {
  staffId: string;
  staffName: string;
  amount: number;
  note: string;
}

export interface AdminDashboardFinancialExportOtherCostItemDto {
  id: string;
  label: string;
  amount: number;
  note: string;
}

export interface AdminDashboardFinancialExportSummaryDto {
  topup: number;
  revenue: number;
  personnelCost: number;
  otherCost: number;
  profit: number;
  totalIn: number;
}

export interface AdminDashboardFinancialExportMetaDto {
  revenueItemCount: number;
  revenueTruncated: boolean;
  personnelItemCount: number;
  personnelTruncated: boolean;
  otherCostItemCount: number;
  otherCostTruncated: boolean;
}

export interface AdminDashboardFinancialExportDto {
  period: AdminDashboardPeriodDto;
  summary: AdminDashboardFinancialExportSummaryDto;
  revenueItems: AdminDashboardFinancialExportRevenueItemDto[];
  personnelItems: AdminDashboardFinancialExportPersonnelItemDto[];
  otherCostItems: AdminDashboardFinancialExportOtherCostItemDto[];
  meta: AdminDashboardFinancialExportMetaDto;
}

export interface AdminDashboardDto {
  period: AdminDashboardPeriodDto;
  summary: AdminDashboardSummaryDto;
  revenueProfitTrend: AdminDashboardTrendPointDto[];
  breakdown: AdminDashboardBreakdownItemDto[];
  actionAlerts: AdminDashboardActionAlertDto[];
  classPerformance: AdminDashboardClassPerformanceDto[];
  yearlySummary: AdminDashboardYearlySummaryDto[];
  customerSources: AdminDashboardCustomerSourceRowDto[];
}

export class GetStaffDashboardQueryDto {
  @ApiPropertyOptional({
    description: 'Month in 01-12 format. Defaults to current month.',
    example: '03',
  })
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])$/, {
    message: 'month must use 01-12 format.',
  })
  month?: string;

  @ApiPropertyOptional({
    description: 'Year in YYYY format. Defaults to current year.',
    example: '2026',
  })
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'year must use YYYY format.',
  })
  year?: string;
}

export interface StaffDashboardClassItemDto {
  id: string;
  name: string;
  studentCount: number;
  scheduleCount: number;
  surveyCount: number;
}

export interface StaffDashboardClassAlertItemDto {
  classId: string;
  className: string;
  reason: string;
  missingSchedule: boolean;
  missingSurvey: boolean;
  latestRequiredSurveyTestNumber: number | null;
  latestClassSurveyTestNumber: number | null;
}

export interface StaffDashboardTodaySessionItemDto {
  sessionId: string;
  classId: string;
  className: string;
  startTime: string | null;
  endTime: string | null;
  attendanceCount: number;
  teacherPaymentStatus: string | null;
}

export interface StaffDashboardTeacherSectionDto {
  assignedClasses: StaffDashboardClassItemDto[];
  missingScheduleOrSurvey: StaffDashboardClassAlertItemDto[];
  todaySessions: StaffDashboardTodaySessionItemDto[];
}

export interface StaffDashboardTaskItemDto {
  taskId: string;
  title: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  responsibleName: string | null;
  assigneeNames: string[];
}

export interface StaffDashboardLessonPlanSectionDto {
  totalTaskCount: number;
  completedTaskCount: number;
  remainingTaskCount: number;
  openTasks: StaffDashboardTaskItemDto[];
}

export interface StaffDashboardLessonPlanHeadTotalsDto {
  totalOutputs: number;
  newOutputsThisMonth: number;
  newOutputsThisWeek: number;
}

export interface StaffDashboardLessonPlanHeadSectionDto {
  incompleteTasks: StaffDashboardTaskItemDto[];
  lessonOutputTotals: StaffDashboardLessonPlanHeadTotalsDto;
}

export interface StaffDashboardSystemSummaryDto {
  activeClasses: number;
  activeStudents: number;
  activeTeachers: number;
}

export interface StaffDashboardCustomerCarePortfolioItemDto {
  staffId: string;
  staffName: string;
  activeStudentCount: number;
  learnedTuitionTotal: number;
  topupTotal: number;
}

export interface StaffDashboardSalesCsSummaryDto {
  activeStudentsCount: number;
  newStudentsThisMonth: number;
  droppedStudentsThisMonth: number;
  debtStudentCount: number;
  totalDebtAmount: number;
}

export interface StaffDashboardSalesCsStaffItemDto {
  staffId: string;
  staffName: string;
  monthlyRevenue: number;
  debtStudentCount: number;
  totalDebtAmount: number;
  activeStudentsCount: number;
  newStudentsCount: number;
  droppedStudentsCount: number;
}

export interface StaffDashboardAssistantSectionDto {
  actionAlerts: AdminDashboardActionAlertDto[];
  systemSummary: StaffDashboardSystemSummaryDto;
  /** @deprecated Use managedCustomerCarePortfolios */
  customerCarePortfolios: StaffDashboardCustomerCarePortfolioItemDto[];
  myCustomerCarePortfolio: StaffDashboardCustomerCarePortfolioItemDto | null;
  managedCustomerCarePortfolios: StaffDashboardCustomerCarePortfolioItemDto[];
  salesCsSummary: StaffDashboardSalesCsSummaryDto;
  salesCsStaffBreakdown: StaffDashboardSalesCsStaffItemDto[];
}

export interface StaffDashboardStudentAlertItemDto {
  studentId: string;
  studentName: string;
  classNames: string;
  accountBalance: number;
  referenceTuition: number | null;
  dueLabel: string;
}

export type StaffDashboardStudentChangeType = 'new' | 'dropped' | 'active';

export type StaffDashboardStudentChangeScope = 'own' | 'managed';

export interface StaffDashboardStudentChangeItemDto {
  studentId: string;
  studentName: string;
  classNames: string | null;
  /** ISO date: createdAt (type=new) hoặc dropOutDate (type=dropped). */
  eventDate: string | null;
}

const STAFF_DASHBOARD_STUDENT_CHANGE_TYPES: StaffDashboardStudentChangeType[] =
  ['new', 'dropped', 'active'];

const STAFF_DASHBOARD_STUDENT_CHANGE_SCOPES: StaffDashboardStudentChangeScope[] =
  ['own', 'managed'];

export class GetStaffDashboardStudentChangesQueryDto {
  @ApiPropertyOptional({
    description: 'Month in 01-12 format. Defaults to current month.',
    example: '03',
  })
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])$/, {
    message: 'month must use 01-12 format.',
  })
  month?: string;

  @ApiPropertyOptional({
    description: 'Year in YYYY format. Defaults to current year.',
    example: '2026',
  })
  @IsOptional()
  @Matches(/^\d{4}$/, {
    message: 'year must use YYYY format.',
  })
  year?: string;

  @ApiProperty({
    description:
      'Loại biến động học sinh cần xem: new (mới) hoặc dropped (nghỉ).',
    enum: STAFF_DASHBOARD_STUDENT_CHANGE_TYPES,
    example: 'new',
  })
  @IsIn(STAFF_DASHBOARD_STUDENT_CHANGE_TYPES)
  type: StaffDashboardStudentChangeType;

  @ApiProperty({
    description:
      'Phạm vi CSKH: own (chỉ học sinh do bản thân phụ trách) hoặc managed (bản thân + CSKH được quản lí, dùng cho trợ lí).',
    enum: STAFF_DASHBOARD_STUDENT_CHANGE_SCOPES,
    example: 'own',
  })
  @IsIn(STAFF_DASHBOARD_STUDENT_CHANGE_SCOPES)
  scope: StaffDashboardStudentChangeScope;

  @ApiPropertyOptional({
    description:
      'Filter by specific CSKH staff ID. When provided, returns only students assigned to that staff member.',
    example: 'staff-uuid-here',
  })
  @IsOptional()
  @IsString()
  staffId?: string;
}

export interface StaffDashboardCustomerCareSectionDto {
  newStudentsThisMonth: number;
  droppedStudentsThisMonth: number;
  activeStudentsCount: number;
  learnedTuitionTotal: number;
  topupTotal: number;
  lowBalanceStudents: StaffDashboardStudentAlertItemDto[];
  debtStudents: StaffDashboardStudentAlertItemDto[];
}

export interface StaffDashboardUnpaidStaffItemDto {
  staffId: string;
  staffName: string;
  sessionAmount: number;
  bonusAmount: number;
  customerCareAmount: number;
  lessonAmount: number;
  extraAllowanceAmount: number;
  fixedSalaryAmount?: number;
  assistantAmount?: number;
  totalUnpaid: number;
}

export interface StaffDashboardFinancialOverviewDto {
  period: AdminDashboardPeriodDto;
  summary: AdminDashboardSummaryDto;
  breakdown: AdminDashboardBreakdownItemDto[];
}

export interface StaffDashboardAccountantSectionDto {
  unpaidStaff: StaffDashboardUnpaidStaffItemDto[];
  financialOverview: StaffDashboardFinancialOverviewDto;
}

export interface StaffDashboardExpenseSummaryDto {
  totalIncurred: number;
  totalPaid: number;
  totalPending: number;
  pendingStaffCount: number;
  pendingStaffTotal: number;
}

export interface StaffDashboardExpenseBreakdownItemDto {
  key:
    | 'teacherCost'
    | 'customerCareCost'
    | 'assistantCost'
    | 'lessonCost'
    | 'bonusCost'
    | 'extraAllowanceCost'
    | 'fixedSalaryCost'
    | 'operatingCost';
  label: string;
  amount: number;
}

export interface StaffDashboardPendingOperatingCostItemDto {
  id: string;
  category: string | null;
  amount: number;
  date: string | null;
  description: string | null;
}

export interface StaffDashboardPendingOperatingCostsDto {
  totalAmount: number;
  totalCount: number;
  items: StaffDashboardPendingOperatingCostItemDto[];
}

export interface StaffDashboardExpenseSectionDto {
  period: AdminDashboardPeriodDto;
  summary: StaffDashboardExpenseSummaryDto;
  breakdown: StaffDashboardExpenseBreakdownItemDto[];
  pendingStaff: StaffDashboardUnpaidStaffItemDto[];
  pendingOperatingCosts: StaffDashboardPendingOperatingCostsDto;
}

export interface StaffDashboardTrainingSectionDto {
  todayClassCount: number;
  todayEventCount: number;
  runningClassCount: number;
  fixedScheduleSlotCount: number;
}

export interface StaffDashboardDto {
  teacher?: StaffDashboardTeacherSectionDto;
  lessonPlan?: StaffDashboardLessonPlanSectionDto;
  lessonPlanHead?: StaffDashboardLessonPlanHeadSectionDto;
  assistant?: StaffDashboardAssistantSectionDto;
  customerCare?: StaffDashboardCustomerCareSectionDto;
  accountant?: StaffDashboardAccountantSectionDto;
  accountantExpense?: StaffDashboardExpenseSectionDto;
  training?: StaffDashboardTrainingSectionDto;
}

export class GetAdminMonthlyReportQueryDto {
  @ApiProperty({ description: 'Report month in 01-12 format.', example: '09' })
  @Matches(/^(0[1-9]|1[0-2])$/, { message: 'month must use 01-12 format.' })
  month: string;

  @ApiProperty({ description: 'Report year in YYYY format.', example: '2026' })
  @Matches(/^\d{4}$/, { message: 'year must use YYYY format.' })
  year: string;
}

export interface MonthlyReportKpiDto {
  /** Tổng nạp ví hợp lệ (QR completed + nạp thẳng approved) trong tháng. */
  totalTopUpInMonth: number;
  topUpTransactionCount: number;
  /** Học sinh đang học tại lúc xem (snapshot). */
  activeStudents: number;
  newStudents: number;
  /** Học sinh cũ nghỉ trong tháng. */
  droppedStudents: number;
  /** Học sinh thử nghỉ trong tháng (không trừ vào tăng ròng). */
  trialDroppedStudents: number;
  netChange: number;
  /** Số học sinh nghỉ sớm thuộc nhóm cũ nghỉ; phần còn lại là thử nghỉ. */
  earlyDropOldCount: number;
  newStillActive: number;
}

export interface MonthlyReportCourseDto {
  courseId: string;
  courseName: string;
}

export interface MonthlyReportMatrixCellDto {
  customerSource: StudentCustomerSource;
  /** `null` = Chưa xếp lớp. */
  courseId: string | null;
  /** Học sinh mới có lớp đầu tiên thuộc khoá của ô. */
  newCount: number;
  /** Tổng nghỉ sớm (cũ nghỉ + thử nghỉ). */
  earlyDropCount: number;
  earlyDropOldCount: number;
  /** Số học sinh mới có doanh thu > 0 ở khoá của ô trong tháng. */
  earningCount: number;
  /**
   * Doanh thu mới: Học phí đã học trong tháng (attendance present/excused,
   * gồm thu bù học thử và gói bán một lần) của học sinh mới cùng nguồn, tính
   * theo khoá của lớp có buổi — học sinh đổi sang lớp khoá khác thì doanh thu
   * nằm ở ô khoá mới (ô có thể có doanh thu mà `newCount = 0`).
   */
  revenue: number;
}

export interface MonthlyReportCustomerCareRowDto {
  /** `null` = học sinh chưa có CSKH phụ trách. */
  staffId: string | null;
  staffName: string;
  activeStudents: number;
  newStudents: number;
  droppedStudents: number;
  netChange: number;
  earlyDropCount: number;
  earlyDropOldCount: number;
  totalTopUpInMonth: number;
  topUpTransactionCount: number;
}

export interface MonthlyReportNewStudentDto {
  studentId: string;
  fullName: string;
  customerCareStaffName: string | null;
  className: string | null;
  courseId: string | null;
  courseName: string | null;
  customerSource: StudentCustomerSource;
  firstTopUpAt: string;
  totalTopUp: number;
  /** Doanh thu mới của học sinh trong tháng (Học phí đã học, mọi khoá). */
  revenueInMonth: number;
  /** Nghỉ sớm: học sinh mới của tháng mà hiện đang nghỉ. */
  isEarlyDrop: boolean;
  /** `old` = cũ nghỉ, `trial` = thử nghỉ; `null` khi chưa nghỉ. */
  earlyDropKind: 'old' | 'trial' | null;
  dropOutDate: string | null;
}

export interface MonthlyReportDroppedStudentDto {
  studentId: string;
  fullName: string;
  customerCareStaffName: string | null;
  className: string | null;
  dropOutDate: string;
  dropOutReason: string | null;
}

export interface AdminMonthlyReportDto {
  month: string;
  year: string;
  generatedAt: string;
  kpi: MonthlyReportKpiDto;
  /** Chỉ các khoá có ít nhất một học sinh mới, theo tên. */
  courses: MonthlyReportCourseDto[];
  matrix: MonthlyReportMatrixCellDto[];
  customerCare: MonthlyReportCustomerCareRowDto[];
  newStudents: MonthlyReportNewStudentDto[];
  droppedStudents: MonthlyReportDroppedStudentDto[];
}

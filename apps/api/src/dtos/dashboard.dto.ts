import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

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
] as const;

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

export class GetAdminDashboardFinancialDetailQueryDto {
  @ApiProperty({
    description: 'Financial summary row key.',
    enum: ADMIN_DASHBOARD_FINANCIAL_DETAIL_ROW_KEYS,
    example: 'personnel-cost',
  })
  @IsIn(ADMIN_DASHBOARD_FINANCIAL_DETAIL_ROW_KEYS)
  rowKey!: AdminDashboardFinancialDetailRowKeyDto;

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
  monthlyTopupTotal: number;
  totalLearnedTuition: number;
  monthlyRevenue: number;
  monthlyExpense: number;
  monthlyProfit: number;
  prepaidTuitionTotal: number;
  pendingCollectionTotal: number;
  pendingPayrollTotal: number;
  expiringStudentsCount: number;
  debtStudentsCount: number;
  unpaidStaffCount: number;
  classAlertCount: number;
  currentSurveyRound: number;
  totalAlerts: number;
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

export interface AdminDashboardDto {
  period: AdminDashboardPeriodDto;
  summary: AdminDashboardSummaryDto;
  revenueProfitTrend: AdminDashboardTrendPointDto[];
  breakdown: AdminDashboardBreakdownItemDto[];
  actionAlerts: AdminDashboardActionAlertDto[];
  classPerformance: AdminDashboardClassPerformanceDto[];
  yearlySummary: AdminDashboardYearlySummaryDto[];
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

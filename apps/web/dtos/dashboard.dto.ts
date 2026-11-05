import type { StudentCustomerSource } from "./student.dto";

export interface AdminDashboardPeriod {
  month: string;
  year: string;
  /** Human-readable label; in range mode this is "dateFrom – dateTo". */
  monthLabel: string;
  viewMode?: "month" | "range";
  dateFrom?: string;
  dateTo?: string;
}

export interface AdminDashboardSummary {
  activeClasses: number;
  activeStudents: number;
  /** Toàn hệ thống (không lọc theo CSKH), createdAt rơi trong kỳ đang chọn. */
  newStudentsThisMonth: number;
  /** Học sinh cũ nghỉ: dropOutDate rơi trong kỳ, đã nạp ví thành công và học ≥2 buổi (cộng mọi lớp). */
  droppedStudentsThisMonth: number;
  /** Học sinh thử nghỉ: dropOutDate rơi trong kỳ, không đủ điều kiện cũ nghỉ. */
  trialDroppedStudentsThisMonth: number;
  monthlyTopupTotal: number;
  totalLearnedTuition: number;
  monthlyRevenue: number;
  monthlyExpense: number;
  monthlyProfit: number;
  prepaidTuitionTotal: number;
  pendingCollectionTotal: number;
  pendingPayrollTotal: number;
  /** All-time pending/unpaid payroll by source (snapshot). */
  pendingPayrollBreakdown: AdminDashboardPendingPayrollBreakdown;
  expiringStudentsCount: number;
  debtStudentsCount: number;
  unpaidStaffCount: number;
  classAlertCount: number;
  currentSurveyRound: number;
  totalAlerts: number;
}

export interface AdminDashboardPendingPayrollBreakdown {
  sessionAmount: number;
  customerCareAmount: number;
  lessonAmount: number;
  bonusAmount: number;
  extraAllowanceAmount: number;
  fixedSalaryAmount: number;
  assistantAmount: number;
  trainingManagerAmount: number;
}

export interface AdminDashboardTrendPoint {
  monthKey: string;
  month: string;
  revenue: number;
  expense: number;
  profit: number;
}

export type AdminDashboardBreakdownKey =
  | "revenue"
  | "teacherCost"
  | "customerCareCost"
  | "lessonCost"
  | "bonusCost"
  | "extraAllowanceCost"
  | "fixedSalaryCost"
  | "assistantCost"
  | "trainingManagerCost"
  | "operatingCost";

export interface AdminDashboardBreakdownItem {
  key: AdminDashboardBreakdownKey;
  label: string;
  kind: "revenue" | "expense";
  amount: number;
}

export interface AdminDashboardActionAlert {
  type: "Sắp hết tiền" | "Chưa thu" | "Nhân sự chưa thanh toán" | "Lớp cảnh báo";
  subject: string;
  owner: string | null;
  due: string;
  amount: number;
  /** Non-money detail line (e.g. survey alerts). Rendered instead of currency. */
  detail?: string | null;
  severity: "warning" | "destructive" | "info";
  targetType: "student" | "staff" | "class";
  targetId: string;
}

export type AdminDashboardActionAlertGroup = "expiring" | "debt" | "payroll" | "class";

export interface AdminDashboardActionAlertList {
  data: AdminDashboardActionAlert[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface AdminDashboardClassPerformance {
  classId: string;
  name: string;
  students: number;
  revenue: number;
  profit: number;
  balanceRisk: number;
}

export interface AdminDashboardYearlySummary {
  quarter: string;
  classes: number;
  revenue: number;
  expense: number;
  profit: number;
}

export interface AdminDashboardMonthlyStatistic {
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

export interface AdminDashboardMonthlyStatistics {
  fromMonthKey: string;
  toMonthKey: string;
  months: AdminDashboardMonthlyStatistic[];
}

export interface AdminDashboardTopupHistoryItem {
  id: string;
  dateTime: string;
  studentName: string;
  amount: number;
  note: string;
  cumulativeBefore: number;
  cumulativeAfter: number;
}

export interface AdminDashboardStudentBalanceItem {
  studentId: string;
  studentName: string;
  className: string;
  balance: number;
}

export type AdminDashboardStudentChurnType = "new" | "dropped" | "trial_dropped" | "active";

export interface AdminDashboardStudentChurnItem {
  studentId: string;
  studentName: string;
  className: string;
  eventDate: string;
  /** Chỉ có ở `dropped` / `trial_dropped`: lý do nghỉ trên hồ sơ, `null` khi chưa điền. */
  dropOutReason?: string | null;
}

export interface AdminDashboardActiveClassBreakdownItem {
  courseId: string;
  courseName: string;
  classCount: number;
  studentCount: number;
}

export interface AdminDashboardActiveClassBreakdown {
  courseTypeCount: number;
  classCount: number;
  studentCount: number;
  items: AdminDashboardActiveClassBreakdownItem[];
}

export type AdminDashboardFinancialDetailRowKey =
  | "topup"
  | "revenue"
  | "prepaid"
  | "uncollected"
  | "pending-payroll"
  | "personnel-cost"
  | "other-cost"
  | "profit"
  | "total-in"
  | "customer-source";

/** Bốn Nguồn khách (tập đóng). */
export type AdminDashboardCustomerSourceKey = StudentCustomerSource;

export interface AdminDashboardCustomerSourceRow {
  key: AdminDashboardCustomerSourceKey;
  label: string;
  studentCount: number;
  revenue: number;
  sharePercent: number;
}

export interface AdminDashboardFinancialDetailSource {
  key: string;
  label: string;
  amount: number;
  note: string;
  tone: "positive" | "negative" | "neutral";
}

export interface AdminDashboardFinancialDetailItem {
  id: string;
  label: string;
  secondaryLabel: string | null;
  amount: number;
  note: string | null;
  /** Số tiền theo `sources[].key` (có dấu, phạt âm). Có trên Chi phí nhân sự và Trợ cấp chờ thanh toán. */
  sourceAmounts?: Record<string, number>;
}

export interface AdminDashboardFinancialDetail {
  rowKey: AdminDashboardFinancialDetailRowKey;
  title: string;
  description: string;
  amount: number;
  sources: AdminDashboardFinancialDetailSource[];
  items: AdminDashboardFinancialDetailItem[];
  emptyState: string;
}

export interface AdminDashboardFinancialExportRevenueItem {
  studentId: string;
  studentName: string;
  className: string;
  amount: number;
  attendanceCount: number;
}

export interface AdminDashboardFinancialExportPersonnelItem {
  staffId: string;
  staffName: string;
  amount: number;
  note: string;
}

export interface AdminDashboardFinancialExportOtherCostItem {
  id: string;
  label: string;
  amount: number;
  note: string;
}

export interface AdminDashboardFinancialExportSummary {
  topup: number;
  revenue: number;
  personnelCost: number;
  otherCost: number;
  profit: number;
  totalIn: number;
}

export interface AdminDashboardFinancialExportMeta {
  revenueItemCount: number;
  revenueTruncated: boolean;
  personnelItemCount: number;
  personnelTruncated: boolean;
  otherCostItemCount: number;
  otherCostTruncated: boolean;
}

export interface AdminDashboardFinancialExport {
  period: AdminDashboardPeriod;
  summary: AdminDashboardFinancialExportSummary;
  revenueItems: AdminDashboardFinancialExportRevenueItem[];
  personnelItems: AdminDashboardFinancialExportPersonnelItem[];
  otherCostItems: AdminDashboardFinancialExportOtherCostItem[];
  meta: AdminDashboardFinancialExportMeta;
}

export interface AdminDashboardDto {
  period: AdminDashboardPeriod;
  summary: AdminDashboardSummary;
  revenueProfitTrend: AdminDashboardTrendPoint[];
  breakdown: AdminDashboardBreakdownItem[];
  actionAlerts: AdminDashboardActionAlert[];
  classPerformance: AdminDashboardClassPerformance[];
  yearlySummary: AdminDashboardYearlySummary[];
  customerSources?: AdminDashboardCustomerSourceRow[];
}

export interface StaffDashboardClassItem {
  id: string;
  name: string;
  studentCount: number;
  scheduleCount: number;
  surveyCount: number;
}

export interface StaffDashboardClassAlertItem {
  classId: string;
  className: string;
  reason: string;
  missingSchedule: boolean;
  missingSurvey: boolean;
  latestRequiredSurveyTestNumber: number | null;
  latestClassSurveyTestNumber: number | null;
}

export interface StaffDashboardTodaySessionItem {
  sessionId: string;
  classId: string;
  className: string;
  startTime: string | null;
  endTime: string | null;
  attendanceCount: number;
  teacherPaymentStatus: string | null;
}

export interface StaffDashboardTeacherSection {
  assignedClasses: StaffDashboardClassItem[];
  missingScheduleOrSurvey: StaffDashboardClassAlertItem[];
  todaySessions: StaffDashboardTodaySessionItem[];
}

export interface StaffDashboardTaskItem {
  taskId: string;
  title: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  responsibleName: string | null;
  assigneeNames: string[];
}

export interface StaffDashboardLessonPlanSection {
  totalTaskCount: number;
  completedTaskCount: number;
  remainingTaskCount: number;
  openTasks: StaffDashboardTaskItem[];
}

export interface StaffDashboardLessonPlanHeadTotals {
  totalOutputs: number;
  newOutputsThisMonth: number;
  newOutputsThisWeek: number;
}

export interface StaffDashboardLessonPlanHeadSection {
  incompleteTasks: StaffDashboardTaskItem[];
  lessonOutputTotals: StaffDashboardLessonPlanHeadTotals;
}

export interface StaffDashboardSystemSummary {
  activeClasses: number;
  activeStudents: number;
  activeTeachers: number;
}

export interface StaffDashboardCustomerCarePortfolioItem {
  staffId: string;
  staffName: string;
  activeStudentCount: number;
  learnedTuitionTotal: number;
  topupTotal: number;
}

export interface StaffDashboardSalesCsSummary {
  activeStudentsCount: number;
  newStudentsThisMonth: number;
  droppedStudentsThisMonth: number;
  debtStudentCount: number;
  totalDebtAmount: number;
}

export interface StaffDashboardSalesCsStaffItem {
  staffId: string;
  staffName: string;
  monthlyRevenue: number;
  debtStudentCount: number;
  totalDebtAmount: number;
  activeStudentsCount: number;
  newStudentsCount: number;
  droppedStudentsCount: number;
}

export interface StaffDashboardAssistantSection {
  actionAlerts: AdminDashboardActionAlert[];
  systemSummary: StaffDashboardSystemSummary;
  /** @deprecated Use managedCustomerCarePortfolios */
  customerCarePortfolios: StaffDashboardCustomerCarePortfolioItem[];
  myCustomerCarePortfolio: StaffDashboardCustomerCarePortfolioItem | null;
  managedCustomerCarePortfolios: StaffDashboardCustomerCarePortfolioItem[];
  salesCsSummary: StaffDashboardSalesCsSummary;
  salesCsStaffBreakdown: StaffDashboardSalesCsStaffItem[];
}

export interface StaffDashboardStudentAlertItem {
  studentId: string;
  studentName: string;
  classNames: string;
  accountBalance: number;
  referenceTuition: number | null;
  dueLabel: string;
}

export interface StaffDashboardCustomerCareSection {
  newStudentsThisMonth: number;
  droppedStudentsThisMonth: number;
  activeStudentsCount: number;
  learnedTuitionTotal: number;
  topupTotal: number;
  lowBalanceStudents: StaffDashboardStudentAlertItem[];
  debtStudents: StaffDashboardStudentAlertItem[];
}

export type StaffDashboardStudentChangeType = "new" | "dropped" | "active";

export type StaffDashboardStudentChangeScope = "own" | "managed";

export interface StaffDashboardStudentChangeItem {
  studentId: string;
  studentName: string;
  classNames: string | null;
  /** ISO date: createdAt (type=new) hoặc dropOutDate (type=dropped). */
  eventDate: string | null;
}

export interface StaffDashboardUnpaidStaffItem {
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

export interface StaffDashboardFinancialOverview {
  period: AdminDashboardPeriod;
  summary: AdminDashboardSummary;
  breakdown: AdminDashboardBreakdownItem[];
}

export interface StaffDashboardAccountantSection {
  unpaidStaff: StaffDashboardUnpaidStaffItem[];
  financialOverview: StaffDashboardFinancialOverview;
}

export interface StaffDashboardExpenseSummary {
  totalIncurred: number;
  totalPaid: number;
  totalPending: number;
  pendingStaffCount: number;
  pendingStaffTotal: number;
}

export interface StaffDashboardExpenseBreakdownItem {
  key:
    | "teacherCost"
    | "customerCareCost"
    | "assistantCost"
    | "lessonCost"
    | "bonusCost"
    | "extraAllowanceCost"
    | "fixedSalaryCost"
    | "operatingCost";
  label: string;
  amount: number;
}

export interface StaffDashboardPendingOperatingCostItem {
  id: string;
  category: string | null;
  amount: number;
  date: string | null;
  description: string | null;
}

export interface StaffDashboardPendingOperatingCosts {
  totalAmount: number;
  totalCount: number;
  items: StaffDashboardPendingOperatingCostItem[];
}

export interface StaffDashboardExpenseSection {
  period: AdminDashboardPeriod;
  summary: StaffDashboardExpenseSummary;
  breakdown: StaffDashboardExpenseBreakdownItem[];
  pendingStaff: StaffDashboardUnpaidStaffItem[];
  pendingOperatingCosts: StaffDashboardPendingOperatingCosts;
}

export interface StaffDashboardTrainingSection {
  todayClassCount: number;
  todayEventCount: number;
  runningClassCount: number;
  fixedScheduleSlotCount: number;
}

export interface StaffDashboardDto {
  teacher?: StaffDashboardTeacherSection;
  lessonPlan?: StaffDashboardLessonPlanSection;
  lessonPlanHead?: StaffDashboardLessonPlanHeadSection;
  assistant?: StaffDashboardAssistantSection;
  customerCare?: StaffDashboardCustomerCareSection;
  accountant?: StaffDashboardAccountantSection;
  accountantExpense?: StaffDashboardExpenseSection;
  training?: StaffDashboardTrainingSection;
}

/** `old` = Học sinh cũ nghỉ, `trial` = Học sinh thử nghỉ. */
export type MonthlyReportEarlyDropKind = "old" | "trial";

export interface MonthlyReportKpi {
  /** Tổng nạp ví hợp lệ trong tháng (QR hoàn tất + nạp thẳng đã duyệt). */
  totalTopUpInMonth: number;
  topUpTransactionCount: number;
  activeStudents: number;
  newStudents: number;
  /** Học sinh cũ nghỉ trong tháng. */
  droppedStudents: number;
  /** Học sinh thử nghỉ trong tháng (không trừ vào tăng ròng). */
  trialDroppedStudents: number;
  netChange: number;
  earlyDropOldCount: number;
  newStillActive: number;
}

export interface MonthlyReportCourse {
  courseId: string;
  courseName: string;
}

export interface MonthlyReportMatrixCell {
  customerSource: StudentCustomerSource;
  /** `null` = Chưa xếp lớp. */
  courseId: string | null;
  newCount: number;
  /** Tổng nghỉ sớm (cũ nghỉ + thử nghỉ). */
  earlyDropCount: number;
  earlyDropOldCount: number;
  /** Số học sinh mới có doanh thu > 0 ở khoá của ô trong tháng. */
  earningCount: number;
  /**
   * Doanh thu mới: Học phí đã học trong tháng của học sinh mới cùng nguồn, theo
   * khoá của lớp có buổi (đổi lớp sang khoá khác → ô khoá mới, có thể `newCount = 0`).
   */
  revenue: number;
}

export interface MonthlyReportCustomerCareRow {
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

export interface MonthlyReportNewStudent {
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
  isEarlyDrop: boolean;
  earlyDropKind: MonthlyReportEarlyDropKind | null;
  dropOutDate: string | null;
}

export interface MonthlyReportDroppedStudent {
  studentId: string;
  fullName: string;
  customerCareStaffName: string | null;
  className: string | null;
  dropOutDate: string;
  dropOutReason: string | null;
}

export interface AdminMonthlyReport {
  month: string;
  year: string;
  generatedAt: string;
  kpi: MonthlyReportKpi;
  courses: MonthlyReportCourse[];
  matrix: MonthlyReportMatrixCell[];
  customerCare: MonthlyReportCustomerCareRow[];
  newStudents: MonthlyReportNewStudent[];
  droppedStudents: MonthlyReportDroppedStudent[];
}

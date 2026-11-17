import type {
  AdminDashboardBreakdownItemDto,
  StaffDashboardAccountantSectionDto,
  StaffDashboardFinancialSummaryDto,
  StaffDashboardPayrollSummaryField,
} from 'src/dtos/dashboard.dto';

const PAYROLL_SUMMARY_FIELDS: readonly StaffDashboardPayrollSummaryField[] = [
  'monthlyExpense',
  'monthlyProfit',
  'pendingPayrollTotal',
  'pendingPayrollBreakdown',
  'unpaidStaffCount',
];

/** Dòng breakdown không phải khoản chi nhân sự: doanh thu + chi phí vận hành (cost_extend). */
const NON_PAYROLL_BREAKDOWN_KEYS: ReadonlySet<
  AdminDashboardBreakdownItemDto['key']
> = new Set(['revenue', 'operatingCost']);

/**
 * #270: Kế toán thu không thấy khoản chi nào cho nhân sự. Bỏ danh sách nhân sự
 * chưa thanh toán, các tổng payroll trong summary và các dòng chi phí nhân sự
 * trong breakdown của section kế toán trên dashboard cá nhân.
 */
export function redactAccountantSectionStaffPayouts(
  section: StaffDashboardAccountantSectionDto,
): StaffDashboardAccountantSectionDto {
  const summary: StaffDashboardFinancialSummaryDto = {
    ...section.financialOverview.summary,
  };
  for (const field of PAYROLL_SUMMARY_FIELDS) {
    delete summary[field];
  }

  return {
    financialOverview: {
      period: section.financialOverview.period,
      summary,
      breakdown: section.financialOverview.breakdown.filter((item) =>
        NON_PAYROLL_BREAKDOWN_KEYS.has(item.key),
      ),
    },
    staffPayoutsVisible: false,
  };
}

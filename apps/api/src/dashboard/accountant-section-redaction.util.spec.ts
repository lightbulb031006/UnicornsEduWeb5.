import type { StaffDashboardAccountantSectionDto } from 'src/dtos/dashboard.dto';
import { redactAccountantSectionStaffPayouts } from './accountant-section-redaction.util';

function buildSection(): StaffDashboardAccountantSectionDto {
  return {
    unpaidStaff: [{ id: 'staff-1' } as never],
    staffPayoutsVisible: true,
    financialOverview: {
      period: { from: '2026-11-01', to: '2026-11-30' } as never,
      summary: {
        activeClasses: 3,
        activeStudents: 20,
        newStudentsThisMonth: 1,
        droppedStudentsThisMonth: 0,
        trialDroppedStudentsThisMonth: 0,
        monthlyTopupTotal: 1_000,
        totalLearnedTuition: 900,
        monthlyRevenue: 900,
        monthlyExpense: 500,
        monthlyProfit: 400,
        prepaidTuitionTotal: 100,
        pendingCollectionTotal: 50,
        pendingPayrollTotal: 300,
        pendingPayrollBreakdown: { teacher: 300 } as never,
        expiringStudentsCount: 0,
        debtStudentsCount: 1,
        unpaidStaffCount: 2,
        classAlertCount: 0,
        currentSurveyRound: 1,
        totalAlerts: 0,
      },
      breakdown: [
        { key: 'revenue', label: 'Doanh thu', kind: 'revenue', amount: 900 },
        { key: 'teacherCost', label: 'Gia sư', kind: 'expense', amount: 300 },
        { key: 'bonusCost', label: 'Thưởng', kind: 'expense', amount: 50 },
        {
          key: 'fixedSalaryCost',
          label: 'Lương cứng',
          kind: 'expense',
          amount: 100,
        },
        {
          key: 'operatingCost',
          label: 'Chi phí vận hành',
          kind: 'expense',
          amount: 50,
        },
      ] as never,
    },
  };
}

describe('redactAccountantSectionStaffPayouts (#270)', () => {
  it('bỏ danh sách nhân sự chưa thanh toán và mọi tổng payroll', () => {
    const result = redactAccountantSectionStaffPayouts(buildSection());

    expect(result.staffPayoutsVisible).toBe(false);
    expect(result).not.toHaveProperty('unpaidStaff');
    for (const key of [
      'monthlyExpense',
      'monthlyProfit',
      'pendingPayrollTotal',
      'pendingPayrollBreakdown',
      'unpaidStaffCount',
    ]) {
      expect(result.financialOverview.summary).not.toHaveProperty(key);
    }
  });

  it('giữ số liệu thu (doanh thu, nạp ví, công nợ học sinh)', () => {
    const { summary } =
      redactAccountantSectionStaffPayouts(buildSection()).financialOverview;

    expect(summary).toMatchObject({
      monthlyRevenue: 900,
      monthlyTopupTotal: 1_000,
      pendingCollectionTotal: 50,
      prepaidTuitionTotal: 100,
      debtStudentsCount: 1,
    });
  });

  it('breakdown chỉ còn doanh thu và chi phí vận hành', () => {
    const { breakdown } =
      redactAccountantSectionStaffPayouts(buildSection()).financialOverview;

    expect(breakdown.map((item) => item.key)).toEqual([
      'revenue',
      'operatingCost',
    ]);
  });

  it('không sửa section gốc', () => {
    const section = buildSection();
    redactAccountantSectionStaffPayouts(section);

    expect(section.unpaidStaff).toHaveLength(1);
    expect(section.financialOverview.summary.pendingPayrollTotal).toBe(300);
    expect(section.financialOverview.breakdown).toHaveLength(5);
  });
});

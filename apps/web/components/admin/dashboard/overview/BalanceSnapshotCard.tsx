"use client";

import type { AdminDashboardSummary } from "@/dtos/dashboard.dto";
import { LESSON_PLAN_LABEL } from "@/lib/staff.constants";
import { AmountRowButton, DashboardPanel } from "./DashboardPanel";
import { formatCurrency } from "./format";

type PendingBreakdown = AdminDashboardSummary["pendingPayrollBreakdown"];

/** Breakdown field → `sources[].key` của financial-detail "pending-payroll". */
const PENDING_CHIPS: { field: keyof PendingBreakdown; sourceKey: string; label: string; lessonOnly?: boolean }[] = [
  { field: "sessionAmount", sourceKey: "pending-session", label: "Gia sư" },
  { field: "lessonAmount", sourceKey: "pending-lesson", label: LESSON_PLAN_LABEL, lessonOnly: true },
  { field: "customerCareAmount", sourceKey: "pending-customer-care", label: "SALE&CSKH" },
  { field: "bonusAmount", sourceKey: "pending-bonus", label: "Thưởng" },
  { field: "extraAllowanceAmount", sourceKey: "pending-extra", label: "Trợ cấp khác" },
  { field: "fixedSalaryAmount", sourceKey: "pending-fixed-salary", label: "Lương cứng" },
  { field: "assistantAmount", sourceKey: "pending-assistant", label: "Trợ lí" },
  { field: "trainingManagerAmount", sourceKey: "pending-training-manager", label: "QL lớp" },
];

export function BalanceSnapshotCard({
  summary,
  giftedLessonPlanEnabled,
  onOpenPrepaid,
  onOpenUncollected,
  onOpenPendingPayroll,
}: {
  summary: AdminDashboardSummary;
  giftedLessonPlanEnabled: boolean;
  onOpenPrepaid: () => void;
  onOpenUncollected: () => void;
  onOpenPendingPayroll: (sourceKeys?: string[]) => void;
}) {
  const breakdown = summary.pendingPayrollBreakdown;
  const chips = PENDING_CHIPS.filter(
    (chip) => (giftedLessonPlanEnabled || !chip.lessonOnly) && (breakdown?.[chip.field] ?? 0) !== 0,
  );

  return (
    <DashboardPanel title="Số dư & công nợ" description="Snapshot hiện tại, không lọc theo kỳ">
      <div className="flex flex-col gap-1">
        <AmountRowButton
          label="Học phí chưa dạy (ví dương)"
          value={formatCurrency(summary.prepaidTuitionTotal)}
          note="Tiền đã nạp, chưa học hết"
          onClick={onOpenPrepaid}
        />
        <AmountRowButton
          label="Học phí chưa thu (ví âm)"
          value={formatCurrency(summary.pendingCollectionTotal)}
          tone={summary.pendingCollectionTotal > 0 ? "negative" : "default"}
          note={`${summary.debtStudentsCount} học sinh đang nợ`}
          onClick={onOpenUncollected}
        />
        <AmountRowButton
          label="Trợ cấp chờ thanh toán"
          value={formatCurrency(summary.pendingPayrollTotal)}
          note={`${summary.unpaidStaffCount} nhân sự · mọi khoản pending/unpaid`}
          onClick={() => onOpenPendingPayroll()}
        />
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-1">
          {chips.map((chip) => (
            <button
              key={chip.sourceKey}
              type="button"
              onClick={() => onOpenPendingPayroll([chip.sourceKey])}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border-default bg-bg-secondary/40 px-2.5 text-xs text-text-secondary transition-colors hover:border-primary/30 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {chip.label}
              <span className="font-semibold tabular-nums text-text-primary">
                {formatCurrency(breakdown[chip.field] ?? 0)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </DashboardPanel>
  );
}

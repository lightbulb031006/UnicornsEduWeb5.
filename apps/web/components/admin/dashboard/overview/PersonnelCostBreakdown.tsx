"use client";

import type { AdminDashboardBreakdownItem, AdminDashboardBreakdownKey } from "@/dtos/dashboard.dto";
import { DashboardPanel } from "./DashboardPanel";
import { formatCurrency, formatMillions, formatShare } from "./format";
import { DASHBOARD_PERIOD_WIDE_SPAN } from "./layout";
import { SharePieChart } from "./SharePieChart";

/** Breakdown key → `sources[].key` của financial-detail "personnel-cost". Bonus = thưởng + phạt. */
export const PERSONNEL_SOURCE_KEYS: Partial<Record<AdminDashboardBreakdownKey, string[]>> = {
  teacherCost: ["teacher-cost"],
  customerCareCost: ["customer-care-cost"],
  lessonCost: ["lesson-cost"],
  bonusCost: ["bonus-reward-cost", "bonus-penalty-cost"],
  extraAllowanceCost: ["extra-allowance-cost"],
  fixedSalaryCost: ["fixed-salary-cost"],
  assistantCost: ["assistant-cost"],
  trainingManagerCost: ["training-manager-cost"],
};

/** Màu cố định theo khoản, khớp chart "Chi phí theo từng khoản" ở trang Thống kê năm. */
const PERSONNEL_COLORS: Partial<Record<AdminDashboardBreakdownKey, string>> = {
  teacherCost: "var(--ue-viz-1)",
  customerCareCost: "var(--ue-viz-2)",
  lessonCost: "var(--ue-viz-3)",
  bonusCost: "var(--ue-viz-4)",
  extraAllowanceCost: "var(--ue-viz-5)",
  fixedSalaryCost: "var(--ue-viz-9)",
  assistantCost: "var(--ue-viz-6)",
  trainingManagerCost: "var(--ue-viz-7)",
};

const colorOf = (key: AdminDashboardBreakdownKey) => PERSONNEL_COLORS[key] ?? "var(--ue-primary)";

export function getPersonnelBreakdownItems(breakdown: AdminDashboardBreakdownItem[]) {
  return breakdown.filter((item) => item.kind === "expense" && PERSONNEL_SOURCE_KEYS[item.key] != null);
}

export function PersonnelCostBreakdown({
  items,
  total,
  dimmed,
  onOpenTotal,
  onOpenItem,
}: {
  items: AdminDashboardBreakdownItem[];
  total: number;
  dimmed?: boolean;
  onOpenTotal: () => void;
  onOpenItem: (item: AdminDashboardBreakdownItem) => void;
}) {
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  // Độ dài thanh = tỉ trọng trên tổng chi phí nhân sự, khớp với % hiển thị bên phải.
  const sharePercent = (amount: number) => (total > 0 ? Math.min(Math.max((amount / total) * 100, 0), 100) : 0);

  return (
    <DashboardPanel
      title="Cơ cấu chi phí nhân sự"
      description="Biểu đồ và thanh = tỉ trọng trên tổng chi phí nhân sự · bấm từng dòng để xem nhân sự đóng góp"
      dimmed={dimmed}
      className={DASHBOARD_PERIOD_WIDE_SPAN}
      action={
        <button
          type="button"
          onClick={onOpenTotal}
          className="rounded-md px-1 text-sm font-bold tabular-nums text-text-primary underline-offset-2 hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          {formatCurrency(total)}
        </button>
      }
    >
      <div className="@container flex flex-1 flex-col justify-center">
        <div className="flex flex-col gap-4 @xl:flex-row @xl:items-center">
          <SharePieChart
            ariaLabel="Biểu đồ tròn cơ cấu chi phí nhân sự"
            slices={sorted.map((item) => ({
              key: item.key,
              label: item.label,
              value: item.amount,
              color: colorOf(item.key),
            }))}
            centerLabel="Tổng"
            centerValue={formatMillions(total)}
            formatValue={formatCurrency}
            onSliceClick={(key) => {
              const item = sorted.find((entry) => entry.key === key);
              if (item) onOpenItem(item);
            }}
          />
          <ul className="@container/list flex min-w-0 flex-1 flex-col gap-1">
            {sorted.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onOpenItem(item)}
                  className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus @md/list:grid-cols-[minmax(0,8.5rem)_minmax(3rem,1fr)_11.5rem]"
                >
                  <span className="text-text-primary">{item.label}</span>
                  <span
                    aria-hidden
                    className="order-last col-span-2 h-2 overflow-hidden rounded-full bg-bg-secondary @md/list:order-none @md/list:col-span-1"
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${sharePercent(item.amount)}%`, backgroundColor: colorOf(item.key) }}
                    />
                  </span>
                  <span className="whitespace-nowrap text-right tabular-nums">
                    <strong className="font-semibold text-text-primary">{formatCurrency(item.amount)}</strong>{" "}
                    <span className="text-text-secondary">· {formatShare(item.amount, total)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </DashboardPanel>
  );
}

"use client";

import type { AdminDashboardCustomerSourceKey, AdminDashboardCustomerSourceRow } from "@/dtos/dashboard.dto";
import { formatVnInteger } from "@/lib/formatters";
import { DashboardPanel } from "./overview/DashboardPanel";
import { formatCurrency, formatMillions, formatPercent } from "./overview/format";
import { SharePieChart } from "./overview/SharePieChart";

/** Màu cố định theo nguồn để không đổi màu khi thứ tự doanh thu thay đổi giữa các kỳ. */
const SOURCE_COLORS: Record<AdminDashboardCustomerSourceKey, string> = {
  tiktok: "var(--ue-viz-1)",
  fanpage_hoc_tin: "var(--ue-viz-2)",
  fanpage_luyen_tin: "var(--ue-viz-3)",
  acquaintance: "var(--ue-viz-4)",
};

export function CustomerSourceSection({
  rows,
  dimmed = false,
  className,
  onOpen,
}: {
  rows: AdminDashboardCustomerSourceRow[];
  dimmed?: boolean;
  className?: string;
  onOpen: (row: AdminDashboardCustomerSourceRow) => void;
}) {
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = sorted.reduce((sum, row) => sum + row.revenue, 0);

  return (
    <DashboardPanel
      title="Nguồn khách mới"
      description="Học sinh mới của kỳ và doanh thu mới theo nguồn trên hồ sơ · bấm để xem danh sách"
      dimmed={dimmed}
      className={className}
    >
      {sorted.length === 0 ? (
        <p className="text-sm text-text-secondary">Chưa có học sinh mới trong kỳ.</p>
      ) : (
        <div className="@container flex flex-1 flex-col justify-center">
          <div className="flex flex-col gap-4 @xl:flex-row @xl:items-center @xl:gap-6">
            <SharePieChart
              ariaLabel="Biểu đồ tròn tỉ trọng doanh thu mới theo nguồn khách"
              slices={sorted.map((row) => ({
                key: row.key,
                label: row.label,
                value: row.revenue,
                color: SOURCE_COLORS[row.key],
              }))}
              centerLabel="Doanh thu mới"
              centerValue={formatMillions(totalRevenue)}
              formatValue={formatCurrency}
              onSliceClick={(key) => {
                const row = sorted.find((entry) => entry.key === key);
                if (row) onOpen(row);
              }}
            />
            <ul className="flex min-w-0 flex-1 flex-col gap-1">
              {sorted.map((row) => (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    aria-label={`Mở chi tiết nguồn ${row.label}`}
                    className="flex min-h-11 w-full flex-col gap-1.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    <span className="flex w-full justify-between gap-2 text-sm">
                      <span className="font-medium text-text-primary">{row.label}</span>
                      <span className="font-bold tabular-nums text-text-primary">{formatPercent(row.sharePercent)}</span>
                    </span>
                    <span aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-bg-secondary">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(Math.max(row.sharePercent, 0), 100)}%`,
                          backgroundColor: SOURCE_COLORS[row.key],
                        }}
                      />
                    </span>
                    <span className="flex w-full justify-between gap-2 text-xs tabular-nums text-text-secondary">
                      <span>{formatVnInteger(row.studentCount)} học sinh</span>
                      <span>{formatCurrency(row.revenue)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </DashboardPanel>
  );
}

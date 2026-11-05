"use client";

import Link from "next/link";
import type { AdminDashboardDto } from "@/dtos/dashboard.dto";
import { formatVnInteger } from "@/lib/formatters";
import { DashboardPanel } from "./DashboardPanel";
import { formatCurrency } from "./format";

export type QuarterMetric = "revenue" | "expense" | "profit";

export type YearRange = { label: string; dateFrom: string; dateTo: string };

/** "Q3" + 2026 → 2026-07-01 … 2026-09-30. */
export function getQuarterRange(quarter: string, year: string): YearRange | null {
  const index = Number(quarter.replace(/\D/g, ""));
  if (!index || index < 1 || index > 4) return null;
  const startMonth = (index - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(Number(year), endMonth, 0).getDate();
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    label: `${quarter}/${year}`,
    dateFrom: `${year}-${pad(startMonth)}-01`,
    dateTo: `${year}-${pad(endMonth)}-${pad(lastDay)}`,
  };
}

export function getYearRange(year: string): YearRange {
  return { label: `năm ${year}`, dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
}

const metricButtonClass =
  "rounded px-1 tabular-nums underline-offset-2 hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";

export function YearQuarterSection({
  year,
  yearlySummary,
  statisticsHref,
  onOpen,
}: {
  year: string;
  yearlySummary: AdminDashboardDto["yearlySummary"];
  statisticsHref: string;
  onOpen: (metric: QuarterMetric, range: YearRange) => void;
}) {
  const totals = yearlySummary.reduce(
    (acc, item) => ({
      revenue: acc.revenue + item.revenue,
      expense: acc.expense + item.expense,
      profit: acc.profit + item.profit,
    }),
    { revenue: 0, expense: 0, profit: 0 },
  );
  const best = yearlySummary.reduce<(typeof yearlySummary)[number] | null>(
    (current, item) => (current == null || item.profit > current.profit ? item : current),
    null,
  );
  const yearRange = getYearRange(year);
  const bestRange = best ? getQuarterRange(best.quarter, year) : null;

  const tiles: { label: string; value: string; onClick?: () => void; tone?: string }[] = [
    { label: "Doanh thu năm", value: formatCurrency(totals.revenue), onClick: () => onOpen("revenue", yearRange) },
    { label: "Chi phí năm", value: formatCurrency(totals.expense), onClick: () => onOpen("expense", yearRange) },
    {
      label: "Lợi nhuận ròng năm",
      value: formatCurrency(totals.profit),
      tone: totals.profit < 0 ? "text-error" : "text-success",
      onClick: () => onOpen("profit", yearRange),
    },
    {
      label: "Quý hiệu quả nhất",
      value: best ? `${best.quarter} · ${formatCurrency(best.profit)}` : "—",
      onClick: bestRange ? () => onOpen("profit", bestRange) : undefined,
    },
  ];

  return (
    <DashboardPanel
      title={`Năm ${year} theo quý`}
      description="Bấm số để xem các khoản đóng góp"
      action={
        <Link href={statisticsHref} className="text-sm font-medium text-primary hover:underline">
          Mở Thống kê năm
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        {tiles.map((tile) => (
          <button
            key={tile.label}
            type="button"
            disabled={!tile.onClick}
            onClick={tile.onClick}
            className="flex min-h-11 flex-col gap-1 rounded-xl bg-bg-secondary/50 px-3 py-3 text-left transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-default"
          >
            <span className="text-xs text-text-secondary">{tile.label}</span>
            <span className={`text-base font-bold tabular-nums sm:text-lg ${tile.tone ?? "text-text-primary"}`}>
              {tile.value}
            </span>
          </button>
        ))}
      </div>

      {yearlySummary.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border-default">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="bg-bg-secondary/40 text-left text-xs text-text-secondary">
                <th scope="col" className="px-3 py-2 font-semibold">Quý</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Lớp</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Doanh thu</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Chi phí</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Lợi nhuận</th>
              </tr>
            </thead>
            <tbody>
              {yearlySummary.map((item) => {
                const range = getQuarterRange(item.quarter, year);
                const cell = (metric: QuarterMetric, value: number, extra = "") =>
                  range ? (
                    <button type="button" onClick={() => onOpen(metric, range)} className={`${metricButtonClass} ${extra}`}>
                      {formatCurrency(value)}
                    </button>
                  ) : (
                    <span className={extra}>{formatCurrency(value)}</span>
                  );
                return (
                  <tr key={item.quarter} className="border-t border-border-default">
                    <th scope="row" className="px-3 py-2 text-left font-semibold text-text-primary">{item.quarter}</th>
                    <td className="px-3 py-2 text-right tabular-nums">{formatVnInteger(item.classes)}</td>
                    <td className="px-3 py-2 text-right">{cell("revenue", item.revenue)}</td>
                    <td className="px-3 py-2 text-right">{cell("expense", item.expense)}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {cell("profit", item.profit, item.profit < 0 ? "text-error" : "text-success")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </DashboardPanel>
  );
}

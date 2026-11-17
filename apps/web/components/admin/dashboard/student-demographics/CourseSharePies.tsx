"use client";

import { useMemo } from "react";
import type { StudentDemographicsCourseBreakdown } from "@/dtos/dashboard.dto";
import { formatVnDong } from "@/lib/formatters";
import { SharePieChart, type SharePieSlice } from "../overview/SharePieChart";

/** 8 slot categorical đầu của design system; khoá thứ 9 trở đi gộp màu "khác" (xám). */
const COURSE_COLORS = Array.from({ length: 8 }, (_, i) => `var(--ue-viz-${i + 1})`);
const OTHER_COLOR = "var(--ue-text-muted)";

const COST_SLICES = [
  { key: "teacher", label: "Gia sư", color: "var(--ue-viz-2)" },
  { key: "trainingManager", label: "QL lớp", color: "var(--ue-viz-4)" },
  { key: "customerCare", label: "CSKH", color: "var(--ue-viz-7)" },
  { key: "profit", label: "Lợi nhuận", color: "var(--ue-viz-3)" },
] as const;

type LegendRow = { key: string; label: string; color: string; value: number; share: number; note?: string };

function compactMoney(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  return `${sign}${abs.toLocaleString("vi-VN")}đ`;
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

/** Học phí (= 100%) tách thành Gia sư / QL lớp / CSKH / Lợi nhuận. */
function buildMarginRows(parts: {
  tuition: number;
  teacher: number;
  trainingManager: number;
  customerCare: number;
  profit: number;
}): LegendRow[] {
  return COST_SLICES.map((s) => {
    const value = parts[s.key];
    return {
      key: s.key,
      label: s.label,
      color: s.color,
      value,
      share: percent(value, parts.tuition),
      note: parts.tuition <= 0 ? "—" : s.key === "profit" && value < 0 ? "Lỗ" : undefined,
    };
  });
}

function toSlices(rows: LegendRow[]): SharePieSlice[] {
  return rows.filter((r) => r.value > 0).map(({ key, label, color, value }) => ({ key, label, color, value }));
}

function LegendList({ rows }: { rows: LegendRow[] }) {
  return (
    <ul className="w-full min-w-0 flex-1 space-y-1.5 text-xs">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center gap-2">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
          <span className="min-w-0 flex-1 truncate text-text-primary">{row.label}</span>
          <span className="shrink-0 tabular-nums text-text-secondary">{compactMoney(row.value)}</span>
          <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-text-primary">
            {row.note ?? `${row.share}%`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PieCard({
  title,
  formula,
  accentColor,
  children,
}: {
  title: string;
  formula: string;
  accentColor?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-xs sm:p-4">
      <header className="mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-text-primary">
          {accentColor ? <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} /> : null}
          {title}
        </h3>
        <p className="text-[11px] text-text-muted">{formula}</p>
      </header>
      <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row sm:items-center">{children}</div>
    </section>
  );
}

/**
 * Donut theo khoá: tỷ trọng doanh thu, tỷ trọng lợi nhuận, biên lợi nhuận chung,
 * rồi biên lợi nhuận của từng khoá (học phí khoá tách Gia sư / QL lớp / CSKH / Lợi nhuận).
 */
export function CourseSharePies({
  courses,
  totalProfit,
}: {
  courses: StudentDemographicsCourseBreakdown[];
  totalProfit: number;
}) {
  // Màu theo thực thể (tên khoá), không theo hạng → đổi kỳ/lọc không đổi màu khoá.
  const colorByKey = useMemo(() => {
    const sorted = [...courses].sort((a, b) => a.courseName.localeCompare(b.courseName, "vi"));
    return new Map(sorted.map((c, i) => [c.key, COURSE_COLORS[i] ?? OTHER_COLOR]));
  }, [courses]);

  const totalRevenue = courses.reduce((sum, c) => sum + c.totalRevenue, 0);

  const revenueRows = useMemo<LegendRow[]>(
    () =>
      courses
        .filter((c) => c.totalRevenue > 0)
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .map((c) => ({
          key: c.key,
          label: c.courseName,
          color: colorByKey.get(c.key) ?? OTHER_COLOR,
          value: c.totalRevenue,
          share: c.revenueShare,
        })),
    [courses, colorByKey],
  );

  const profitRows = useMemo<LegendRow[]>(
    () =>
      courses
        .filter((c) => c.profit !== 0)
        .sort((a, b) => b.profit - a.profit)
        .map((c) => ({
          key: c.key,
          label: c.courseName,
          color: colorByKey.get(c.key) ?? OTHER_COLOR,
          value: c.profit,
          share: c.profitShare,
          note: c.profit < 0 ? "Lỗ" : undefined,
        })),
    [courses, colorByKey],
  );
  const hasLoss = profitRows.some((r) => r.value < 0);

  const totals = useMemo(
    () =>
      courses.reduce(
        (acc, c) => ({
          tuition: acc.tuition + c.profitRevenue,
          teacher: acc.teacher + c.teacherCost,
          trainingManager: acc.trainingManager + c.trainingManagerCost,
          customerCare: acc.customerCare + c.customerCareCost,
        }),
        { tuition: 0, teacher: 0, trainingManager: 0, customerCare: 0 },
      ),
    [courses],
  );
  const overallMarginRows = buildMarginRows({ ...totals, profit: totalProfit });

  const marginCourses = useMemo(
    () =>
      courses
        .filter((c) => c.profitRevenue > 0 || c.totalCost > 0)
        .sort((a, b) => b.profitRevenue - a.profitRevenue),
    [courses],
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <PieCard title="Tỷ trọng doanh thu" formula="Doanh thu khoá / tổng doanh thu tất cả khoá">
          <SharePieChart
            ariaLabel="Biểu đồ tròn tỷ trọng doanh thu theo khoá"
            slices={toSlices(revenueRows)}
            centerLabel="Tổng DT"
            centerValue={compactMoney(totalRevenue)}
            formatValue={formatVnDong}
          />
          <LegendList rows={revenueRows} />
        </PieCard>

        <PieCard title="Tỷ trọng lợi nhuận" formula="Lợi nhuận khoá / tổng lợi nhuận tất cả khoá">
          <SharePieChart
            ariaLabel="Biểu đồ tròn tỷ trọng lợi nhuận theo khoá"
            slices={toSlices(profitRows)}
            centerLabel="Tổng LN"
            centerValue={compactMoney(totalProfit)}
            formatValue={formatVnDong}
          />
          <div className="w-full min-w-0 flex-1">
            <LegendList rows={profitRows} />
            {hasLoss ? (
              <p className="mt-2 text-[11px] text-text-muted">Khoá lỗ không vẽ trên biểu đồ nhưng vẫn trừ vào tổng LN.</p>
            ) : null}
          </div>
        </PieCard>

        <PieCard title="Biên lợi nhuận chung" formula="Tổng lợi nhuận / tổng học phí (học phí = 100%)">
          <SharePieChart
            ariaLabel="Biểu đồ tròn cơ cấu học phí toàn bộ khoá"
            slices={toSlices(overallMarginRows)}
            centerLabel="Biên LN"
            centerValue={`${percent(totalProfit, totals.tuition)}%`}
            formatValue={formatVnDong}
          />
          <LegendList rows={overallMarginRows} />
        </PieCard>
      </div>

      {marginCourses.length > 0 ? (
        <section className="space-y-2">
          <header>
            <h3 className="text-sm font-bold text-text-primary">Biên lợi nhuận từng khoá</h3>
            <p className="text-[11px] text-text-muted">
              Lợi nhuận khoá / doanh thu (học phí) của chính khoá đó — học phí khoá = 100%.
            </p>
          </header>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
            {marginCourses.map((c) => {
              const rows = buildMarginRows({
                tuition: c.profitRevenue,
                teacher: c.teacherCost,
                trainingManager: c.trainingManagerCost,
                customerCare: c.customerCareCost,
                profit: c.profit,
              });
              return (
                <PieCard
                  key={c.key}
                  title={c.courseName}
                  accentColor={colorByKey.get(c.key) ?? OTHER_COLOR}
                  formula={`Học phí ${compactMoney(c.profitRevenue)} = 100%`}
                >
                  <SharePieChart
                    ariaLabel={`Biểu đồ tròn biên lợi nhuận khoá ${c.courseName}`}
                    slices={toSlices(rows)}
                    centerLabel="Biên LN"
                    centerValue={c.profitRevenue > 0 ? `${c.profitMargin}%` : "—"}
                    formatValue={formatVnDong}
                  />
                  <LegendList rows={rows} />
                </PieCard>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

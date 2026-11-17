"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatVnDong } from "@/lib/formatters";

export interface BirthYearBarDatum {
  birthYear: number | null;
  studentCount: number;
  percentage: number;
  totalRevenue: number;
}

const chartConfig = {
  studentCount: { label: "Học sinh", color: "var(--ue-viz-1)" },
} satisfies ChartConfig;

type ChartRow = BirthYearBarDatum & { yearLabel: string; age: number };

function BirthYearTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-text-primary">
        Sinh năm {row.yearLabel} · {row.age} tuổi
      </p>
      <p className="mt-1 tabular-nums text-text-secondary">
        {row.studentCount} học sinh ({row.percentage}%)
      </p>
      <p className="tabular-nums text-text-secondary">Doanh thu: {formatVnDong(row.totalRevenue)}</p>
    </div>
  );
}

/**
 * Cột số học sinh theo năm sinh (một chuỗi → một màu, nhãn số trực tiếp, hover tooltip).
 * Học sinh chưa có năm sinh không vẽ, hiển thị ở dòng chú thích.
 */
export function BirthYearBarChart({
  data,
  currentYear,
  missingCount = 0,
  className,
}: {
  data: BirthYearBarDatum[];
  currentYear: number;
  missingCount?: number;
  className?: string;
}) {
  const rows: ChartRow[] = data
    .filter((d): d is BirthYearBarDatum & { birthYear: number } => d.birthYear != null)
    .map((d) => ({ ...d, yearLabel: String(d.birthYear), age: currentYear - d.birthYear }));

  if (rows.length === 0) {
    return (
      <p className="rounded-lg bg-bg-secondary/40 px-3 py-6 text-center text-xs text-text-muted">
        Chưa có học sinh nào cập nhật năm sinh.
      </p>
    );
  }

  return (
    <figure className={className}>
      <ChartContainer config={chartConfig} className="aspect-auto h-44 w-full sm:h-52">
        <BarChart data={rows} margin={{ top: 18, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="yearLabel"
            tickLine={false}
            axisLine={false}
            interval={0}
            height={34}
            tick={({ x, y, payload, index }) => (
              <g transform={`translate(${x},${y})`}>
                <text dy={10} textAnchor="middle" fontSize={11} fontWeight={600} className="fill-[var(--ue-text-secondary)]">
                  {payload.value}
                </text>
                <text dy={23} textAnchor="middle" fontSize={10} className="fill-[var(--ue-text-muted)]">
                  {rows[index]?.age}t
                </text>
              </g>
            )}
          />
          <YAxis hide allowDecimals={false} />
          <ChartTooltip cursor={{ fill: "var(--ue-bg-secondary)" }} content={<BirthYearTooltip />} />
          <Bar dataKey="studentCount" fill="var(--color-studentCount)" radius={[4, 4, 0, 0]} maxBarSize={40}>
            <LabelList
              dataKey="studentCount"
              position="top"
              offset={4}
              className="fill-[var(--ue-text-primary)]"
              fontSize={11}
              fontWeight={700}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
      {missingCount > 0 ? (
        <figcaption className="mt-1 text-[11px] text-text-muted">
          + {missingCount} học sinh chưa cập nhật năm sinh (không vẽ trên biểu đồ).
        </figcaption>
      ) : null}
    </figure>
  );
}

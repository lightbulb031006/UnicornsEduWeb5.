"use client";

import type { ReactNode } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";

export type SharePieSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

const SIZE = 168;

/**
 * Donut tỉ trọng dùng chung cho các khối dashboard. Màu slice do caller truyền vào để khớp
 * với thanh tỉ trọng trong danh sách bên cạnh (danh sách đóng vai trò legend).
 */
export function SharePieChart({
  slices,
  ariaLabel,
  centerLabel,
  centerValue,
  formatValue,
  onSliceClick,
}: {
  slices: SharePieSlice[];
  ariaLabel: string;
  centerLabel?: ReactNode;
  centerValue?: ReactNode;
  formatValue: (value: number) => string;
  onSliceClick?: (key: string) => void;
}) {
  const visible = slices.filter((slice) => slice.value > 0);
  const isEmpty = visible.length === 0;

  return (
    <div className="relative mx-auto shrink-0" style={{ width: SIZE, height: SIZE }} role="img" aria-label={ariaLabel}>
      <PieChart width={SIZE} height={SIZE}>
        {isEmpty ? (
          <Pie
            data={[{ key: "empty", value: 1 }]}
            dataKey="value"
            innerRadius={56}
            outerRadius={80}
            fill="var(--ue-bg-secondary)"
            stroke="none"
            isAnimationActive={false}
          />
        ) : (
          <Pie
            data={visible}
            dataKey="value"
            nameKey="label"
            innerRadius={56}
            outerRadius={80}
            paddingAngle={visible.length > 1 ? 1.5 : 0}
            stroke="var(--ue-bg-surface)"
            strokeWidth={1}
            onClick={onSliceClick ? (_, index) => onSliceClick(visible[index].key) : undefined}
            className={onSliceClick ? "cursor-pointer" : undefined}
          >
            {visible.map((slice) => (
              <Cell key={slice.key} fill={slice.color} />
            ))}
          </Pie>
        )}
        {isEmpty ? null : (
          <Tooltip
            // Neo cố định ở tâm donut (thay vì chạy theo chuột); nội dung tự dịch -50% để căn giữa.
            position={{ x: SIZE / 2, y: SIZE / 2 }}
            allowEscapeViewBox={{ x: true, y: true }}
            isAnimationActive={false}
            // Chữ tổng ở giữa là overlay absolute render sau chart, phải nằm dưới tooltip.
            wrapperStyle={{ zIndex: 10, pointerEvents: "none" }}
            content={({ active, payload }) => {
              const entry = payload?.[0];
              if (!active || !entry) return null;
              const slice = entry.payload as SharePieSlice;
              return (
                <div className="w-max max-w-48 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-center text-xs shadow-md">
                  <span className="flex items-center justify-center gap-1.5 text-text-secondary">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                    {slice.label}
                  </span>
                  <span className="mt-0.5 block font-bold tabular-nums text-text-primary">{formatValue(slice.value)}</span>
                </div>
              );
            }}
          />
        )}
      </PieChart>
      {centerValue != null ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerLabel ? <span className="text-xs text-text-secondary">{centerLabel}</span> : null}
          <span className="max-w-24 text-sm font-bold tabular-nums leading-tight text-text-primary">{centerValue}</span>
        </div>
      ) : null}
    </div>
  );
}

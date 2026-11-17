"use client";

import type { StudentDemographicsMatrixColumn } from "@/dtos/dashboard.dto";
import { formatVnInteger } from "@/lib/formatters";

export type DemographicsMatrixMode = "count" | "revenue";

export interface DemographicsMatrixRow {
  key: string;
  label: string;
  totalStudents: number;
  totalTopup: number;
  totalRevenue: number;
  cells: Record<string, number>;
  revenueCells: Record<string, number>;
}

/** Ma trận nhóm (tỉnh / năm sinh) × khoá, hiển thị số học sinh hoặc doanh thu. */
export function DemographicsMatrixTable({
  firstHeader,
  columns,
  rows,
  mode,
  emptyText,
}: {
  firstHeader: string;
  columns: StudentDemographicsMatrixColumn[];
  rows: DemographicsMatrixRow[];
  mode: DemographicsMatrixMode;
  emptyText: string;
}) {
  const visibleColumns =
    mode === "revenue"
      ? columns.filter((c) => rows.some((r) => (r.revenueCells[c.key] ?? 0) > 0))
      : columns;
  const pick = (row: DemographicsMatrixRow, key: string) =>
    mode === "revenue" ? (row.revenueCells[key] ?? 0) : (row.cells[key] ?? 0);
  const total = (fn: (r: DemographicsMatrixRow) => number) => rows.reduce((s, r) => s + fn(r), 0);

  return (
    <div className="max-h-[70vh] overflow-auto rounded-xl border border-border-default bg-bg-surface">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 border-b border-border-default bg-bg-secondary text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          <tr>
            <th className="px-3 py-2.5">{firstHeader}</th>
            <th className="px-3 py-2.5 text-right text-text-primary">Tổng HS</th>
            <th className="px-3 py-2.5 text-right text-text-primary">Doanh thu</th>
            <th className="px-3 py-2.5 text-right">Tổng nạp</th>
            {visibleColumns.map((col) => (
              <th key={col.key} className="whitespace-nowrap px-3 py-2.5 text-right">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-default bg-bg-surface">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={visibleColumns.length + 4} className="px-3 py-8 text-center text-text-muted">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.key} className="hover:bg-bg-secondary/25">
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-text-primary">{row.label}</td>
                <td className="bg-bg-secondary/15 px-3 py-2 text-right font-bold tabular-nums text-text-primary">
                  {formatVnInteger(row.totalStudents)}
                </td>
                <td className="bg-bg-secondary/15 px-3 py-2 text-right font-bold tabular-nums text-text-primary">
                  {formatVnInteger(row.totalRevenue)}
                </td>
                <td className="bg-bg-secondary/15 px-3 py-2 text-right tabular-nums text-text-secondary">
                  {formatVnInteger(row.totalTopup)}
                </td>
                {visibleColumns.map((col) => {
                  const val = pick(row, col.key);
                  return (
                    <td
                      key={col.key}
                      className={`px-3 py-2 text-right tabular-nums ${
                        val > 0 ? "bg-primary/5 font-semibold text-text-primary" : "text-text-muted/60"
                      }`}
                    >
                      {val > 0 ? formatVnInteger(val) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 ? (
          <tfoot className="sticky bottom-0 bg-bg-secondary text-xs font-bold text-text-primary">
            <tr>
              <td className="px-3 py-2">Tổng cộng</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatVnInteger(total((r) => r.totalStudents))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatVnInteger(total((r) => r.totalRevenue))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatVnInteger(total((r) => r.totalTopup))}</td>
              {visibleColumns.map((col) => (
                <td key={col.key} className="px-3 py-2 text-right tabular-nums">
                  {formatVnInteger(total((r) => pick(r, col.key)))}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

import type { MonthlyReportMatrixCell, MonthlyReportNewStudent } from "@/dtos/dashboard.dto";
import {
  STUDENT_CUSTOMER_SOURCE_LABELS,
  STUDENT_CUSTOMER_SOURCES,
  type StudentCustomerSource,
} from "@/dtos/student.dto";
import { formatVnInteger } from "@/lib/formatters";

/** Cột «không có» trong ma trận: chưa xếp lớp. */
export const MONTHLY_REPORT_NONE_KEY = "__none__";
export const MONTHLY_REPORT_UNPLACED_LABEL = "Chưa xếp lớp";

export function formatCustomerSourceKey(source: StudentCustomerSource): string {
  return STUDENT_CUSTOMER_SOURCE_LABELS[source];
}

/** «12,5 tr» cho số tiền lớn; dưới 1 triệu hiện đủ số. */
export function formatMillions(value: number): string {
  if (Math.abs(value) < 1_000_000) return `${formatVnInteger(value)} đ`;
  return `${(value / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
}

export function formatSignedCount(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

/** «2 cũ · 1 thử» cho số nghỉ sớm; `null` khi không có ai nghỉ sớm. */
export function formatEarlyDropBreakdown(total: number, oldCount: number): string | null {
  if (total <= 0) return null;
  return `${oldCount} cũ · ${total - oldCount} thử`;
}

export type MonthlyReportMatrixTotals = {
  newCount: number;
  earlyDropCount: number;
  earlyDropOldCount: number;
  earningCount: number;
  revenue: number;
};

export type MonthlyReportMatrixView = {
  /** Thứ tự cột: id khoá, cuối cùng là `MONTHLY_REPORT_NONE_KEY` nếu có học sinh chưa xếp lớp. */
  columnKeys: string[];
  /** Thứ tự hàng theo enum nguồn khách, chỉ nguồn có học sinh. */
  rowKeys: string[];
  cell: (rowKey: string, columnKey: string) => MonthlyReportMatrixTotals;
  rowTotal: (rowKey: string) => MonthlyReportMatrixTotals;
  columnTotal: (columnKey: string) => MonthlyReportMatrixTotals;
  grandTotal: MonthlyReportMatrixTotals;
  /** Ô doanh thu lớn nhất, dùng chuẩn hoá heatmap. */
  maxCellRevenue: number;
};

const EMPTY_TOTALS: MonthlyReportMatrixTotals = {
  newCount: 0,
  earlyDropCount: 0,
  earlyDropOldCount: 0,
  earningCount: 0,
  revenue: 0,
};

function addTotals(
  a: MonthlyReportMatrixTotals,
  b: MonthlyReportMatrixTotals,
): MonthlyReportMatrixTotals {
  return {
    newCount: a.newCount + b.newCount,
    earlyDropCount: a.earlyDropCount + b.earlyDropCount,
    earlyDropOldCount: a.earlyDropOldCount + b.earlyDropOldCount,
    earningCount: a.earningCount + b.earningCount,
    revenue: a.revenue + b.revenue,
  };
}

/** Dựng ma trận Nguồn khách × Khoá học từ danh sách ô thưa của API. */
export function buildMonthlyReportMatrix(
  cells: MonthlyReportMatrixCell[],
  courseIds: string[],
): MonthlyReportMatrixView {
  const byKey = new Map<string, MonthlyReportMatrixTotals>();
  const rowSet = new Set<string>();
  let hasUnplaced = false;
  for (const cell of cells) {
    const rowKey = cell.customerSource;
    const columnKey = cell.courseId ?? MONTHLY_REPORT_NONE_KEY;
    if (columnKey === MONTHLY_REPORT_NONE_KEY) hasUnplaced = true;
    rowSet.add(rowKey);
    const key = `${rowKey}|${columnKey}`;
    byKey.set(key, addTotals(byKey.get(key) ?? EMPTY_TOTALS, cell));
  }

  const columnKeys = hasUnplaced ? [...courseIds, MONTHLY_REPORT_NONE_KEY] : [...courseIds];
  const rowKeys = STUDENT_CUSTOMER_SOURCES.filter((source) => rowSet.has(source));
  const cell = (rowKey: string, columnKey: string) =>
    byKey.get(`${rowKey}|${columnKey}`) ?? EMPTY_TOTALS;
  const rowTotal = (rowKey: string) =>
    columnKeys.reduce((total, columnKey) => addTotals(total, cell(rowKey, columnKey)), EMPTY_TOTALS);
  const columnTotal = (columnKey: string) =>
    rowKeys.reduce((total, rowKey) => addTotals(total, cell(rowKey, columnKey)), EMPTY_TOTALS);

  return {
    columnKeys,
    rowKeys,
    cell,
    rowTotal,
    columnTotal,
    grandTotal: rowKeys.reduce((total, rowKey) => addTotals(total, rowTotal(rowKey)), EMPTY_TOTALS),
    maxCellRevenue: Math.max(0, ...[...byKey.values()].map((totals) => totals.revenue)),
  };
}

/**
 * Số học sinh mới có doanh thu > 0 trong tháng (đếm không trùng dù học nhiều
 * khoá); `source` lọc theo một nguồn khách. Mẫu số TB/HS của heatmap doanh thu.
 */
export function countEarningNewStudents(
  students: MonthlyReportNewStudent[],
  source?: StudentCustomerSource,
): number {
  return students.filter(
    (student) => student.revenueInMonth > 0 && (source == null || student.customerSource === source),
  ).length;
}

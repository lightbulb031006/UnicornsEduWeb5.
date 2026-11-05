import { formatVnInteger } from "@/lib/formatters";

export function formatCurrency(value: number) {
  return `${formatVnInteger(value)} đ`;
}

/** 386_200_000 → "386,2 tr" — dùng cho KPI / trục biểu đồ. */
export function formatMillions(value: number) {
  return `${(value / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
}

export function formatPercent(value: number) {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

export function formatShare(part: number, total: number) {
  if (!total) return "—";
  return formatPercent((part / total) * 100);
}

export function getErrorMessage(error: unknown, fallback = "Không thể tải dữ liệu dashboard.") {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message === "string"
  ) {
    return (error as { response?: { data?: { message?: string } } }).response?.data?.message as string;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

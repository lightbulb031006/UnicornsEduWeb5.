import type { StaffFixedSalaryRoleRow } from "@/dtos/fixed-salary-settings.dto";
import { parseMoneyInput } from "@/lib/money-input.helpers";

export const fixedSalaryInputClassName =
  "min-h-11 w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary tabular-nums focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10";

export function getFixedSalaryApiErrorMessage(
  error: unknown,
  fallbackMessage: string,
) {
  const message = (
    error as { response?: { data?: { message?: string | string[] } } }
  )?.response?.data?.message;

  if (Array.isArray(message) && message.length > 0) {
    return message.join(", ");
  }

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

export function formatFixedSalaryVnd(value: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(value)}đ`;
}

export const LOCKED_FIXED_SALARY_MONTH_NOTE =
  "Lương các tháng đã chốt không thay đổi.";

export type DisabledRoleOverrideWarning = {
  roleType: string;
  roleLabel: string;
  hasAmountOverride: boolean;
  hasRateOverride: boolean;
  amountOverride: number | null;
  operatingRateOverride: number | null;
};

export function collectDisabledRoleOverrideWarnings(params: {
  originalRoles: readonly string[];
  nextRoles: Iterable<string>;
  roleRows: StaffFixedSalaryRoleRow[] | undefined;
  roleLabels: Record<string, string>;
}): DisabledRoleOverrideWarning[] {
  const nextRoles = new Set(params.nextRoles);
  const byRole = new Map(
    (params.roleRows ?? []).map((row) => [row.roleType, row]),
  );
  const warnings: DisabledRoleOverrideWarning[] = [];

  for (const role of params.originalRoles) {
    if (nextRoles.has(role)) {
      continue;
    }

    const row = byRole.get(role as StaffFixedSalaryRoleRow["roleType"]);
    const hasAmountOverride = Boolean(row?.amount.hasOverride);
    const hasRateOverride = Boolean(row?.operatingRate.hasOverride);
    if (!hasAmountOverride && !hasRateOverride) {
      continue;
    }

    warnings.push({
      roleType: role,
      roleLabel: params.roleLabels[role] ?? role,
      hasAmountOverride,
      hasRateOverride,
      amountOverride: hasAmountOverride ? (row?.amount.overrideValue ?? null) : null,
      operatingRateOverride: hasRateOverride
        ? (row?.operatingRate.overrideValue ?? null)
        : null,
    });
  }

  return warnings;
}

function formatOverrideAmount(warning: DisabledRoleOverrideWarning): string {
  if (!warning.hasAmountOverride) {
    return "không có mức đè";
  }
  return formatFixedSalaryVnd(warning.amountOverride ?? 0);
}

function formatOverrideRate(warning: DisabledRoleOverrideWarning): string {
  if (!warning.hasRateOverride) {
    return "không có mức đè";
  }
  return `${warning.operatingRateOverride ?? 0}%`;
}

export function formatDisabledRoleOverrideWarningLine(
  warning: DisabledRoleOverrideWarning,
): string {
  return `Tắt vai trò ${warning.roleLabel} sẽ xóa mức đè lương cứng ${formatOverrideAmount(warning)} và % vận hành ${formatOverrideRate(warning)}.`;
}

/** Empty → null (use role default). `0` is kept as an intentional exclusion. */
export function parseOptionalFixedSalaryAmountInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (/-/.test(trimmed)) {
    throw new Error("Số tiền lương cứng không được âm.");
  }

  const parsed = parseMoneyInput(trimmed);
  if (parsed == null || parsed < 0) {
    throw new Error("Số tiền lương cứng không hợp lệ.");
  }

  return parsed;
}

/** Empty → null (use role default). `0` is kept as an intentional 0%. */
export function parseOptionalFixedSalaryOperatingRateInput(
  raw: string,
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const numericValue = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100) {
    throw new Error("% khấu trừ vận hành lương cứng phải nằm trong khoảng 0–100.");
  }

  return Number(numericValue.toFixed(2));
}

export type RolePolicySaveAxisResult =
  | { status: "saved" }
  | { status: "failed"; message: string };

export function buildRolePolicySaveFeedback(
  amount: RolePolicySaveAxisResult,
  rate: RolePolicySaveAxisResult,
): { type: "success" | "error"; message: string } {
  if (amount.status === "saved" && rate.status === "saved") {
    return {
      type: "success",
      message: "Đã lưu mức lương và % vận hành.",
    };
  }

  if (amount.status === "saved" && rate.status === "failed") {
    return {
      type: "error",
      message: `Đã lưu mức lương. Chưa lưu được % vận hành: ${rate.message}`,
    };
  }

  if (amount.status === "failed" && rate.status === "saved") {
    return {
      type: "error",
      message: `Đã lưu % vận hành. Chưa lưu được mức lương: ${amount.message}`,
    };
  }

  const amountMessage =
    amount.status === "failed" ? amount.message : "lỗi không xác định";
  const rateMessage =
    rate.status === "failed" ? rate.message : "lỗi không xác định";
  return {
    type: "error",
    message: `Chưa lưu được mức lương (${amountMessage}) và % vận hành (${rateMessage}).`,
  };
}

/** VND integer money fields: display uses vi-VN thousand separators (e.g. 14.000). */

export function sanitizeMoneyInputDigits(
  raw: string,
  allowNegative = false,
): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const negative = allowNegative && trimmed.startsWith("-");
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (!digitsOnly) {
    return negative ? "-" : "";
  }

  return negative ? `-${digitsOnly}` : digitsOnly;
}

export function formatMoneyInputDigits(sanitized: string): string {
  if (!sanitized) return "";
  if (sanitized === "-") return "-";

  const negative = sanitized.startsWith("-");
  const digits = negative ? sanitized.slice(1) : sanitized;
  if (!digits) return negative ? "-" : "";

  const formatted = new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(Number(digits));

  return negative ? `-${formatted}` : formatted;
}

export function formatMoneyInputFromUserRaw(
  raw: string,
  allowNegative = false,
): string {
  return formatMoneyInputDigits(sanitizeMoneyInputDigits(raw, allowNegative));
}

export function moneyInputInitialFromNumber(
  value: number | null | undefined,
  allowNegative = false,
): string {
  if (value == null || Number.isNaN(value)) return "";
  const truncated = Math.trunc(value);
  if (!allowNegative && truncated < 0) return "";
  if (truncated === 0) return "0";
  return formatMoneyInputDigits(String(truncated));
}

export function parseMoneyInput(
  value: string,
  options?: { allowNegative?: boolean },
): number | null {
  const allowNegative = options?.allowNegative ?? false;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") return null;
  if (!allowNegative && /-/.test(trimmed)) return null;

  const sanitized = sanitizeMoneyInputDigits(trimmed, allowNegative);
  if (!sanitized || sanitized === "-") return null;

  const negative = sanitized.startsWith("-");
  const digits = negative ? sanitized.slice(1) : sanitized;
  if (!digits) return null;

  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;

  const result = negative ? -parsed : parsed;
  if (!allowNegative && result < 0) return null;
  return Math.trunc(result);
}

export function parseOptionalMoneyInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = parseMoneyInput(trimmed);
  if (parsed == null || parsed < 0) return undefined;
  return parsed;
}

export function normalizeMoneyValue(
  value: number | string | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.trunc(value);
  }
  return parseMoneyInput(value);
}

export function isNonNegativeMoneyInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/-/.test(trimmed)) return false;
  const parsed = parseMoneyInput(trimmed);
  return parsed != null && parsed >= 0;
}

export function isSignedMoneyInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") return false;
  return parseMoneyInput(trimmed, { allowNegative: true }) != null;
}

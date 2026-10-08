/**
 * Ô trống khi rời ô:
 * - `empty-string`: lưu chuỗi rỗng (xoá giá trị).
 * - `null`: lưu `null` (API nhận null để xoá, ví dụ email phụ huynh).
 * - `keep`: không cho xoá, trả ô về giá trị đã lưu (trường bắt buộc / API từ chối chuỗi rỗng).
 */
export type BlurSaveEmptyPolicy = "empty-string" | "null" | "keep";

export type BlurSaveDecision =
  | { kind: "skip" }
  | { kind: "revert" }
  | { kind: "save"; value: string | null };

/** Giá trị đã lưu dạng chuỗi để so với giá trị trong ô. */
export function toBlurSaveText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** `YYYY-MM-DD` cho ô ngày từ ISO đã lưu; rỗng nếu không có hoặc không hợp lệ. */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * Quyết định khi rời ô: không đổi thì bỏ qua (không gọi API), xoá trắng thì theo
 * `emptyPolicy`, còn lại lưu giá trị đã trim.
 */
export function resolveBlurSave(
  saved: string | number | null | undefined,
  raw: string,
  emptyPolicy: BlurSaveEmptyPolicy = "empty-string",
): BlurSaveDecision {
  const next = raw.trim();
  if (next === toBlurSaveText(saved)) return { kind: "skip" };
  if (next) return { kind: "save", value: next };
  if (emptyPolicy === "keep") return { kind: "revert" };
  return { kind: "save", value: emptyPolicy === "null" ? null : "" };
}

/** Năm sinh phải là số nguyên trong [1900, `currentYear`]; trả thông báo lỗi hoặc `null`. */
export function validateBirthYear(
  raw: string,
  currentYear: number,
): string | null {
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1900 || year > currentYear) {
    return `Năm sinh phải là số nguyên từ 1900 đến ${currentYear}.`;
  }
  return null;
}

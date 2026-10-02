/**
 * Formatter tập trung cho toàn bộ `apps/web`.
 *
 * Hai lý do tồn tại:
 *
 * 1. **Hiệu năng** — `new Intl.DateTimeFormat()` / `new Intl.NumberFormat()` là
 *    thao tác đắt (load locale data, build pattern). Khởi tạo lại trong thân
 *    hàm format nghĩa là mỗi cell của bảng, mỗi lần render đều dựng lại
 *    formatter. Ở đây chúng được tạo **một lần ở module scope** và tái sử dụng.
 *
 * 2. **Hydration** — nếu không truyền `timeZone`, Node (server) dùng timezone
 *    của máy chủ còn browser dùng timezone của người dùng → cùng một giá trị ra
 *    hai chuỗi khác nhau → hydration mismatch. Mọi formatter ngày/giờ dưới đây
 *    ghim cứng `Asia/Ho_Chi_Minh` để server và client luôn khớp.
 */

export const VN_LOCALE = "vi-VN";
export const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

export type DateLike = Date | string | number | null | undefined;

/** Chuẩn hoá input về `Date` hợp lệ, trả `null` nếu không parse được. */
export function toValidDate(value: DateLike): Date | null {
  if (value === null || value === undefined || value === "") return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// --- Date & time formatters (hoisted) ---------------------------------------

/** 31/12/2026 */
const dateFormatter = new Intl.DateTimeFormat(VN_LOCALE, {
  timeZone: VN_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** 31/12 */
const dayMonthFormatter = new Intl.DateTimeFormat(VN_LOCALE, {
  timeZone: VN_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
});

/** 09:05 */
const timeFormatter = new Intl.DateTimeFormat(VN_LOCALE, {
  timeZone: VN_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 09:05 31/12/2026 */
const dateTimeFormatter = new Intl.DateTimeFormat(VN_LOCALE, {
  timeZone: VN_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** 31/12 09:05 */
const dayMonthTimeFormatter = new Intl.DateTimeFormat(VN_LOCALE, {
  timeZone: VN_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Thứ Năm */
const weekdayLongFormatter = new Intl.DateTimeFormat(VN_LOCALE, {
  timeZone: VN_TIME_ZONE,
  weekday: "long",
});

/** Th 5 */
const weekdayShortFormatter = new Intl.DateTimeFormat(VN_LOCALE, {
  timeZone: VN_TIME_ZONE,
  weekday: "short",
});

/** Thứ Năm, 31/12/2026 */
const weekdayDateFormatter = new Intl.DateTimeFormat(VN_LOCALE, {
  timeZone: VN_TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// --- Number formatters (hoisted) --------------------------------------------

/** 1.234.567 */
const numberFormatter = new Intl.NumberFormat(VN_LOCALE);

/** 1.234.568 (bỏ phần thập phân) */
const integerFormatter = new Intl.NumberFormat(VN_LOCALE, {
  maximumFractionDigits: 0,
});

/** 1.234.568 ₫ */
const currencyFormatter = new Intl.NumberFormat(VN_LOCALE, {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

/** 1,2 Tr */
const compactNumberFormatter = new Intl.NumberFormat(VN_LOCALE, {
  notation: "compact",
});

// --- Public API --------------------------------------------------------------

/** `31/12/2026`, chuỗi rỗng nếu input không hợp lệ. */
export function formatVnDate(value: DateLike): string {
  const date = toValidDate(value);
  return date ? dateFormatter.format(date) : "";
}

/** `31/12` */
export function formatVnDayMonth(value: DateLike): string {
  const date = toValidDate(value);
  return date ? dayMonthFormatter.format(date) : "";
}

/** `09:05` */
export function formatVnTime(value: DateLike): string {
  const date = toValidDate(value);
  return date ? timeFormatter.format(date) : "";
}

/** `09:05 31/12/2026` */
export function formatVnDateTime(value: DateLike): string {
  const date = toValidDate(value);
  return date ? dateTimeFormatter.format(date) : "";
}

/** `31/12 09:05` */
export function formatVnDayMonthTime(value: DateLike): string {
  const date = toValidDate(value);
  return date ? dayMonthTimeFormatter.format(date) : "";
}

/** `Thứ Năm` */
export function formatVnWeekday(value: DateLike): string {
  const date = toValidDate(value);
  return date ? weekdayLongFormatter.format(date) : "";
}

/** `Th 5` */
export function formatVnWeekdayShort(value: DateLike): string {
  const date = toValidDate(value);
  return date ? weekdayShortFormatter.format(date) : "";
}

/** `Thứ Năm, 31/12/2026` */
export function formatVnWeekdayDate(value: DateLike): string {
  const date = toValidDate(value);
  return date ? weekdayDateFormatter.format(date) : "";
}

/** `1.234.567` */
export function formatVnNumber(value: number | null | undefined): string {
  return numberFormatter.format(value ?? 0);
}

/** `1.234.568` (làm tròn về số nguyên) */
export function formatVnInteger(value: number | null | undefined): string {
  return integerFormatter.format(value ?? 0);
}

/** `1.234.568 ₫` */
export function formatVnCurrency(value: number | null | undefined): string {
  return currencyFormatter.format(value ?? 0);
}

/** `1.234.568 đ` — biến thể hậu tố chữ "đ" dùng nhiều trong UI nội bộ. */
export function formatVnDong(value: number | null | undefined): string {
  return `${integerFormatter.format(value ?? 0)} đ`;
}

/** `1,2 Tr` */
export function formatVnCompactNumber(value: number | null | undefined): string {
  return compactNumberFormatter.format(value ?? 0);
}

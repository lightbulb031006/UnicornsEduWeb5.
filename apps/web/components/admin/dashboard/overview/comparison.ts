export type ComparisonRange = { dateFrom: string; dateTo: string };

export type SameDayComparison = {
  /** Tháng đang chọn là tháng hiện tại → kỳ hiện tại chỉ tới hôm nay. */
  isCurrentMonth: boolean;
  /** Ngày 1 → ngày mốc của tháng đang chọn. */
  current: ComparisonRange;
  /** Ngày 1 → cùng ngày mốc của tháng trước (cắt ở cuối tháng nếu tháng trước ngắn hơn). */
  previous: ComparisonRange;
  /** Sau mốc tháng trước → mốc tháng này: cửa sổ đếm học sinh vào / nghỉ. */
  studentWindow: ComparisonRange;
  /** "1–19/09" — nhãn kỳ so sánh cho tooltip. */
  previousLabel: string;
  /** "1–19/10" — nhãn kỳ hiện tại. */
  currentLabel: string;
  /** "20/09–19/10" — nhãn cửa sổ đếm học sinh vào / nghỉ. */
  studentWindowLabel: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

const formatDayMonth = (date: Date) => `${date.getDate()}/${pad(date.getMonth() + 1)}`;

/** YYYY-MM-DD theo giờ máy, không qua UTC. */
function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * So sánh "cùng ngày tháng trước": tháng hiện tại lấy mốc là hôm nay
 * (1–19/10 so với 1–19/09); tháng đã qua lấy trọn tháng so với trọn tháng trước.
 * Trả `null` cho tháng tương lai.
 */
export function getSameDayComparison(month: string, year: string, today = new Date()): SameDayComparison | null {
  const monthIndex = Number(month) - 1;
  const yearNumber = Number(year);
  const monthStart = new Date(yearNumber, monthIndex, 1);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (monthStart > todayStart) return null;

  const isCurrentMonth = yearNumber === today.getFullYear() && monthIndex === today.getMonth();
  const lastDay = new Date(yearNumber, monthIndex + 1, 0).getDate();
  const cutoffDay = isCurrentMonth ? today.getDate() : lastDay;

  const previousLastDay = new Date(yearNumber, monthIndex, 0).getDate();
  // Tháng đã trọn (tháng cũ, hoặc hôm nay là ngày cuối) → so trọn tháng trước, không cắt 30/31.
  const previousCutoffDay = cutoffDay >= lastDay ? previousLastDay : Math.min(cutoffDay, previousLastDay);
  const previousStart = new Date(yearNumber, monthIndex - 1, 1);
  const previousCutoff = new Date(yearNumber, monthIndex - 1, previousCutoffDay);
  const currentCutoff = new Date(yearNumber, monthIndex, cutoffDay);
  const windowStart = new Date(yearNumber, monthIndex - 1, previousCutoffDay + 1);

  return {
    isCurrentMonth,
    current: { dateFrom: toDateKey(monthStart), dateTo: toDateKey(currentCutoff) },
    previous: { dateFrom: toDateKey(previousStart), dateTo: toDateKey(previousCutoff) },
    studentWindow: { dateFrom: toDateKey(windowStart), dateTo: toDateKey(currentCutoff) },
    previousLabel: `1–${previousCutoffDay}/${pad(previousStart.getMonth() + 1)}`,
    currentLabel: `1–${cutoffDay}/${pad(monthIndex + 1)}`,
    studentWindowLabel: `${formatDayMonth(windowStart)}–${formatDayMonth(currentCutoff)}`,
  };
}

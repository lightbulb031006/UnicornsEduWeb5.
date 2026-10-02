import {
  formatVnDate,
  formatVnTime,
  formatVnWeekday,
} from "@/lib/formatters";
/** e.g. "08:27 – Thứ ba, 31/03/2026" */
export function formatSidebarNotificationTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;

    const time = formatVnTime(d);

    const weekdayRaw = formatVnWeekday(d);
    const weekday =
      weekdayRaw.length > 0
        ? weekdayRaw.charAt(0).toLocaleUpperCase("vi-VN") + weekdayRaw.slice(1)
        : weekdayRaw;

    const date = formatVnDate(d);

    return `${time} – ${weekday}, ${date}`;
  } catch {
    return iso;
  }
}

export function summarizeNotificationContent(content: string, maxLen = 120): string {
  const noHtml = content.replace(/<[^>]*>/g, " ");
  const oneLine = noHtml.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen).trim()}…`;
}

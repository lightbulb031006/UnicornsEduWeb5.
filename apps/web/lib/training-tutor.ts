/** `YYYY-MM-DD…` → `DD/MM/YYYY` (cột `@db.Date`, không đổi múi giờ). */
export function formatTutorSessionDate(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

function wallClock(iso: string | null): string | null {
  return iso?.match(/T(\d{2}:\d{2})/)?.[1] ?? null;
}

/** Giờ tường cột `@db.Time` → `HH:mm – HH:mm`; thiếu giờ thì `—`. */
export function formatTutorSessionTimeRange(
  startTime: string | null,
  endTime: string | null,
): string {
  const start = wallClock(startTime);
  const end = wallClock(endTime);
  if (!start) return "—";
  return end ? `${start} – ${end}` : start;
}

/** Tổng số trang, tối thiểu 1. */
export function countPages(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, limit)));
}

export type DatedTimelineItem<S, E> =
  | { kind: "session"; item: S }
  | { kind: "extra"; item: E };

function dateKey(value: string): string {
  return value.slice(0, 10);
}

/**
 * Trộn buổi học với dòng phụ (vd báo cáo khảo sát) thành một danh sách mới → cũ.
 *
 * - Giữ nguyên thứ tự buổi học server trả (`date desc`), chỉ chen dòng phụ vào giữa.
 * - So theo ngày (`YYYY-MM-DD`), không so giờ.
 * - Cùng ngày: dòng phụ đứng trên buổi học (báo cáo thường viết sau buổi dạy).
 */
export function mergeTimelineByDateDesc<
  S extends { date: string },
  E extends { date: string },
>(sessions: readonly S[], extras: readonly E[]): DatedTimelineItem<S, E>[] {
  const sortedExtras = [...extras].sort((a, b) =>
    dateKey(b.date).localeCompare(dateKey(a.date)),
  );
  const merged: DatedTimelineItem<S, E>[] = [];
  let extraIndex = 0;
  for (const session of sessions) {
    while (
      extraIndex < sortedExtras.length &&
      dateKey(sortedExtras[extraIndex].date) >= dateKey(session.date)
    ) {
      merged.push({ kind: "extra", item: sortedExtras[extraIndex] });
      extraIndex += 1;
    }
    merged.push({ kind: "session", item: session });
  }
  for (; extraIndex < sortedExtras.length; extraIndex += 1) {
    merged.push({ kind: "extra", item: sortedExtras[extraIndex] });
  }
  return merged;
}

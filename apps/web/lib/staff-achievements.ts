/** Nhãn nút xem thành tích trên danh sách nhân sự; `null` khi không có thành tích. */
export function staffAchievementsButtonLabel(
  count: number | null | undefined,
): string | null {
  if (!count || count <= 0) return null;
  return `Xem thành tích (${count})`;
}

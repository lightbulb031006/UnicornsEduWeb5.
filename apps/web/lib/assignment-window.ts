/**
 * Khoảng refetch để trang tự cập nhật đúng lúc tới hạn lần giao (nút làm bài
 * khoá). Chia nhỏ tối đa 60s để chịu lệch giờ máy.
 * Trả `false` khi không cần chờ (không có hạn hoặc đã đóng).
 */
export function refetchIntervalUntilClose(
  closeAt: string | null | undefined,
  waiting: boolean,
  now: number = Date.now(),
): number | false {
  if (!waiting || !closeAt) return false;
  const left = new Date(closeAt).getTime() - now;
  return Math.min(60_000, Math.max(1_000, left + 500));
}

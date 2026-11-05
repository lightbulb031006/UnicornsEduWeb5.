type AssignmentDurationSource = {
  durationMinutes: number | null;
  lesson?: { durationMinutes: number | null } | null;
};

/**
 * Thời lượng làm bài (phút/lượt) hiệu lực của lần giao: lần giao cũ giữ thời
 * lượng đã chốt; lần giao mới đọc từ tiết thực hành (sửa tiết áp cho mọi lớp).
 */
export function assignmentDurationMinutes(
  item: AssignmentDurationSource,
): number | null {
  return item.durationMinutes ?? item.lesson?.durationMinutes ?? null;
}

/**
 * Hạn làm bài của lần giao (#229): từ mốc này không bắt đầu lượt mới; lượt đang
 * làm dở vẫn chạy hết thời lượng riêng. `null` = không có hạn. Hạn chỉ chặn bắt
 * đầu lượt — điểm/đáp án hiện ngay sau khi học sinh nộp lượt của mình.
 */
export function isAssignmentClosed(
  closeAt: Date | null,
  now: number = Date.now(),
): boolean {
  return closeAt != null && now >= closeAt.getTime();
}

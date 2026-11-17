/**
 * Staff role mang quyền truy cập của **Ban Đào Tạo** (CONTEXT.md), khớp
 * `TRAINING_ACCESS_ROLES` ở backend.
 *
 * Chỉ dùng cho check *quyền* (shell, menu, lịch, lớp, dashboard section).
 * Check theo *thu nhập của role* (trang chi tiết thu nhập, extra allowance,
 * lương cứng) vẫn so đúng role cụ thể.
 */
export const TRAINING_ACCESS_ROLES = ["training", "training_head"] as const;

export function hasTrainingAccess(
  staffRoles: readonly string[] | null | undefined,
): boolean {
  if (!staffRoles?.length) return false;
  return TRAINING_ACCESS_ROLES.some((role) => staffRoles.includes(role));
}

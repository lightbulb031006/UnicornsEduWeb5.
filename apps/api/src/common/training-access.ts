import { StaffRole } from 'generated/enums';

/**
 * Staff role mang quyền truy cập của **Ban Đào Tạo** (CONTEXT.md): xem hồ sơ
 * gia sư, lịch chế độ đào tạo, phạm vi lớp quản lý, dashboard section đào tạo…
 *
 * Chỉ dùng cho check *quyền*. Check theo *thu nhập của role* (extra allowance,
 * lương cứng, dòng Công việc khác) vẫn so đúng role cụ thể, không đi qua đây.
 */
export const TRAINING_ACCESS_ROLES: readonly StaffRole[] = [
  StaffRole.training,
  StaffRole.training_head,
];

export function hasTrainingAccess(
  roles: readonly string[] | null | undefined,
): boolean {
  if (!roles?.length) return false;
  return TRAINING_ACCESS_ROLES.some((role) => roles.includes(role));
}

/**
 * Role nhận **Trợ cấp quản lý lớp** trong thu nhập (dòng «Công việc khác»,
 * thuế, preview thanh toán). Người có cả hai role → ghi vào `training`;
 * Trưởng ban Đào tạo không có `training` → ghi vào dòng của chính
 * `training_head` (ADR 2026-11-11-training-head-independent-role).
 */
export function resolveTrainingManagerIncomeRole(
  roles: readonly string[] | null | undefined,
): StaffRole | null {
  if (roles?.includes(StaffRole.training)) return StaffRole.training;
  if (roles?.includes(StaffRole.training_head)) return StaffRole.training_head;
  return null;
}

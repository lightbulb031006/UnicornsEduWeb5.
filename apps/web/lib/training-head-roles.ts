import { SALE_CS_HEAD_ROLE } from "@/lib/sale-cs-head-access";

/**
 * Chỉnh role nhân sự bởi Trưởng ban Đào tạo (CONTEXT.md). Khớp
 * `training-head-role-policy.ts` ở backend; backend vẫn là nơi chặn cuối.
 */
export const TRAINING_HEAD_MANAGEABLE_ROLES = [
  "teacher",
  "lesson_plan",
  "training",
] as const;

export type TrainingHeadManageableRole =
  (typeof TRAINING_HEAD_MANAGEABLE_ROLES)[number];

/**
 * Nhân sự mang role này không phải cấp dưới: không bị Trưởng ban chỉnh role,
 * sửa hồ sơ, khoá… (khớp `PRIVILEGED_STAFF_ROLES` backend, #278).
 */
export const TRAINING_HEAD_PROTECTED_TARGET_ROLES = [
  "admin",
  SALE_CS_HEAD_ROLE,
  "training_head",
  "lesson_plan_head",
] as const;

export function isTrainingHeadManageableRole(
  role: string,
): role is TrainingHeadManageableRole {
  return (TRAINING_HEAD_MANAGEABLE_ROLES as readonly string[]).includes(role);
}

/** Nhãn role nối bằng « · » (dùng ở chế độ «Nhân sự ba nhóm»). */
export function formatStaffRoleLabels(
  roles: readonly string[],
  labels: Record<string, string>,
): string {
  return roles.map((role) => labels[role] ?? role).join(" · ");
}

/** Hiện nút «Sửa role» khi người xem là Trưởng ban và target hợp lệ. */
export function canTrainingHeadEditRoles(params: {
  viewerStaffId: string | null | undefined;
  viewerRoles: readonly string[] | null | undefined;
  target: { id: string; roles: readonly string[] };
}): boolean {
  const { viewerStaffId, viewerRoles, target } = params;
  if (!viewerStaffId || !viewerRoles?.includes("training_head")) return false;
  if (viewerStaffId === target.id) return false;
  return !target.roles.some((role) =>
    (TRAINING_HEAD_PROTECTED_TARGET_ROLES as readonly string[]).includes(role),
  );
}

/** Role ngoài phạm vi chỉnh: chỉ hiển thị, giữ nguyên khi lưu. */
export function getReadOnlyRoles(roles: readonly string[]): string[] {
  return roles.filter((role) => !isTrainingHeadManageableRole(role));
}

export function getManageableRoles(
  roles: readonly string[],
): TrainingHeadManageableRole[] {
  return TRAINING_HEAD_MANAGEABLE_ROLES.filter((role) => roles.includes(role));
}

/**
 * Kết quả sau lưu còn ít nhất một role (backend trả 400 nếu không).
 * `hasOtherRoles`: backend báo còn role ngoài ba nhóm (bị ẩn với Trưởng ban).
 */
export function hasAnyRoleAfterChange(
  currentRoles: readonly string[],
  selected: readonly string[],
  hasOtherRoles = false,
): boolean {
  return (
    hasOtherRoles ||
    getReadOnlyRoles(currentRoles).length > 0 ||
    selected.length > 0
  );
}

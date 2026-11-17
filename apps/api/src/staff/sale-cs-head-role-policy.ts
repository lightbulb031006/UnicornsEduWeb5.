import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StaffRole } from 'generated/enums';
import { PRIVILEGED_STAFF_ROLES } from 'src/common/staff-role-policy';

/**
 * Quyền quản lý đội Sale & CSKH của Trưởng phòng Sale & CSKH (ticket #271,
 * biên bản họp 12/11/2026 mục 9; CONTEXT.md «Quản lý đội Sale & CSKH»).
 *
 * - Bật/tắt role sale / customer_care cho người khác — không cho chính mình,
 *   không cho Admin hay người mang role trưởng.
 * - Khoá tài khoản chỉ khi target CHỈ mang role sale / customer_care.
 * - Sửa hồ sơ chuyên môn (không dữ liệu cá nhân, ngân hàng, lương).
 */
export const SALE_CS_HEAD_MANAGEABLE_ROLES: readonly StaffRole[] = [
  StaffRole.sale,
  StaffRole.customer_care,
];

/** Thành viên đội Sale & CSKH: mang ít nhất một role sale / customer_care. */
export function isSaleCsTeamMember(
  roles: readonly StaffRole[] | null | undefined,
): boolean {
  return (
    roles?.some((role) => SALE_CS_HEAD_MANAGEABLE_ROLES.includes(role)) ?? false
  );
}

interface SaleCsHeadTarget {
  actorStaffId: string;
  targetStaffId: string;
  targetRoles: readonly StaffRole[];
  /** `users.role_type = admin`: tài khoản admin hệ thống, có thể không mang `StaffRole.admin`. */
  targetIsAdminAccount: boolean;
}

function isProtectedTarget(target: SaleCsHeadTarget): boolean {
  return (
    target.targetIsAdminAccount ||
    target.targetRoles.some((role) => PRIVILEGED_STAFF_ROLES.includes(role))
  );
}

/** Có được bật/tắt role sale / customer_care cho target không (dùng cả cho cờ UI). */
export function canSaleCsHeadEditRoles(target: SaleCsHeadTarget): boolean {
  return (
    target.actorStaffId !== target.targetStaffId && !isProtectedTarget(target)
  );
}

/** Có được khoá / mở khoá tài khoản target không. */
export function canSaleCsHeadLockAccount(target: SaleCsHeadTarget): boolean {
  return (
    canSaleCsHeadEditRoles(target) &&
    target.targetRoles.length > 0 &&
    target.targetRoles.every((role) =>
      SALE_CS_HEAD_MANAGEABLE_ROLES.includes(role),
    )
  );
}

/**
 * Có được sửa hồ sơ chuyên môn của target không: thành viên đội, không phải
 * chính mình (tránh tự sửa hồ sơ qua kênh quản lý), không phải Admin / trưởng.
 */
export function canSaleCsHeadEditProfile(target: SaleCsHeadTarget): boolean {
  return (
    canSaleCsHeadEditRoles(target) && isSaleCsTeamMember(target.targetRoles)
  );
}

/** Có được sửa thành tích của target không — cùng phạm vi sửa hồ sơ chuyên môn. */
export function canSaleCsHeadEditAchievements(
  target: SaleCsHeadTarget,
): boolean {
  return canSaleCsHeadEditProfile(target);
}

function assertNotSelfOrProtected(target: SaleCsHeadTarget, action: string) {
  if (target.actorStaffId === target.targetStaffId) {
    throw new ForbiddenException(`Không thể tự ${action} của chính mình.`);
  }
  if (isProtectedTarget(target)) {
    throw new ForbiddenException(
      `Không được ${action} của Admin hoặc nhân sự mang role trưởng.`,
    );
  }
}

/**
 * Tính danh sách role mới khi Trưởng phòng gửi trạng thái đích của 2 role quản
 * lý được (sale, customer_care). Role khác của target giữ nguyên thứ tự cũ.
 */
export function planSaleCsHeadRoleChange(
  params: SaleCsHeadTarget & { requestedRoles: readonly StaffRole[] },
): { nextRoles: StaffRole[]; added: StaffRole[]; removed: StaffRole[] } {
  assertNotSelfOrProtected(params, 'chỉnh role');
  const outOfScope = params.requestedRoles.filter(
    (role) => !SALE_CS_HEAD_MANAGEABLE_ROLES.includes(role),
  );
  if (outOfScope.length > 0) {
    throw new ForbiddenException(
      'Trưởng phòng Sale & CSKH chỉ được bật/tắt role Sale và CSKH.',
    );
  }

  const requested = new Set(params.requestedRoles);
  const kept = params.targetRoles.filter(
    (role) =>
      !SALE_CS_HEAD_MANAGEABLE_ROLES.includes(role) || requested.has(role),
  );
  const added = SALE_CS_HEAD_MANAGEABLE_ROLES.filter(
    (role) => requested.has(role) && !params.targetRoles.includes(role),
  );
  const nextRoles = [...kept, ...added];
  if (nextRoles.length === 0) {
    throw new BadRequestException('Nhân sự phải còn ít nhất một role.');
  }

  return {
    nextRoles,
    added,
    removed: params.targetRoles.filter((role) => !nextRoles.includes(role)),
  };
}

/** Khoá / mở khoá tài khoản: target phải CHỈ mang role sale / customer_care. */
export function assertSaleCsHeadCanLockAccount(target: SaleCsHeadTarget): void {
  assertNotSelfOrProtected(target, 'khoá tài khoản');
  if (!canSaleCsHeadLockAccount(target)) {
    throw new ForbiddenException(
      'Chỉ được khoá tài khoản của nhân sự chỉ mang role Sale và/hoặc CSKH.',
    );
  }
}

/**
 * Đổi tên đăng nhập (16/11): đổi cả tài khoản như khoá tài khoản → cùng phạm
 * vi (target CHỈ mang role sale / customer_care, không phải mình / Admin / trưởng).
 */
export const canSaleCsHeadChangeAccountHandle = canSaleCsHeadLockAccount;

export function assertSaleCsHeadCanChangeAccountHandle(
  target: SaleCsHeadTarget,
): void {
  assertNotSelfOrProtected(target, 'đổi tên đăng nhập');
  if (!canSaleCsHeadChangeAccountHandle(target)) {
    throw new ForbiddenException(
      'Chỉ được đổi tên đăng nhập của nhân sự chỉ mang role Sale và/hoặc CSKH.',
    );
  }
}

/** Sửa hồ sơ chuyên môn: target là thành viên đội, không phải mình / Admin / trưởng. */
export function assertSaleCsHeadCanEditProfile(target: SaleCsHeadTarget): void {
  assertNotSelfOrProtected(target, 'sửa hồ sơ');
  if (!isSaleCsTeamMember(target.targetRoles)) {
    throw new ForbiddenException(
      'Chỉ được sửa hồ sơ chuyên môn của thành viên đội Sale & CSKH.',
    );
  }
}

/**
 * Sửa thành tích (thêm/sửa/xoá/sao/ảnh/sắp xếp): cùng phạm vi «dưới cấp» với
 * sửa hồ sơ chuyên môn — thành viên đội, không phải mình / Admin / trưởng.
 */
export function assertSaleCsHeadCanEditAchievements(
  target: SaleCsHeadTarget,
): void {
  assertNotSelfOrProtected(target, 'sửa thành tích');
  if (!isSaleCsTeamMember(target.targetRoles)) {
    throw new ForbiddenException(
      'Chỉ được sửa thành tích của thành viên đội Sale & CSKH.',
    );
  }
}

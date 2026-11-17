import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StaffRole } from 'generated/enums';
import { PRIVILEGED_STAFF_ROLES } from 'src/common/staff-role-policy';

/**
 * Trưởng ban Đào tạo quản lý nhân sự ba nhóm Gia sư, Ban Chuyên môn, Đào tạo
 * (biên bản họp 12/11/2026 mục 7; ticket #278; CONTEXT.md «Chỉnh role nhân sự
 * (Trưởng ban Đào tạo)», «Cấp dưới của Trưởng ban Đào tạo»).
 *
 * Role Trưởng ban được bật/tắt cho nhân sự khác. Mọi role khác chỉ đọc và được
 * giữ nguyên.
 */
export const TRAINING_HEAD_MANAGEABLE_ROLES: readonly StaffRole[] = [
  StaffRole.teacher,
  StaffRole.lesson_plan,
  StaffRole.training,
];

/**
 * Nhân sự mang một trong các role này không phải cấp dưới: không bị Trưởng ban
 * chỉnh role, sửa hồ sơ, đổi trạng thái, khoá hay xem thưởng (#278 thống nhất
 * với `PRIVILEGED_STAFF_ROLES`: Admin + mọi role trưởng).
 */
export const TRAINING_HEAD_PROTECTED_TARGET_ROLES: readonly StaffRole[] =
  PRIVILEGED_STAFF_ROLES;

export interface TrainingHeadTarget {
  actorStaffId: string;
  targetStaffId: string;
  targetRoles: readonly StaffRole[];
  /** `users.role_type = admin`: tài khoản admin hệ thống, có thể không mang `StaffRole.admin`. */
  targetIsAdminAccount: boolean;
}

/** Thuộc ba nhóm Trưởng ban quản lý: mang ít nhất một role teacher / lesson_plan / training. */
export function isTrainingTeamMember(
  roles: readonly StaffRole[] | null | undefined,
): boolean {
  return (
    roles?.some((role) => TRAINING_HEAD_MANAGEABLE_ROLES.includes(role)) ??
    false
  );
}

/** Phần role Trưởng ban được thấy: chỉ ba role thuộc nhóm, giữ thứ tự gốc. */
export function pickTrainingTeamRoles(
  roles: readonly StaffRole[] | null | undefined,
): StaffRole[] {
  return (roles ?? []).filter((role) =>
    TRAINING_HEAD_MANAGEABLE_ROLES.includes(role),
  );
}

function isSelf(target: TrainingHeadTarget): boolean {
  return target.actorStaffId === target.targetStaffId;
}

function isProtectedTarget(target: TrainingHeadTarget): boolean {
  return (
    target.targetIsAdminAccount ||
    target.targetRoles.some((role) =>
      TRAINING_HEAD_PROTECTED_TARGET_ROLES.includes(role),
    )
  );
}

/** Có được bật/tắt ba role cho target không (dùng cả cho cờ UI). */
export function canTrainingHeadEditRoles(target: TrainingHeadTarget): boolean {
  return !isSelf(target) && !isProtectedTarget(target);
}

/**
 * Cấp dưới: thuộc ba nhóm, không phải chính mình, không phải Admin hay người
 * mang role trưởng. Sửa hồ sơ chuyên môn, link Meet và xem thưởng chỉ trên cấp dưới.
 */
export function isTrainingHeadSubordinate(target: TrainingHeadTarget): boolean {
  return (
    canTrainingHeadEditRoles(target) && isTrainingTeamMember(target.targetRoles)
  );
}

/**
 * Khoá tài khoản / đổi trạng thái đang làm – đã nghỉ: tác động lên mọi role của
 * người đó, nên chỉ khi target CHỈ mang role thuộc ba nhóm.
 */
export function canTrainingHeadLockAccount(
  target: TrainingHeadTarget,
): boolean {
  return (
    isTrainingHeadSubordinate(target) &&
    target.targetRoles.every((role) =>
      TRAINING_HEAD_MANAGEABLE_ROLES.includes(role),
    )
  );
}

export const canTrainingHeadChangeStatus = canTrainingHeadLockAccount;

function assertNotSelfOrProtected(target: TrainingHeadTarget, action: string) {
  if (isSelf(target)) {
    throw new ForbiddenException(`Không thể tự ${action} của chính mình.`);
  }
  if (isProtectedTarget(target)) {
    throw new ForbiddenException(
      `Không được ${action} của Admin hoặc nhân sự mang role trưởng.`,
    );
  }
}

/** Sửa hồ sơ chuyên môn, tạo lại link Meet, xem thưởng: target phải là cấp dưới. */
export function assertTrainingHeadSubordinate(
  target: TrainingHeadTarget,
  action: string,
): void {
  assertNotSelfOrProtected(target, action);
  if (!isTrainingTeamMember(target.targetRoles)) {
    throw new ForbiddenException(
      'Chỉ áp dụng cho nhân sự mang role Gia sư, Ban Chuyên môn hoặc Đào tạo.',
    );
  }
}

/** Khoá / mở khoá tài khoản: target phải CHỈ mang role thuộc ba nhóm. */
export function assertTrainingHeadCanLockAccount(
  target: TrainingHeadTarget,
): void {
  assertTrainingHeadSubordinate(target, 'khoá tài khoản');
  if (!canTrainingHeadLockAccount(target)) {
    throw new ForbiddenException(
      'Chỉ được khoá tài khoản của nhân sự chỉ mang role Gia sư, Ban Chuyên môn và/hoặc Đào tạo.',
    );
  }
}

/**
 * Đổi tên đăng nhập (16/11): tác động cả tài khoản → cùng điều kiện khoá tài
 * khoản (target CHỈ mang role thuộc ba nhóm).
 */
export const canTrainingHeadChangeAccountHandle = canTrainingHeadLockAccount;

export function assertTrainingHeadCanChangeAccountHandle(
  target: TrainingHeadTarget,
): void {
  assertTrainingHeadSubordinate(target, 'đổi tên đăng nhập');
  if (!canTrainingHeadChangeAccountHandle(target)) {
    throw new ForbiddenException(
      'Chỉ được đổi tên đăng nhập của nhân sự chỉ mang role Gia sư, Ban Chuyên môn và/hoặc Đào tạo.',
    );
  }
}

/** Đổi trạng thái đang làm / đã nghỉ: cùng điều kiện với khoá tài khoản. */
export function assertTrainingHeadCanChangeStatus(
  target: TrainingHeadTarget,
): void {
  assertTrainingHeadSubordinate(target, 'đổi trạng thái');
  if (!canTrainingHeadChangeStatus(target)) {
    throw new ForbiddenException(
      'Chỉ được đổi trạng thái của nhân sự chỉ mang role Gia sư, Ban Chuyên môn và/hoặc Đào tạo.',
    );
  }
}

/**
 * Tính danh sách role mới khi Trưởng ban gửi tập role quản lý được mong muốn.
 * `requestedRoles` là trạng thái đích của 3 role quản lý được; role khác của
 * target giữ nguyên thứ tự cũ.
 */
export function planTrainingHeadRoleChange(
  params: TrainingHeadTarget & { requestedRoles: readonly StaffRole[] },
): { nextRoles: StaffRole[]; added: StaffRole[]; removed: StaffRole[] } {
  if (isSelf(params)) {
    throw new ForbiddenException('Không thể tự chỉnh role của chính mình.');
  }
  if (isProtectedTarget(params)) {
    throw new ForbiddenException(
      'Không được chỉnh role của Admin hoặc nhân sự mang role trưởng.',
    );
  }
  const outOfScope = params.requestedRoles.filter(
    (role) => !TRAINING_HEAD_MANAGEABLE_ROLES.includes(role),
  );
  if (outOfScope.length > 0) {
    throw new ForbiddenException(
      'Trưởng ban Đào tạo chỉ được bật/tắt role Gia sư, Ban Chuyên môn, Đào tạo.',
    );
  }

  const requested = new Set(params.requestedRoles);
  const kept = params.targetRoles.filter(
    (role) =>
      !TRAINING_HEAD_MANAGEABLE_ROLES.includes(role) || requested.has(role),
  );
  const added = TRAINING_HEAD_MANAGEABLE_ROLES.filter(
    (role) => requested.has(role) && !params.targetRoles.includes(role),
  );
  // Người ngoài ba nhóm chỉ là ứng viên: Trưởng ban được bật role cho họ,
  // không được gọi "không đổi gì" (nhất quán với khoá tài khoản → 403).
  const targetInScope = params.targetRoles.some((role) =>
    TRAINING_HEAD_MANAGEABLE_ROLES.includes(role),
  );
  if (!targetInScope && added.length === 0) {
    throw new ForbiddenException(
      'Nhân sự ngoài nhóm Gia sư, Ban Chuyên môn, Đào tạo — chỉ được bật role cho họ.',
    );
  }
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

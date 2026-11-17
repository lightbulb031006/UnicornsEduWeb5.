import { ForbiddenException } from '@nestjs/common';
import { StaffRole } from 'generated/enums';
import type { StaffPolicyActor } from 'src/common/staff-role-policy';

/**
 * Quyền trên «Quản lý lớp» của lớp (biên bản 12/11/2026 mục 5.2, 6, 7).
 *
 * - **% trợ cấp quản lý lớp** (`classes.training_manager_rate_percent` và %
 *   trên từng buổi): **chỉ Admin** sửa (#276). Ban Đào tạo, Trưởng ban Đào
 *   tạo, Quản lý lớp, Trưởng phòng, Kế toán đều bị 403 — ở mọi đường ghi.
 * - **Giao / gỡ Quản lý lớp:** Admin và Trưởng ban Đào tạo trên **mọi lớp**
 *   (#277, mục 5.2 + 7). Trưởng ban được tự nhận làm Quản lý lớp (giống khi
 *   tạo lớp ở #274) vì % trợ cấp quản lý lớp vẫn chỉ Admin đặt.
 */

export function canEditClassManagerAllowanceRate(
  actor: Pick<StaffPolicyActor, 'isAdmin'>,
): boolean {
  return actor.isAdmin;
}

export function canAssignClassManager(
  actor: Pick<StaffPolicyActor, 'isAdmin' | 'roles'>,
): boolean {
  return actor.isAdmin || actor.roles.includes(StaffRole.training_head);
}

export const CLASS_MANAGER_RATE_FORBIDDEN_MESSAGE =
  'Chỉ Admin được sửa % trợ cấp quản lý lớp.';

export function assertCanEditClassManagerAllowanceRate(
  actor: Pick<StaffPolicyActor, 'isAdmin'>,
): void {
  if (!canEditClassManagerAllowanceRate(actor)) {
    throw new ForbiddenException(CLASS_MANAGER_RATE_FORBIDDEN_MESSAGE);
  }
}

/**
 * `PATCH /class/:id/training-manager` nhận cả người quản lý lẫn %. Kiểm từng
 * phần **thật sự đổi** so với giá trị hiện tại, để form gửi lại % cũ không bị
 * chặn oan khi role chỉ được giao/gỡ quản lý (Trưởng ban Đào tạo, #277).
 */
export function assertClassTrainingManagerUpdateAllowed(
  actor: Pick<StaffPolicyActor, 'isAdmin' | 'roles'>,
  change: { changesManager: boolean; changesRate: boolean },
): void {
  if (
    !canAssignClassManager(actor) &&
    !canEditClassManagerAllowanceRate(actor)
  ) {
    throw new ForbiddenException(
      'Chỉ Admin hoặc Trưởng ban Đào tạo được giao / gỡ Quản lý lớp.',
    );
  }
  if (change.changesRate) {
    assertCanEditClassManagerAllowanceRate(actor);
  }
  if (change.changesManager && !canAssignClassManager(actor)) {
    throw new ForbiddenException('Không có quyền giao hoặc gỡ Quản lý lớp.');
  }
}

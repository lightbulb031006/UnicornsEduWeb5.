import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from 'generated/client';
import { StaffRole, UserRole } from 'generated/enums';
import type { PrismaService } from 'src/prisma/prisma.service';
import { SALE_CS_HEAD_ROLE } from './sale-cs-head-access';

/**
 * Chính sách role nhân sự chung (biên bản họp 12/11/2026, ticket #265).
 *
 * - **Cộng dồn quyền:** một người mang nhiều role thì được hợp quyền của các
 *   role đó; mỗi việc áp quyền của role cao nhất liên quan. Mọi check «có một
 *   trong các role» đi qua `hasAnyStaffRole`.
 * - **Hai luật cứng, chỉ Admin được miễn:**
 *   1. Không tự sửa lương / trợ cấp / trạng thái thanh toán của chính mình
 *      (`assertNotEditingOwnCompensation`).
 *   2. Không tự thêm role cho mình; không thêm/bớt role trưởng hoặc Admin của
 *      người khác (`assertStaffRoleChangeAllowed`).
 */

/** Role trưởng + Admin: chỉ Admin được giao hoặc thu hồi. */
export const PRIVILEGED_STAFF_ROLES: readonly StaffRole[] = [
  StaffRole.admin,
  SALE_CS_HEAD_ROLE,
  StaffRole.training_head,
  StaffRole.lesson_plan_head,
];

/**
 * 14/11: role trưởng được tạo hồ sơ nhân sự mới (`POST /staff`). Role gán cho
 * người mới vẫn qua `assertStaffRoleChangeAllowed` → không có Admin / role trưởng.
 */
export const STAFF_CREATOR_HEAD_ROLES: readonly StaffRole[] = [
  SALE_CS_HEAD_ROLE,
  StaffRole.training_head,
  StaffRole.lesson_plan_head,
];

/**
 * 15/11: role trưởng được xoá buổi học (`DELETE /sessions/:id`) — trừ buổi đã
 * thanh toán / ghi cọc (`assertSessionDeleteAllowed`). Admin xoá được mọi buổi.
 */
export const SESSION_DELETE_HEAD_ROLES: readonly StaffRole[] = [
  SALE_CS_HEAD_ROLE,
  StaffRole.training_head,
  StaffRole.lesson_plan_head,
];

export function hasAnyStaffRole(
  roles: readonly string[] | null | undefined,
  allowed: readonly string[],
): boolean {
  return roles?.some((role) => allowed.includes(role)) ?? false;
}

export interface StaffPolicyActor {
  /** Admin hệ thống (`users.role_type = admin`) hoặc staff mang role admin. */
  isAdmin: boolean;
  /** `staff_info.id` của actor; `null` nếu actor không có hồ sơ nhân sự. */
  staffId: string | null;
  roles: StaffRole[];
}

/**
 * Tra actor từ DB. Không có `userId` (job nội bộ, script) → coi là Admin để
 * không chặn luồng hệ thống; mọi request HTTP đều có `userId` từ JWT.
 */
export async function resolveStaffPolicyActor(
  db: Prisma.TransactionClient | PrismaService,
  actor: { userId?: string | null; roleType?: string | null } | undefined,
): Promise<StaffPolicyActor> {
  if (!actor?.userId) {
    return { isAdmin: true, staffId: null, roles: [] };
  }

  const user = await db.user.findUnique({
    where: { id: actor.userId },
    select: {
      roleType: true,
      staffInfo: { select: { id: true, roles: true } },
    },
  });
  const roles = user?.staffInfo?.roles ?? [];
  const roleType = user?.roleType ?? actor.roleType;

  return {
    isAdmin: roleType === UserRole.admin || roles.includes(StaffRole.admin),
    staffId: user?.staffInfo?.id ?? null,
    roles,
  };
}

/** Luật 1: không ai trừ Admin tự sửa lương/trợ cấp/thanh toán của chính mình. */
export function assertNotEditingOwnCompensation(
  actor: StaffPolicyActor,
  targetStaffIds: Iterable<string | null | undefined>,
): void {
  if (actor.isAdmin || !actor.staffId) {
    return;
  }
  for (const targetStaffId of targetStaffIds) {
    if (targetStaffId === actor.staffId) {
      throw new ForbiddenException(
        'Không được tự chỉnh lương, trợ cấp hoặc thanh toán của chính mình.',
      );
    }
  }
}

/**
 * Luật 2: không tự thêm role cho mình; không thêm/bớt role trưởng hoặc Admin
 * (kể cả cho người khác). Bớt role thường của chính mình vẫn được.
 */
export function assertStaffRoleChangeAllowed(
  actor: StaffPolicyActor,
  change: {
    /** `null` khi tạo hồ sơ nhân sự mới. */
    targetStaffId: string | null;
    previousRoles: readonly StaffRole[];
    nextRoles: readonly StaffRole[];
  },
): void {
  if (actor.isAdmin) {
    return;
  }

  const added = change.nextRoles.filter(
    (role) => !change.previousRoles.includes(role),
  );
  const removed = change.previousRoles.filter(
    (role) => !change.nextRoles.includes(role),
  );

  if (
    added.length > 0 &&
    actor.staffId != null &&
    change.targetStaffId === actor.staffId
  ) {
    throw new ForbiddenException('Không thể tự thêm role cho chính mình.');
  }

  if (hasAnyStaffRole([...added, ...removed], PRIVILEGED_STAFF_ROLES)) {
    throw new ForbiddenException(
      'Chỉ Admin được giao hoặc thu hồi role trưởng hoặc Admin.',
    );
  }
}

/**
 * Tạo hồ sơ nhân sự (`POST /staff`): ngoài Admin chỉ 3 role trưởng; trưởng
 * không đặt mức thu nhập theo % của người mới (% chia doanh thu, % CSKH mặc
 * định) — các mức này chỉ Admin sửa ở màn quản trị nhân sự.
 */
export function assertStaffCreateAllowed(
  actor: StaffPolicyActor,
  payload: {
    revenueSharePercent?: number | null;
    customerCareDefaultProfitPercent?: number | null;
  },
): void {
  if (actor.isAdmin) {
    return;
  }
  if (!hasAnyStaffRole(actor.roles, STAFF_CREATOR_HEAD_ROLES)) {
    throw new ForbiddenException(
      'Chỉ Admin hoặc role trưởng được tạo hồ sơ nhân sự.',
    );
  }
  if (
    payload.revenueSharePercent != null ||
    payload.customerCareDefaultProfitPercent != null
  ) {
    throw new ForbiddenException(
      'Chỉ Admin được đặt % chia doanh thu hoặc % CSKH mặc định.',
    );
  }
}

/**
 * Xoá buổi học: Admin xoá mọi buổi; role trưởng chỉ xoá buổi chưa thanh toán
 * trợ cấp gia sư (đã trả / ghi cọc = tiền đã chi, xoá sẽ lệch sổ lương).
 */
export function assertSessionDeleteAllowed(
  actor: StaffPolicyActor,
  session: { isPaymentLocked: boolean },
): void {
  if (actor.isAdmin) {
    return;
  }
  if (!hasAnyStaffRole(actor.roles, SESSION_DELETE_HEAD_ROLES)) {
    throw new ForbiddenException(
      'Chỉ Admin hoặc role trưởng được xoá buổi học.',
    );
  }
  if (session.isPaymentLocked) {
    throw new BadRequestException(
      'Không thể xoá buổi đã thanh toán hoặc ghi cọc. Liên hệ Admin nếu cần xoá.',
    );
  }
}

/** Đổi loại tài khoản sang admin cũng là nâng role: chỉ Admin được làm. */
export function assertUserRoleTypeChangeAllowed(
  actor: StaffPolicyActor,
  change: { previousRoleType: UserRole | null; nextRoleType: UserRole },
): void {
  if (actor.isAdmin) {
    return;
  }
  const touchesAdmin =
    change.previousRoleType !== change.nextRoleType &&
    (change.nextRoleType === UserRole.admin ||
      change.previousRoleType === UserRole.admin);
  if (touchesAdmin) {
    throw new ForbiddenException(
      'Chỉ Admin được cấp hoặc thu hồi tài khoản Admin.',
    );
  }
}

/** Tra actor + áp luật 1 trong một lần gọi (dùng ở service ghi lương/trợ cấp). */
export async function assertActorNotEditingOwnCompensation(
  db: Prisma.TransactionClient | PrismaService,
  actor: { userId?: string | null; roleType?: string | null } | undefined,
  targetStaffIds: Iterable<string | null | undefined>,
): Promise<void> {
  const ids = [...targetStaffIds].filter((id): id is string => !!id);
  if (ids.length === 0) {
    return;
  }
  assertNotEditingOwnCompensation(
    await resolveStaffPolicyActor(db, actor),
    ids,
  );
}

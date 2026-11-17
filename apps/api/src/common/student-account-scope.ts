import { SALE_CS_HEAD_ROLE } from 'src/common/sale-cs-head-access';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StaffRole, UserRole } from 'generated/enums';
import type { PrismaService } from 'src/prisma/prisma.service';

/** Prisma client tối thiểu cần để kiểm tra phạm vi. */
type StudentAccountScopeDb = Pick<
  PrismaService,
  'staffInfo' | 'customerCareService'
>;

export interface StudentAccountScopeActor {
  /** `users.id` của người thao tác. */
  userId: string;
  roleType: UserRole;
}

/** Staff role được thao tác tài khoản (thiết bị, phiên đăng nhập) của mọi học sinh. */
const STUDENT_ACCOUNT_MANAGER_STAFF_ROLES: StaffRole[] = [
  StaffRole.admin,
  SALE_CS_HEAD_ROLE,
];

/**
 * Chặn thao tác trên tài khoản học sinh (xem/đăng xuất thiết bị, buộc đăng xuất)
 * ngoài phạm vi: admin và trợ lí được mọi học sinh; CSKH chỉ học sinh mình đang
 * chăm sóc (`customer_care_service.staff_id`). Role khác bị từ chối.
 *
 * Học sinh ngoài phạm vi của CSKH trả 404 (không tiết lộ học sinh tồn tại).
 *
 * @param studentInfoId id hồ sơ `student_info` (UNIST-*), không phải `users.id`.
 */
export async function assertCanManageStudentAccount(
  db: StudentAccountScopeDb,
  actor: StudentAccountScopeActor,
  studentInfoId: string,
): Promise<void> {
  if (actor.roleType === UserRole.admin) {
    return;
  }

  if (actor.roleType !== UserRole.staff) {
    throw new ForbiddenException('Không có quyền thao tác tài khoản học sinh');
  }

  const staff = await db.staffInfo.findUnique({
    where: { userId: actor.userId },
    select: { id: true, roles: true },
  });

  if (!staff) {
    throw new ForbiddenException('Không có quyền thao tác tài khoản học sinh');
  }

  if (
    staff.roles.some((role) =>
      STUDENT_ACCOUNT_MANAGER_STAFF_ROLES.includes(role),
    )
  ) {
    return;
  }

  if (!staff.roles.includes(StaffRole.customer_care)) {
    throw new ForbiddenException('Không có quyền thao tác tài khoản học sinh');
  }

  const assignment = await db.customerCareService.findUnique({
    where: { studentId: studentInfoId },
    select: { staffId: true },
  });

  if (!assignment || assignment.staffId !== staff.id) {
    throw new NotFoundException('Student not found');
  }
}

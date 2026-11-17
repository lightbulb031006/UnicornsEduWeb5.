import { ForbiddenException } from '@nestjs/common';
import { UserRole } from 'generated/enums';
import type { Prisma } from '../../generated/client';
import type { PrismaService } from 'src/prisma/prisma.service';
import {
  canManageClassTeachersAndPay,
  isTrainingHeadActor,
} from 'src/staff-ops/staff-operations-access.service';
import { resolveStaffPolicyActor } from './staff-role-policy';
import { hasTrainingAccess } from './training-access';

export const CLASS_TEACHER_PAY_FORBIDDEN_MESSAGE =
  'Chỉ Admin, Trưởng ban Đào tạo hoặc Quản lý lớp của lớp này mới được sửa lương gia sư theo lớp. Kế toán chi chỉ xem.';

/**
 * Follow-up grill 13/11 — glossary «Kế toán chi»: chỉ **xem** lương gia sư theo
 * lớp. Đường ghi định mức lương gia sư theo lớp ngoài `/staff-ops` (vd
 * `PATCH /staff/:id/class-teachers/:classId/operating-deduction`) dùng cùng
 * luật với `resolveClassTeacherManagerScope`: Admin, Trưởng ban Đào tạo (mọi
 * lớp), Quản lý lớp (lớp mình). Hợp quyền: Kế toán chi kiêm một role trên vẫn
 * sửa được. Phần «không sửa lương của chính mình» kiểm riêng
 * (`assertActorNotEditingOwnCompensation`).
 */
export async function assertCanSetClassTeacherPay(
  db: Prisma.TransactionClient | PrismaService,
  actor: { userId?: string | null; roleType?: UserRole | null },
  classId: string,
): Promise<void> {
  if (actor.roleType === UserRole.admin) {
    return;
  }
  if (!actor.userId) {
    throw new ForbiddenException(CLASS_TEACHER_PAY_FORBIDDEN_MESSAGE);
  }

  const policyActor = await resolveStaffPolicyActor(db, actor);
  const isTrainingHead = isTrainingHeadActor(policyActor.roles);
  let isClassManager = false;
  if (
    !policyActor.isAdmin &&
    !isTrainingHead &&
    policyActor.staffId &&
    hasTrainingAccess(policyActor.roles)
  ) {
    const managedClass = await db.class.findFirst({
      where: { id: classId, trainingManagerStaffId: policyActor.staffId },
      select: { id: true },
    });
    isClassManager = Boolean(managedClass);
  }

  if (
    !canManageClassTeachersAndPay({
      isAdmin: policyActor.isAdmin,
      isClassManager,
      isTrainingHead,
    })
  ) {
    throw new ForbiddenException(CLASS_TEACHER_PAY_FORBIDDEN_MESSAGE);
  }
}

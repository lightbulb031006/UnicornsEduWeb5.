import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/client';
import { StaffRole, StaffStatus } from 'generated/enums';
import { hasTrainingAccess } from 'src/common/training-access';
import type { PrismaService } from 'src/prisma/prisma.service';

/**
 * Kiểm tra nhân sự được giao làm Quản lý lớp (dùng chung cho
 * `PATCH /class/:id/training-manager` và `POST /class` — #274).
 *
 * - Nhân sự phải tồn tại (404) và đang hoạt động, thuộc Ban Đào Tạo hoặc là
 *   gia sư (400).
 * - Gia sư chưa thuộc Ban Đào Tạo được cấp thêm role `training` khi giao —
 *   trả về id cần cấp trong `grantTrainingRoleToStaffId`.
 */
export async function resolveTrainingManagerAssignment(
  db: Prisma.TransactionClient | PrismaService,
  staffId: string,
): Promise<{ grantTrainingRoleToStaffId: string | null }> {
  const manager = await db.staffInfo.findUnique({
    where: { id: staffId },
    select: { id: true, roles: true, status: true },
  });
  if (!manager) {
    throw new NotFoundException('Training manager staff not found');
  }
  const hasTrainingRole = hasTrainingAccess(manager.roles);
  if (
    manager.status !== StaffStatus.active ||
    (!hasTrainingRole && !manager.roles.includes(StaffRole.teacher))
  ) {
    throw new BadRequestException(
      'Quản lý lớp phải là nhân sự Đào Tạo hoặc gia sư đang hoạt động.',
    );
  }
  return { grantTrainingRoleToStaffId: hasTrainingRole ? null : manager.id };
}

/** Cấp role `training` cho gia sư vừa được giao làm Quản lý lớp. */
export async function grantTrainingRoleForManager(
  tx: Prisma.TransactionClient,
  staffId: string | null,
): Promise<void> {
  if (!staffId) return;
  await tx.staffInfo.update({
    where: { id: staffId },
    data: { roles: { push: StaffRole.training } },
    select: { id: true },
  });
}

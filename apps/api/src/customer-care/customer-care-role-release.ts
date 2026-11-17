import { StaffRole } from 'generated/enums';
import { Prisma } from '../../generated/client';

/**
 * Tắt role CSKH = học sinh mất Người chăm sóc ngay (CONTEXT.md «Người chăm sóc
 * (học sinh)», follow-up grill 13/11 mục 2.1).
 *
 * Mọi đường đổi `staff_info.roles` (Admin sửa nhân sự, tab phân quyền user,
 * Trưởng phòng Sale & CSKH, Trưởng ban Đào tạo…) gọi hàm này **trong cùng
 * transaction** với lệnh ghi role. Chỉ xoá `customer_care_service` hiện hành;
 * `attendance` đã ghi (CSKH, hệ số, hoa hồng trưởng phòng) giữ nguyên. Bật lại
 * role không khôi phục — Trưởng phòng / Admin giao lại học sinh.
 */
export function isCustomerCareRoleRemoved(
  previousRoles: readonly StaffRole[] | null | undefined,
  nextRoles: readonly StaffRole[] | null | undefined,
): boolean {
  return (
    (previousRoles ?? []).includes(StaffRole.customer_care) &&
    !(nextRoles ?? []).includes(StaffRole.customer_care)
  );
}

/**
 * Gỡ gán mọi học sinh của CSKH khi role `customer_care` bị tắt. Trả số học sinh
 * vừa mất Người chăm sóc (0 nếu role không bị tắt).
 */
export async function releaseCustomerCareAssignmentsOnRoleRemovalInTx(
  tx: Prisma.TransactionClient,
  params: {
    staffId: string;
    previousRoles: readonly StaffRole[] | null | undefined;
    nextRoles: readonly StaffRole[] | null | undefined;
  },
): Promise<number> {
  if (!isCustomerCareRoleRemoved(params.previousRoles, params.nextRoles)) {
    return 0;
  }
  const result = await tx.customerCareService.deleteMany({
    where: { staffId: params.staffId },
  });
  return result.count;
}

import { Prisma } from 'generated/client';
import type { StaffRole } from 'generated/enums';
import { hasSaleCsHeadAccess } from 'src/common/sale-cs-head-access';

/**
 * #271: hoa hồng trưởng phòng chỉ tính cho người quản lý CSKH còn mang role
 * Trưởng phòng Sale & CSKH. Người quản lý đã bị thu hồi role → không ai nhận
 * (trả `null`); nhiều trưởng phòng cùng tồn tại, mỗi người chỉ ăn nhóm CSKH
 * mình quản lý (`customer_care_managed_by_staff_id`).
 */
export function resolveSaleCsHeadManagerId(careStaff: {
  customerCareManagedByStaffId: string | null | undefined;
  customerCareManagedBy?: { roles: readonly StaffRole[] } | null;
}): string | null {
  const managerId = careStaff.customerCareManagedByStaffId ?? null;
  if (!managerId) {
    return null;
  }
  return hasSaleCsHeadAccess(careStaff.customerCareManagedBy?.roles)
    ? managerId
    : null;
}

export function isSelfManagedCustomerCareStaff(params: {
  staffId: string;
  customerCareManagedByStaffId: string | null | undefined;
}): boolean {
  return (
    params.customerCareManagedByStaffId != null &&
    params.customerCareManagedByStaffId === params.staffId
  );
}

export function isSelfManagedAssistantShareAttendance(params: {
  saleCsHeadStaffId: string | null | undefined;
  customerCareStaffId: string | null | undefined;
}): boolean {
  return (
    params.saleCsHeadStaffId != null &&
    params.customerCareStaffId != null &&
    params.saleCsHeadStaffId === params.customerCareStaffId
  );
}

/**
 * Tuition that commissions (assistant 3%, CSKH) read. Historical rows of a
 * one-time class keep their pre-backfill tuition in `payrollBasisTuitionFee`
 * so already-accrued commission does not move onto the first session. Rows
 * without a basis read `tuitionFee`.
 */
export function commissionTuitionBasisVnd(row: {
  tuitionFee?: number | null;
  payrollBasisTuitionFee?: number | null;
}): number {
  return row.payrollBasisTuitionFee ?? row.tuitionFee ?? 0;
}

export const ATTENDANCE_COMMISSION_TUITION_BASIS_SQL = Prisma.sql`COALESCE(attendance.payroll_basis_tuition_fee, attendance.tuition_fee, 0)`;

export function resolveAssistantManagerStaffIdForAttendance(params: {
  customerCareStaffId: string | null | undefined;
  customerCareManagedByStaffId: string | null | undefined;
}): string | null {
  const managerId = params.customerCareManagedByStaffId ?? null;
  if (!managerId || !params.customerCareStaffId) {
    return null;
  }
  if (managerId === params.customerCareStaffId) {
    return null;
  }
  return managerId;
}

/** Exclude assistant 3% rows where manager and CSKH are the same staff. */
export const ASSISTANT_SHARE_EXCLUDE_SELF_MANAGED_SQL = Prisma.sql`
  AND (
    attendance.assistant_manager_staff_id IS NULL
    OR attendance.customer_care_staff_id IS NULL
    OR attendance.assistant_manager_staff_id <> attendance.customer_care_staff_id
  )
`;

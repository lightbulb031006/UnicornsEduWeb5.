import { ForbiddenException } from '@nestjs/common';
import { Prisma } from 'generated/client';
import { StaffRole } from 'generated/enums';
import type { PrismaService } from 'src/prisma/prisma.service';
import {
  hasAnyStaffRole,
  resolveStaffPolicyActor,
  type StaffPolicyActor,
} from './staff-role-policy';

/**
 * Thông tin nhạy cảm của nhân sự (biên bản họp 12/11/2026 mục 3, ticket #270).
 *
 * - **Thông tin cá nhân** (CCCD, SĐT, email, địa chỉ, ngày sinh, giới tính, dân
 *   tộc): chỉ Admin và chính người đó.
 * - **Ngân hàng + QR**: thêm Kế toán chi (để chuyển lương).
 * - **Thu nhập cá nhân** (trợ cấp từng buổi, lương cứng, tổng thu nhập, hoa
 *   hồng, trợ cấp sale/tự quản, khoản chưa thanh toán): Admin, Kế toán chi và
 *   chính người đó. Kế toán thu và các trưởng không thấy.
 * - Thưởng **không** phải thu nhập cá nhân; mức lương gia sư theo lớp là thông
 *   tin lớp — cả hai không đi qua helper này.
 *
 * Người kiêm nhiều role nhận **hợp** các quyền (mỗi role mở thêm, không role
 * nào thu hẹp góc nhìn của role khác).
 */
export interface StaffSensitiveView {
  personal: boolean;
  bank: boolean;
  income: boolean;
}

export const FULL_STAFF_SENSITIVE_VIEW: Readonly<StaffSensitiveView> =
  Object.freeze({ personal: true, bank: true, income: true });

/** Role mở thêm từng nhóm trường cho người xem hồ sơ người khác. */
const ROLES_GRANTING_BANK: readonly StaffRole[] = [
  StaffRole.accountant_expense,
];
const ROLES_GRANTING_INCOME: readonly StaffRole[] = [
  StaffRole.accountant_expense,
];

/** Trường thông tin cá nhân trên `staff_info`. */
export const STAFF_PERSONAL_FIELDS = [
  'cccdNumber',
  'cccdIssuedDate',
  'cccdIssuedPlace',
  'ethnicity',
  'gender',
  'currentAddress',
  'birthDate',
] as const;

/** Trường thông tin cá nhân trên `users` lồng trong hồ sơ nhân sự. */
export const STAFF_USER_PERSONAL_FIELDS = ['email', 'phone'] as const;

export const STAFF_BANK_FIELDS = ['bankAccount', 'bankQrLink'] as const;

/** Trường thu nhập cá nhân trên response chi tiết / danh sách nhân sự. */
export const STAFF_INCOME_FIELDS = [
  'classAllowance',
  'monthlyStats',
  'unpaidAmountTotal',
] as const;

export function computeStaffSensitiveView(
  actor: StaffPolicyActor,
  targetStaffId: string | null | undefined,
): StaffSensitiveView {
  if (actor.isAdmin) {
    return { ...FULL_STAFF_SENSITIVE_VIEW };
  }
  if (actor.staffId != null && targetStaffId === actor.staffId) {
    return { ...FULL_STAFF_SENSITIVE_VIEW };
  }
  return {
    personal: false,
    bank: hasAnyStaffRole(actor.roles, ROLES_GRANTING_BANK),
    income: hasAnyStaffRole(actor.roles, ROLES_GRANTING_INCOME),
  };
}

/**
 * Góc nhìn của `actor` lên hồ sơ nhân sự `targetStaffId`. Không có `userId`
 * (job nội bộ) → coi là Admin, như `resolveStaffPolicyActor`.
 */
export async function resolveStaffSensitiveView(
  db: Prisma.TransactionClient | PrismaService,
  actor: { userId?: string | null; roleType?: string | null } | undefined,
  targetStaffId: string | null | undefined,
): Promise<StaffSensitiveView> {
  return computeStaffSensitiveView(
    await resolveStaffPolicyActor(db, actor),
    targetStaffId,
  );
}

export const STAFF_INCOME_FORBIDDEN_MESSAGE =
  'Chỉ Admin, Kế toán chi và chính nhân sự được xem thu nhập cá nhân.';

export function assertCanViewStaffIncome(
  actor: StaffPolicyActor,
  targetStaffId: string | null | undefined,
): void {
  if (!computeStaffSensitiveView(actor, targetStaffId).income) {
    throw new ForbiddenException(STAFF_INCOME_FORBIDDEN_MESSAGE);
  }
}

function omitKeys<T extends object>(value: T, keys: readonly string[]): T {
  const next = { ...value } as Record<string, unknown>;
  for (const key of keys) {
    delete next[key];
  }
  return next as T;
}

/**
 * Bỏ khỏi bản ghi nhân sự các trường người xem không được thấy (trường vắng
 * hẳn trong JSON, không phải `null`) và gắn `sensitiveView` để UI biết ẩn
 * section. Trường nhóm nào không có trên bản ghi thì bỏ qua.
 */
export function redactStaffRecordForView<
  T extends { user?: Record<string, unknown> | null },
>(
  record: T,
  view: StaffSensitiveView,
): T & { sensitiveView: StaffSensitiveView } {
  let next: T = record;
  if (!view.personal) {
    next = omitKeys(next, STAFF_PERSONAL_FIELDS);
    if (next.user) {
      next = {
        ...next,
        user: omitKeys(next.user, STAFF_USER_PERSONAL_FIELDS),
      };
    }
  }
  if (!view.bank) {
    next = omitKeys(next, STAFF_BANK_FIELDS);
  }
  if (!view.income) {
    next = omitKeys(next, STAFF_INCOME_FIELDS);
  }
  return { ...next, sensitiveView: { ...view } };
}

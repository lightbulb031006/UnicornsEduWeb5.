import { hasTrainingAccess } from "@/lib/training-access";

/**
 * Follow-up grill 13/11 — glossary «Kế toán chi»: chỉ **xem** lương gia sư theo
 * lớp. Sửa định mức lương gia sư theo lớp (trợ cấp/HS, scale, % vận hành, trần,
 * mức riêng gia sư) cần Admin, Trưởng ban Đào tạo (mọi lớp) hoặc Quản lý lớp
 * của lớp đó — hợp quyền. Khớp `apps/api/src/common/class-teacher-pay-access.ts`
 * và `resolveClassTeacherManagerScope` (backend là nơi chặn thật).
 */
export function canSetClassTeacherPay(params: {
  isAdmin: boolean;
  staffRoles: readonly string[];
  viewerStaffId?: string | null;
  /** `class.trainingManager.id` (hoặc `trainingManagerStaffId`) của lớp đang xem. */
  classTrainingManagerStaffId?: string | null;
}): boolean {
  if (params.isAdmin) return true;
  if (params.staffRoles.includes("training_head")) return true;
  return (
    hasTrainingAccess(params.staffRoles) &&
    Boolean(params.viewerStaffId) &&
    params.classTrainingManagerStaffId === params.viewerStaffId
  );
}

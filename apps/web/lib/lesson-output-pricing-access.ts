import type { LessonPaymentStatus } from "@/dtos/lesson.dto";

/**
 * Tự khai chi phí giáo án (follow-up grill 13/11, khớp
 * `apps/api/src/lesson/lesson-plan-head-policy.ts`): ai được sửa bậc độ khó /
 * level / hạng mục của một output.
 *
 * - Admin: luôn được (kể cả output đã thanh toán).
 * - Output đã thanh toán: khoá với mọi người khác.
 * - Chưa thanh toán: Trưởng ban Chuyên môn (`canManage`) sửa mọi output;
 *   người nhận thanh toán tự khai output của mình.
 */
export type LessonOutputPricingAccessInput = {
  isAdmin: boolean;
  /** Admin hoặc Trưởng ban Chuyên môn (quyền quản lý khu giáo án). */
  canManage: boolean;
  viewerStaffId: string | null;
  outputStaffId: string | null;
  paymentStatus: LessonPaymentStatus;
};

export type LessonOutputPricingLockReason = "paid" | "not_owner" | null;

export function resolveLessonOutputPricingLock({
  isAdmin,
  canManage,
  viewerStaffId,
  outputStaffId,
  paymentStatus,
}: LessonOutputPricingAccessInput): LessonOutputPricingLockReason {
  if (isAdmin) return null;
  if (paymentStatus !== "pending") return "paid";
  if (canManage) return null;
  if (viewerStaffId && outputStaffId === viewerStaffId) return null;
  return "not_owner";
}

export const LESSON_OUTPUT_PRICING_LOCK_MESSAGES: Record<
  Exclude<LessonOutputPricingLockReason, null>,
  string
> = {
  paid: "Output đã thanh toán — bậc độ khó, level và hạng mục đã khoá (chỉ Admin sửa).",
  not_owner:
    "Chỉ người nhận thanh toán output, Trưởng ban Chuyên môn và Admin cài bậc độ khó, level và hạng mục.",
};

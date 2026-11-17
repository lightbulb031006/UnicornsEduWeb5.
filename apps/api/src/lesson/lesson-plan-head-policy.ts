import { ForbiddenException } from '@nestjs/common';
import { PaymentStatus, StaffRole } from 'generated/enums';

/**
 * Quyền khu **giáo án học sinh giỏi** (biên bản họp 12/11/2026 mục 8, ticket
 * #279; follow-up grill 13/11 nhóm 3).
 *
 * - Trưởng ban Chuyên môn (`lesson_plan_head`) = quyền quản lý (`canManage`):
 *   tạo/sửa/**xoá** đầu việc (task), sản phẩm (output); xoá mọi tài nguyên;
 *   giao việc; sửa bậc độ khó, level, hạng mục của output người khác.
 * - Ban Chuyên môn thường (`lesson_plan`): không xoá task/output; sửa và xoá
 *   tài nguyên do chính mình tạo.
 * - **Tự khai chi phí giáo án**: người nhận thanh toán output tự chọn bậc độ
 *   khó / level / hạng mục cho output của mình khi output **chưa thanh toán**
 *   (kể cả Trưởng ban). Ngoại lệ có chủ đích của luật «không tự sửa lương của
 *   chính mình» (#265), cùng khuôn Trợ cấp tự quản. Output đã thanh toán thì
 *   khoá với mọi người trừ Admin.
 * - **Chi phí từng output** công khai với mọi nhân sự giáo án (biểu giá, ai
 *   cũng tự tính lại được); tổng chi phí giáo án của một người vẫn là thu nhập
 *   cá nhân (#270).
 * - Trạng thái thanh toán: chỉ Admin và Kế toán chi; Kế toán chi không đổi
 *   trạng thái output mà chính mình là người nhận (#265).
 */
export interface LessonPolicyActor {
  staffId: string | null;
  staffRoles: readonly StaffRole[];
  canManage: boolean;
}

function isLessonAdmin(actor: LessonPolicyActor): boolean {
  return actor.staffRoles.includes(StaffRole.admin);
}

/** Xoá đầu việc / sản phẩm và mọi tài nguyên: Admin + Trưởng ban Chuyên môn. */
export function canDeleteLessonWork(actor: LessonPolicyActor): boolean {
  return isLessonAdmin(actor) || actor.canManage;
}

export const LESSON_DELETE_FORBIDDEN_MESSAGE =
  'Chỉ Admin và Trưởng ban Chuyên môn được xoá trong khu giáo án.';

export function assertCanDeleteLessonWork(actor: LessonPolicyActor): void {
  if (!canDeleteLessonWork(actor)) {
    throw new ForbiddenException(LESSON_DELETE_FORBIDDEN_MESSAGE);
  }
}

export const LESSON_RESOURCE_DELETE_FORBIDDEN_MESSAGE =
  'Chỉ người tạo tài nguyên, Trưởng ban Chuyên môn và Admin được xoá tài nguyên giáo án.';

/**
 * Xoá tài nguyên tổng giáo án: Admin + Trưởng ban Chuyên môn xoá mọi tài
 * nguyên; người tạo (`createdBy` = `users.id`) xoá tài nguyên của chính mình
 * khi còn là nhân sự giáo án (`canParticipate`).
 */
export function canDeleteLessonResource(
  actor: LessonPolicyActor & { userId: string; canParticipate: boolean },
  resourceCreatedBy: string | null | undefined,
): boolean {
  if (canDeleteLessonWork(actor)) {
    return true;
  }
  return (
    actor.canParticipate &&
    resourceCreatedBy != null &&
    resourceCreatedBy === actor.userId
  );
}

/** Sửa trạng thái thanh toán sản phẩm: chỉ Admin + Kế toán chi. */
export function canEditLessonOutputPaymentStatus(
  actor: LessonPolicyActor,
): boolean {
  return (
    isLessonAdmin(actor) ||
    actor.staffRoles.includes(StaffRole.accountant_expense)
  );
}

export const LESSON_PRICING_FORBIDDEN_MESSAGE =
  'Chỉ người nhận thanh toán output, Trưởng ban Chuyên môn và Admin được cài bậc độ khó, level và hạng mục.';
export const LESSON_PRICING_PAID_FORBIDDEN_MESSAGE =
  'Output đã thanh toán — chỉ Admin được sửa bậc độ khó, level và hạng mục.';

/**
 * Cài bậc độ khó / level / hạng mục (quyết định `cost`) cho output thuộc
 * `outputStaffId`, đang ở trạng thái `paymentStatus` (output mới: `pending`).
 *
 * - Admin luôn được (kể cả output đã thanh toán — giữ hành vi cũ).
 * - Output đã thanh toán → 403 với mọi người khác.
 * - Chưa thanh toán: người nhận thanh toán tự khai (Ban Chuyên môn thường và
 *   Trưởng ban); Trưởng ban sửa được output của người khác; Ban Chuyên môn
 *   thường không sửa output của người khác.
 */
export function assertCanSetLessonOutputPricing(
  actor: LessonPolicyActor,
  outputStaffId: string | null | undefined,
  paymentStatus: PaymentStatus = PaymentStatus.pending,
): void {
  if (isLessonAdmin(actor)) {
    return;
  }
  if (paymentStatus !== PaymentStatus.pending) {
    throw new ForbiddenException(LESSON_PRICING_PAID_FORBIDDEN_MESSAGE);
  }
  if (actor.canManage) {
    return;
  }
  if (actor.staffId != null && outputStaffId === actor.staffId) {
    return;
  }
  throw new ForbiddenException(LESSON_PRICING_FORBIDDEN_MESSAGE);
}

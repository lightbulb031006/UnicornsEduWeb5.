import { SALE_CS_HEAD_ROLE } from "@/lib/sale-cs-head-access";
import { TRAINING_HEAD_ROLE } from "@/lib/class-write-access";
import { isSessionPaymentLockedStatus } from "@/lib/session-time.helpers";

/**
 * 15/11: role trưởng xoá được buổi học (khớp `SESSION_DELETE_HEAD_ROLES` ở
 * backend, `DELETE /sessions/:id`). Admin xoá mọi buổi; role trưởng chỉ xoá
 * buổi chưa thanh toán / ghi cọc trợ cấp gia sư.
 */
export const SESSION_DELETE_HEAD_ROLES = [
  SALE_CS_HEAD_ROLE,
  TRAINING_HEAD_ROLE,
  "lesson_plan_head",
] as const;

export function canDeleteSessionsAsHead(
  staffRoles: readonly string[] | null | undefined,
): boolean {
  return (
    staffRoles?.some((role) =>
      (SESSION_DELETE_HEAD_ROLES as readonly string[]).includes(role),
    ) ?? false
  );
}

/**
 * Nút xoá trên từng buổi cho role trưởng: ẩn khi buổi đã thanh toán / ghi cọc.
 * Trưởng phòng Sale & CSKH không thấy `teacherPaymentStatus` (backend che lương
 * gia sư) → nút vẫn hiện, backend trả 400 nếu buổi đã khoá.
 */
export function canHeadDeleteSession(session: {
  teacherPaymentStatus?: string | null;
}): boolean {
  return !isSessionPaymentLockedStatus(session.teacherPaymentStatus);
}

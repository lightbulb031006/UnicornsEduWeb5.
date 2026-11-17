import { SALE_CS_HEAD_ROLE } from "@/lib/sale-cs-head-access";
import { TRAINING_ACCESS_ROLES } from "@/lib/training-access";
/**
 * Staff role được tạo và đẩy thông báo (CONTEXT.md "Tạo push"), khớp
 * `NOTIFICATION_PUBLISHER_STAFF_ROLES` ở backend. Gia sư và CSKH chỉ nhận.
 */
export const NOTIFICATION_PUBLISHER_STAFF_ROLES = [
  SALE_CS_HEAD_ROLE,
  "lesson_plan",
  "lesson_plan_head",
  "accountant_income",
  "accountant_expense",
  "communication",
  "technical",
  ...TRAINING_ACCESS_ROLES,
  "sale",
] as const;

export function canPublishNotifications(
  staffRoles: readonly string[],
  isAdmin: boolean,
): boolean {
  return (
    isAdmin ||
    staffRoles.some((role) =>
      (NOTIFICATION_PUBLISHER_STAFF_ROLES as readonly string[]).includes(role),
    )
  );
}

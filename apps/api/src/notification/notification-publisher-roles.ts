import { StaffRole } from 'generated/enums';

/**
 * Staff role được tạo và đẩy thông báo (CONTEXT.md "Tạo push"); admin luôn được.
 * Gia sư (`teacher`) và CSKH (`customer_care`) chỉ nhận nên không có ở đây.
 */
export const NOTIFICATION_PUBLISHER_STAFF_ROLES: StaffRole[] = [
  StaffRole.assistant,
  StaffRole.lesson_plan,
  StaffRole.lesson_plan_head,
  StaffRole.accountant_income,
  StaffRole.accountant_expense,
  StaffRole.communication,
  StaffRole.technical,
  StaffRole.training,
];

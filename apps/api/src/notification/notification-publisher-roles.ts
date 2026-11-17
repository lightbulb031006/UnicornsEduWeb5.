import { SALE_CS_HEAD_ROLE } from 'src/common/sale-cs-head-access';
import { StaffRole } from 'generated/enums';
import { TRAINING_ACCESS_ROLES } from 'src/common/training-access';

/**
 * Staff role được tạo và đẩy thông báo (CONTEXT.md "Tạo push"); admin luôn được.
 * Gia sư (`teacher`) và CSKH (`customer_care`) chỉ nhận nên không có ở đây.
 */
export const NOTIFICATION_PUBLISHER_STAFF_ROLES: StaffRole[] = [
  SALE_CS_HEAD_ROLE,
  StaffRole.lesson_plan,
  StaffRole.lesson_plan_head,
  StaffRole.accountant_income,
  StaffRole.accountant_expense,
  StaffRole.communication,
  StaffRole.technical,
  ...TRAINING_ACCESS_ROLES,
  StaffRole.sale,
];

import { StaffRole } from 'generated/enums';

/** Staff được decorator cây Chuyên đề / Tiết học. Service vẫn `assertCanManageCourse`. */
export const COURSE_TREE_STAFF_ROLES = [
  StaffRole.teacher,
  StaffRole.lesson_plan,
  StaffRole.lesson_plan_head,
] as const;

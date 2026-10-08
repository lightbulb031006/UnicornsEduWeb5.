import type { Prisma } from '../../generated/client';
import { StaffStatus } from 'generated/enums';

/**
 * Gia sư đứng lớp đang hoạt động: phân công `class_teachers` active (null coi như
 * active, cùng quy tắc `mapTeacherAssignment` của trang lớp admin/staff) và nhân sự
 * còn active. Gia sư đã ngừng trên lớp hoặc đã nghỉ không vào danh sách.
 */
export const ACTIVE_STANDING_TEACHER = {
  OR: [{ status: null }, { status: 'active' }],
  teacher: { status: StaffStatus.active },
} satisfies Prisma.ClassTeacherWhereInput;

import { StaffRole } from 'generated/enums';

/**
 * Roles that earn monthly fixed salary. Teacher is session-allowance only —
 * keep that exclusion here so readers, writers, and month-close all agree.
 */
const FIXED_SALARY_EXCLUDED_ROLES: ReadonlySet<StaffRole> = new Set([
  StaffRole.teacher,
]);

export const FIXED_SALARY_STAFF_ROLES: StaffRole[] = (
  Object.values(StaffRole) as StaffRole[]
).filter((role) => !FIXED_SALARY_EXCLUDED_ROLES.has(role));

const FIXED_SALARY_STAFF_ROLE_SET = new Set(FIXED_SALARY_STAFF_ROLES);

export function isFixedSalaryStaffRole(roleType: StaffRole): boolean {
  return FIXED_SALARY_STAFF_ROLE_SET.has(roleType);
}

import { StaffRole } from '../../generated/enums';
import {
  FIXED_SALARY_STAFF_ROLES,
  isFixedSalaryStaffRole,
} from './fixed-salary-staff-roles';

describe('FIXED_SALARY_STAFF_ROLES', () => {
  it('includes every StaffRole except teacher', () => {
    expect(FIXED_SALARY_STAFF_ROLES).not.toContain(StaffRole.teacher);
    expect(FIXED_SALARY_STAFF_ROLES).toContain(StaffRole.assistant);
    expect(FIXED_SALARY_STAFF_ROLES).toHaveLength(
      Object.values(StaffRole).length - 1,
    );
  });

  it('treats teacher as not a fixed-salary role', () => {
    expect(isFixedSalaryStaffRole(StaffRole.teacher)).toBe(false);
    expect(isFixedSalaryStaffRole(StaffRole.assistant)).toBe(true);
  });
});

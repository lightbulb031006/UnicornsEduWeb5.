import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegulationAudience, StaffRole, UserRole } from 'generated/enums';
import { NotificationTargetingDto } from 'src/dtos/notification.dto';
import { UpdateStaffDto } from 'src/dtos/staff.dto';
import { NOTIFICATION_PUBLISHER_STAFF_ROLES } from 'src/notification/notification-publisher-roles';
import { resolveAccountantFinanceView } from './accountant-finance-redaction.util';

/**
 * #266 — Bỏ role Kế toán chung (`accountant`), giữ Kế toán thu / Kế toán chi.
 */
describe('#266 bỏ role Kế toán chung', () => {
  it('enum StaffRole không còn accountant nhưng vẫn giữ accountant_income / accountant_expense', () => {
    const roles = Object.values(StaffRole) as string[];
    expect(roles).not.toContain('accountant');
    expect(roles).toEqual(
      expect.arrayContaining(['accountant_income', 'accountant_expense']),
    );
  });

  it('enum RegulationAudience không còn staff_accountant', () => {
    const audiences = Object.values(RegulationAudience) as string[];
    expect(audiences).not.toContain('staff_accountant');
    expect(audiences).toEqual(
      expect.arrayContaining([
        'staff_accountant_income',
        'staff_accountant_expense',
      ]),
    );
  });

  describe('giao role cho nhân sự (UpdateStaffDto.roles)', () => {
    it('từ chối giá trị accountant', async () => {
      const errors = await validate(
        plainToInstance(UpdateStaffDto, { roles: ['accountant'] }),
      );
      expect(errors.map((error) => error.property)).toContain('roles');
    });

    it('chấp nhận Kế toán thu và Kế toán chi', async () => {
      const errors = await validate(
        plainToInstance(UpdateStaffDto, {
          roles: [StaffRole.accountant_income, StaffRole.accountant_expense],
        }),
      );
      expect(errors.map((error) => error.property)).not.toContain('roles');
    });
  });

  describe('đối tượng nhận thông báo (targetStaffRoles)', () => {
    it('từ chối gửi tới role accountant', async () => {
      const errors = await validate(
        plainToInstance(NotificationTargetingDto, {
          targetStaffRoles: ['accountant'],
        }),
      );
      expect(errors.map((error) => error.property)).toContain(
        'targetStaffRoles',
      );
    });

    it('vẫn cho gửi tới Kế toán thu / Kế toán chi', async () => {
      const errors = await validate(
        plainToInstance(NotificationTargetingDto, {
          targetStaffRoles: [
            StaffRole.accountant_income,
            StaffRole.accountant_expense,
          ],
        }),
      );
      expect(errors).toHaveLength(0);
    });
  });

  it('Kế toán thu / Kế toán chi vẫn được đăng thông báo, không còn accountant', () => {
    expect(NOTIFICATION_PUBLISHER_STAFF_ROLES as string[]).not.toContain(
      'accountant',
    );
    expect(NOTIFICATION_PUBLISHER_STAFF_ROLES).toEqual(
      expect.arrayContaining([
        StaffRole.accountant_income,
        StaffRole.accountant_expense,
      ]),
    );
  });

  it('phân quyền tài chính của Kế toán thu / Kế toán chi giữ nguyên', () => {
    expect(
      resolveAccountantFinanceView(UserRole.staff, [
        StaffRole.accountant_income,
      ]),
    ).toBe('income');
    expect(
      resolveAccountantFinanceView(UserRole.staff, [
        StaffRole.accountant_expense,
      ]),
    ).toBe('expense');
  });
});

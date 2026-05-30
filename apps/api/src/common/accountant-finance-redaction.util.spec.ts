import { StaffRole, UserRole } from 'generated/enums';
import { resolveAccountantFinanceView } from './accountant-finance-redaction.util';

describe('resolveAccountantFinanceView', () => {
  it('treats legacy accountant as income finance view', () => {
    expect(
      resolveAccountantFinanceView(UserRole.staff, [StaffRole.accountant]),
    ).toBe('income');
  });

  it('resolves split accountant roles independently', () => {
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

  it('gives combined income and expense accountants full finance view', () => {
    expect(
      resolveAccountantFinanceView(UserRole.staff, [
        StaffRole.accountant_income,
        StaffRole.accountant_expense,
      ]),
    ).toBe('full');
  });

  it('keeps admin and assistant on full finance view', () => {
    expect(resolveAccountantFinanceView(UserRole.admin, [])).toBe('full');
    expect(
      resolveAccountantFinanceView(UserRole.staff, [StaffRole.assistant]),
    ).toBe('full');
  });
});

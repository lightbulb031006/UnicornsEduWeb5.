import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StaffRole, UserRole } from '../../generated/enums';
import {
  assertCanManageStudentAccount,
  type StudentAccountScopeActor,
} from './student-account-scope';

describe('assertCanManageStudentAccount', () => {
  const db = {
    staffInfo: { findUnique: jest.fn() },
    customerCareService: { findUnique: jest.fn() },
  };
  const staffActor: StudentAccountScopeActor = {
    userId: 'staff-user',
    roleType: UserRole.staff,
  };
  const check = (actor: StudentAccountScopeActor = staffActor) =>
    assertCanManageStudentAccount(db as never, actor, 'UNIST-1');

  beforeEach(() => jest.clearAllMocks());

  it('allows admin users without touching staff data', async () => {
    await expect(
      check({ userId: 'admin', roleType: UserRole.admin }),
    ).resolves.toBeUndefined();
    expect(db.staffInfo.findUnique).not.toHaveBeenCalled();
  });

  it('rejects students', async () => {
    await expect(
      check({ userId: 'student', roleType: UserRole.student }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([StaffRole.admin, StaffRole.sale_customer_care_head])(
    'allows staff %s on any student',
    async (role) => {
      db.staffInfo.findUnique.mockResolvedValueOnce({ id: 's', roles: [role] });
      await expect(check()).resolves.toBeUndefined();
      expect(db.customerCareService.findUnique).not.toHaveBeenCalled();
    },
  );

  it('allows customer care on a student assigned to them', async () => {
    db.staffInfo.findUnique.mockResolvedValueOnce({
      id: 'cskh-1',
      roles: [StaffRole.customer_care],
    });
    db.customerCareService.findUnique.mockResolvedValueOnce({
      staffId: 'cskh-1',
    });
    await expect(check()).resolves.toBeUndefined();
  });

  it('hides unassigned or foreign students from customer care (404)', async () => {
    db.staffInfo.findUnique.mockResolvedValue({
      id: 'cskh-1',
      roles: [StaffRole.customer_care],
    });
    db.customerCareService.findUnique.mockResolvedValueOnce({
      staffId: 'cskh-2',
    });
    await expect(check()).rejects.toBeInstanceOf(NotFoundException);
    db.customerCareService.findUnique.mockResolvedValueOnce(null);
    await expect(check()).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([StaffRole.teacher, StaffRole.accountant_income, StaffRole.sale])(
    'rejects staff role %s (403)',
    async (role) => {
      db.staffInfo.findUnique.mockResolvedValueOnce({ id: 's', roles: [role] });
      await expect(check()).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});

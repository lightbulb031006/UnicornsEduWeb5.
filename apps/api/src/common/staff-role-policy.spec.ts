import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StaffRole, UserRole } from 'generated/enums';
import {
  assertActorNotEditingOwnCompensation,
  assertSessionDeleteAllowed,
  assertNotEditingOwnCompensation,
  assertStaffCreateAllowed,
  assertStaffRoleChangeAllowed,
  assertUserRoleTypeChangeAllowed,
  hasAnyStaffRole,
  resolveStaffPolicyActor,
  type StaffPolicyActor,
} from './staff-role-policy';
import { SALE_CS_HEAD_ROLE } from './sale-cs-head-access';

const admin: StaffPolicyActor = {
  isAdmin: true,
  staffId: 'S-ADMIN',
  roles: [StaffRole.admin],
};
const saleHead: StaffPolicyActor = {
  isAdmin: false,
  staffId: 'S-HEAD',
  roles: [SALE_CS_HEAD_ROLE, StaffRole.teacher],
};

function mockDb(
  user: {
    roleType: UserRole;
    staffInfo: { id: string; roles: StaffRole[] } | null;
  } | null,
) {
  return {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
  } as never;
}

describe('staff-role-policy', () => {
  describe('hasAnyStaffRole', () => {
    it('đúng khi có ít nhất một role trùng', () => {
      expect(
        hasAnyStaffRole(
          [StaffRole.teacher, StaffRole.accountant_income],
          [StaffRole.accountant_income],
        ),
      ).toBe(true);
      expect(hasAnyStaffRole([StaffRole.teacher], [StaffRole.admin])).toBe(
        false,
      );
      expect(hasAnyStaffRole(undefined, [StaffRole.admin])).toBe(false);
    });
  });

  describe('resolveStaffPolicyActor', () => {
    it('user role_type admin là Admin dù không mang staff role admin', async () => {
      const actor = await resolveStaffPolicyActor(
        mockDb({ roleType: UserRole.admin, staffInfo: null }),
        { userId: 'U1' },
      );
      expect(actor).toEqual({ isAdmin: true, staffId: null, roles: [] });
    });

    it('staff mang role admin là Admin', async () => {
      const actor = await resolveStaffPolicyActor(
        mockDb({
          roleType: UserRole.staff,
          staffInfo: { id: 'S1', roles: [StaffRole.admin] },
        }),
        { userId: 'U1' },
      );
      expect(actor.isAdmin).toBe(true);
    });

    it('staff thường không phải Admin', async () => {
      const actor = await resolveStaffPolicyActor(
        mockDb({
          roleType: UserRole.staff,
          staffInfo: { id: 'S1', roles: [SALE_CS_HEAD_ROLE] },
        }),
        { userId: 'U1' },
      );
      expect(actor).toEqual({
        isAdmin: false,
        staffId: 'S1',
        roles: [SALE_CS_HEAD_ROLE],
      });
    });

    it('không có userId (job nội bộ) thì không chặn', async () => {
      const db = mockDb(null);
      const actor = await resolveStaffPolicyActor(db, undefined);
      expect(actor.isAdmin).toBe(true);
    });
  });

  describe('luật 1: không tự sửa lương của chính mình', () => {
    it('chặn khi target là chính mình', () => {
      expect(() =>
        assertNotEditingOwnCompensation(saleHead, ['S-OTHER', 'S-HEAD']),
      ).toThrow(ForbiddenException);
    });

    it('cho phép sửa lương người khác', () => {
      expect(() =>
        assertNotEditingOwnCompensation(saleHead, ['S-OTHER']),
      ).not.toThrow();
    });

    it('Admin được tự sửa', () => {
      expect(() =>
        assertNotEditingOwnCompensation(admin, ['S-ADMIN']),
      ).not.toThrow();
    });

    it('bản async tra actor rồi chặn', async () => {
      const db = mockDb({
        roleType: UserRole.staff,
        staffInfo: { id: 'S-HEAD', roles: [SALE_CS_HEAD_ROLE] },
      });
      await expect(
        assertActorNotEditingOwnCompensation(db, { userId: 'U1' }, ['S-HEAD']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('bản async bỏ qua tra DB khi không có target', async () => {
      const db = mockDb(null) as unknown as {
        user: { findUnique: jest.Mock };
      };
      await assertActorNotEditingOwnCompensation(
        db as never,
        { userId: 'U1' },
        [null, undefined],
      );
      expect(db.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('luật 2: role trưởng / Admin chỉ Admin giao', () => {
    it('chặn tự thêm role cho chính mình', () => {
      expect(() =>
        assertStaffRoleChangeAllowed(saleHead, {
          targetStaffId: 'S-HEAD',
          previousRoles: [SALE_CS_HEAD_ROLE],
          nextRoles: [SALE_CS_HEAD_ROLE, StaffRole.accountant_income],
        }),
      ).toThrow('Không thể tự thêm role cho chính mình.');
    });

    it('cho phép tự bỏ bớt role thường', () => {
      expect(() =>
        assertStaffRoleChangeAllowed(saleHead, {
          targetStaffId: 'S-HEAD',
          previousRoles: [SALE_CS_HEAD_ROLE, StaffRole.teacher],
          nextRoles: [SALE_CS_HEAD_ROLE],
        }),
      ).not.toThrow();
    });

    it.each([
      StaffRole.admin,
      SALE_CS_HEAD_ROLE,
      StaffRole.training_head,
      StaffRole.lesson_plan_head,
    ])('chặn giao role %s cho người khác', (role) => {
      expect(() =>
        assertStaffRoleChangeAllowed(saleHead, {
          targetStaffId: 'S-OTHER',
          previousRoles: [StaffRole.teacher],
          nextRoles: [StaffRole.teacher, role],
        }),
      ).toThrow('Chỉ Admin được giao hoặc thu hồi role trưởng hoặc Admin.');
    });

    it('chặn thu hồi role trưởng của người khác', () => {
      expect(() =>
        assertStaffRoleChangeAllowed(saleHead, {
          targetStaffId: 'S-OTHER',
          previousRoles: [StaffRole.training_head],
          nextRoles: [StaffRole.teacher],
        }),
      ).toThrow(ForbiddenException);
    });

    it('chặn tạo hồ sơ mới mang role trưởng', () => {
      expect(() =>
        assertStaffRoleChangeAllowed(saleHead, {
          targetStaffId: null,
          previousRoles: [],
          nextRoles: [StaffRole.admin],
        }),
      ).toThrow(ForbiddenException);
    });

    it('cho phép giao role thường cho người khác', () => {
      expect(() =>
        assertStaffRoleChangeAllowed(saleHead, {
          targetStaffId: 'S-OTHER',
          previousRoles: [StaffRole.teacher],
          nextRoles: [StaffRole.teacher, StaffRole.customer_care],
        }),
      ).not.toThrow();
    });

    it('Admin được giao mọi role, kể cả cho chính mình', () => {
      expect(() =>
        assertStaffRoleChangeAllowed(admin, {
          targetStaffId: 'S-ADMIN',
          previousRoles: [StaffRole.admin],
          nextRoles: [StaffRole.admin, StaffRole.training_head],
        }),
      ).not.toThrow();
    });

    it('chặn đổi loại tài khoản sang/khỏi admin', () => {
      expect(() =>
        assertUserRoleTypeChangeAllowed(saleHead, {
          previousRoleType: UserRole.staff,
          nextRoleType: UserRole.admin,
        }),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertUserRoleTypeChangeAllowed(saleHead, {
          previousRoleType: UserRole.admin,
          nextRoleType: UserRole.staff,
        }),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertUserRoleTypeChangeAllowed(saleHead, {
          previousRoleType: UserRole.guest,
          nextRoleType: UserRole.staff,
        }),
      ).not.toThrow();
    });
  });

  describe('tạo hồ sơ nhân sự (14/11)', () => {
    const roleOnly = (roles: StaffRole[]): StaffPolicyActor => ({
      isAdmin: false,
      staffId: 'S-X',
      roles,
    });

    it.each([
      ['Trưởng phòng Sale & CSKH', SALE_CS_HEAD_ROLE],
      ['Trưởng ban Đào tạo', StaffRole.training_head],
      ['Trưởng ban Chuyên môn', StaffRole.lesson_plan_head],
    ])('%s tạo được, gán mọi role thường', (_label, role) => {
      const actor = roleOnly([role]);
      expect(() => assertStaffCreateAllowed(actor, {})).not.toThrow();
      expect(() =>
        assertStaffRoleChangeAllowed(actor, {
          targetStaffId: null,
          previousRoles: [],
          nextRoles: [
            StaffRole.teacher,
            StaffRole.lesson_plan,
            StaffRole.accountant_income,
            StaffRole.accountant_expense,
            StaffRole.communication,
            StaffRole.technical,
            StaffRole.customer_care,
            StaffRole.training,
            StaffRole.sale,
          ],
        }),
      ).not.toThrow();
    });

    it.each([
      StaffRole.admin,
      SALE_CS_HEAD_ROLE,
      StaffRole.training_head,
      StaffRole.lesson_plan_head,
    ])('trưởng không gán được role %s cho người mới', (role) => {
      expect(() =>
        assertStaffRoleChangeAllowed(roleOnly([StaffRole.training_head]), {
          targetStaffId: null,
          previousRoles: [],
          nextRoles: [StaffRole.teacher, role],
        }),
      ).toThrow(ForbiddenException);
    });

    it('role thường (kế toán chi, gia sư) không tạo được', () => {
      expect(() =>
        assertStaffCreateAllowed(
          roleOnly([StaffRole.accountant_expense, StaffRole.teacher]),
          {},
        ),
      ).toThrow(ForbiddenException);
    });

    it('trưởng không đặt % chia doanh thu / % CSKH mặc định; Admin được', () => {
      expect(() =>
        assertStaffCreateAllowed(saleHead, { revenueSharePercent: 3 }),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertStaffCreateAllowed(saleHead, {
          customerCareDefaultProfitPercent: 0.1,
        }),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertStaffCreateAllowed(saleHead, {
          revenueSharePercent: null,
          customerCareDefaultProfitPercent: undefined,
        }),
      ).not.toThrow();
      expect(() =>
        assertStaffCreateAllowed(admin, {
          revenueSharePercent: 3,
          customerCareDefaultProfitPercent: 0.1,
        }),
      ).not.toThrow();
    });
  });
});

describe('assertSessionDeleteAllowed (15/11)', () => {
  const unlocked = { isPaymentLocked: false };
  const locked = { isPaymentLocked: true };

  it('Admin xoá mọi buổi, kể cả đã thanh toán', () => {
    expect(() => assertSessionDeleteAllowed(admin, locked)).not.toThrow();
  });

  it.each([
    SALE_CS_HEAD_ROLE,
    StaffRole.training_head,
    StaffRole.lesson_plan_head,
  ])('%s xoá được buổi chưa thanh toán', (role) => {
    expect(() =>
      assertSessionDeleteAllowed(
        { isAdmin: false, staffId: 'S9', roles: [role] },
        unlocked,
      ),
    ).not.toThrow();
  });

  it('role trưởng không xoá buổi đã thanh toán / ghi cọc', () => {
    expect(() => assertSessionDeleteAllowed(saleHead, locked)).toThrow(
      BadRequestException,
    );
  });

  it('role thường bị 403', () => {
    expect(() =>
      assertSessionDeleteAllowed(
        {
          isAdmin: false,
          staffId: 'S9',
          roles: [StaffRole.accountant_expense],
        },
        unlocked,
      ),
    ).toThrow(ForbiddenException);
  });
});

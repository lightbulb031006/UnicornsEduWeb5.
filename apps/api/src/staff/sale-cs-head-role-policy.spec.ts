import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StaffRole } from 'generated/enums';
import {
  assertSaleCsHeadCanChangeAccountHandle,
  assertSaleCsHeadCanEditProfile,
  canSaleCsHeadChangeAccountHandle,
  assertSaleCsHeadCanLockAccount,
  canSaleCsHeadEditProfile,
  canSaleCsHeadEditRoles,
  canSaleCsHeadLockAccount,
  isSaleCsTeamMember,
  planSaleCsHeadRoleChange,
} from './sale-cs-head-role-policy';

const base = {
  actorStaffId: 'HEAD',
  targetStaffId: 'T1',
  targetIsAdminAccount: false,
};

const PRIVILEGED_CASES: Array<[string, StaffRole[]]> = [
  ['Admin', [StaffRole.admin, StaffRole.sale]],
  ['Trưởng phòng khác', [StaffRole.sale_customer_care_head]],
  ['Trưởng ban Đào tạo', [StaffRole.training_head, StaffRole.customer_care]],
  ['Trưởng ban Chuyên môn', [StaffRole.lesson_plan_head, StaffRole.sale]],
];

describe('isSaleCsTeamMember', () => {
  it('nhận sale hoặc customer_care', () => {
    expect(isSaleCsTeamMember([StaffRole.sale])).toBe(true);
    expect(
      isSaleCsTeamMember([StaffRole.teacher, StaffRole.customer_care]),
    ).toBe(true);
    expect(isSaleCsTeamMember([StaffRole.teacher])).toBe(false);
    expect(isSaleCsTeamMember([])).toBe(false);
  });
});

describe('planSaleCsHeadRoleChange', () => {
  it('bật/tắt sale, customer_care; giữ role khác và thứ tự cũ', () => {
    const result = planSaleCsHeadRoleChange({
      ...base,
      targetRoles: [StaffRole.sale, StaffRole.teacher],
      requestedRoles: [StaffRole.customer_care],
    });
    expect(result.nextRoles).toEqual([
      StaffRole.teacher,
      StaffRole.customer_care,
    ]);
    expect(result.added).toEqual([StaffRole.customer_care]);
    expect(result.removed).toEqual([StaffRole.sale]);
  });

  it('cho bật role CSKH cho nhân sự chưa thuộc đội', () => {
    const result = planSaleCsHeadRoleChange({
      ...base,
      targetRoles: [StaffRole.teacher],
      requestedRoles: [StaffRole.customer_care],
    });
    expect(result.nextRoles).toEqual([
      StaffRole.teacher,
      StaffRole.customer_care,
    ]);
  });

  it('chặn tự chỉnh role của chính mình', () => {
    expect(() =>
      planSaleCsHeadRoleChange({
        ...base,
        targetStaffId: 'HEAD',
        targetRoles: [StaffRole.sale_customer_care_head],
        requestedRoles: [StaffRole.sale],
      }),
    ).toThrow(ForbiddenException);
  });

  it('chặn tài khoản admin hệ thống', () => {
    expect(() =>
      planSaleCsHeadRoleChange({
        ...base,
        targetIsAdminAccount: true,
        targetRoles: [StaffRole.sale],
        requestedRoles: [],
      }),
    ).toThrow(ForbiddenException);
  });

  it.each(PRIVILEGED_CASES)('chặn chỉnh role của %s', (_label, targetRoles) => {
    expect(() =>
      planSaleCsHeadRoleChange({
        ...base,
        targetRoles,
        requestedRoles: [StaffRole.customer_care],
      }),
    ).toThrow(ForbiddenException);
  });

  it.each([
    StaffRole.teacher,
    StaffRole.accountant_expense,
    StaffRole.sale_customer_care_head,
    StaffRole.admin,
  ])('chặn bật role ngoài phạm vi: %s', (role) => {
    expect(() =>
      planSaleCsHeadRoleChange({
        ...base,
        targetRoles: [StaffRole.sale],
        requestedRoles: [StaffRole.sale, role],
      }),
    ).toThrow(ForbiddenException);
  });

  it('chặn tắt hết role', () => {
    expect(() =>
      planSaleCsHeadRoleChange({
        ...base,
        targetRoles: [StaffRole.sale, StaffRole.customer_care],
        requestedRoles: [],
      }),
    ).toThrow(BadRequestException);
  });
});

describe('assertSaleCsHeadCanLockAccount', () => {
  it.each([
    [[StaffRole.sale]],
    [[StaffRole.customer_care]],
    [[StaffRole.sale, StaffRole.customer_care]],
  ])('cho khoá nhân sự chỉ mang %j', (targetRoles) => {
    expect(() =>
      assertSaleCsHeadCanLockAccount({ ...base, targetRoles }),
    ).not.toThrow();
    expect(canSaleCsHeadLockAccount({ ...base, targetRoles })).toBe(true);
  });

  it.each([
    ['CSKH kiêm gia sư', [StaffRole.customer_care, StaffRole.teacher]],
    ['Sale kiêm Kế toán chi', [StaffRole.sale, StaffRole.accountant_expense]],
    ['chỉ gia sư', [StaffRole.teacher]],
    ['không role', []],
    ...PRIVILEGED_CASES,
  ])('chặn khoá %s', (_label, targetRoles) => {
    expect(() =>
      assertSaleCsHeadCanLockAccount({ ...base, targetRoles }),
    ).toThrow(ForbiddenException);
    expect(canSaleCsHeadLockAccount({ ...base, targetRoles })).toBe(false);
  });

  it('chặn khoá tài khoản admin hệ thống và chính mình', () => {
    expect(() =>
      assertSaleCsHeadCanLockAccount({
        ...base,
        targetIsAdminAccount: true,
        targetRoles: [StaffRole.sale],
      }),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertSaleCsHeadCanLockAccount({
        ...base,
        targetStaffId: 'HEAD',
        targetRoles: [StaffRole.sale],
      }),
    ).toThrow(ForbiddenException);
  });
});

describe('assertSaleCsHeadCanEditProfile', () => {
  it('cho sửa hồ sơ thành viên đội (kể cả kiêm role thường khác)', () => {
    const target = {
      ...base,
      targetRoles: [StaffRole.customer_care, StaffRole.teacher],
    };
    expect(() => assertSaleCsHeadCanEditProfile(target)).not.toThrow();
    expect(canSaleCsHeadEditProfile(target)).toBe(true);
  });

  it.each([['ngoài đội', [StaffRole.teacher]], ...PRIVILEGED_CASES])(
    'chặn sửa hồ sơ %s',
    (_label, targetRoles) => {
      expect(() =>
        assertSaleCsHeadCanEditProfile({ ...base, targetRoles }),
      ).toThrow(ForbiddenException);
      expect(canSaleCsHeadEditProfile({ ...base, targetRoles })).toBe(false);
    },
  );

  it('chặn tự sửa hồ sơ qua kênh quản lý', () => {
    expect(
      canSaleCsHeadEditRoles({
        ...base,
        targetStaffId: 'HEAD',
        targetRoles: [StaffRole.sale],
      }),
    ).toBe(false);
    expect(() =>
      assertSaleCsHeadCanEditProfile({
        ...base,
        targetStaffId: 'HEAD',
        targetRoles: [StaffRole.sale],
      }),
    ).toThrow(ForbiddenException);
  });
});

describe('assertSaleCsHeadCanChangeAccountHandle (16/11)', () => {
  it.each([
    [[StaffRole.sale]],
    [[StaffRole.customer_care]],
    [[StaffRole.sale, StaffRole.customer_care]],
  ])('cho đổi tên đăng nhập nhân sự chỉ mang %j', (targetRoles) => {
    expect(() =>
      assertSaleCsHeadCanChangeAccountHandle({ ...base, targetRoles }),
    ).not.toThrow();
    expect(canSaleCsHeadChangeAccountHandle({ ...base, targetRoles })).toBe(
      true,
    );
  });

  it.each([
    // Tên đăng nhập là của cả tài khoản: kiêm role ngoài đội thì để Admin đổi.
    ['CSKH kiêm gia sư', [StaffRole.customer_care, StaffRole.teacher]],
    ['chỉ gia sư', [StaffRole.teacher]],
    ...PRIVILEGED_CASES,
  ])('chặn %s', (_label, targetRoles) => {
    expect(() =>
      assertSaleCsHeadCanChangeAccountHandle({ ...base, targetRoles }),
    ).toThrow(ForbiddenException);
    expect(canSaleCsHeadChangeAccountHandle({ ...base, targetRoles })).toBe(
      false,
    );
  });

  it('chặn chính mình và tài khoản admin hệ thống', () => {
    expect(() =>
      assertSaleCsHeadCanChangeAccountHandle({
        ...base,
        targetStaffId: 'HEAD',
        targetRoles: [StaffRole.sale],
      }),
    ).toThrow('Không thể tự đổi tên đăng nhập của chính mình.');
    expect(() =>
      assertSaleCsHeadCanChangeAccountHandle({
        ...base,
        targetIsAdminAccount: true,
        targetRoles: [StaffRole.sale],
      }),
    ).toThrow(ForbiddenException);
  });
});

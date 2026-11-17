import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StaffRole } from 'generated/enums';
import {
  assertTrainingHeadCanChangeAccountHandle,
  assertTrainingHeadCanChangeStatus,
  canTrainingHeadChangeAccountHandle,
  assertTrainingHeadCanLockAccount,
  assertTrainingHeadSubordinate,
  canTrainingHeadLockAccount,
  isTrainingHeadSubordinate,
  pickTrainingTeamRoles,
  planTrainingHeadRoleChange,
} from './training-head-role-policy';

const base = {
  actorStaffId: 'HEAD',
  targetStaffId: 'T1',
  targetIsAdminAccount: false,
};

describe('planTrainingHeadRoleChange', () => {
  it('bật/tắt 3 role quản lý được, giữ role khác và thứ tự cũ', () => {
    const result = planTrainingHeadRoleChange({
      ...base,
      targetRoles: [StaffRole.teacher, StaffRole.customer_care],
      requestedRoles: [StaffRole.lesson_plan, StaffRole.training],
    });
    expect(result.nextRoles).toEqual([
      StaffRole.customer_care,
      StaffRole.lesson_plan,
      StaffRole.training,
    ]);
    expect(result.added).toEqual([StaffRole.lesson_plan, StaffRole.training]);
    expect(result.removed).toEqual([StaffRole.teacher]);
  });

  it('không đổi gì thì added/removed rỗng', () => {
    const result = planTrainingHeadRoleChange({
      ...base,
      targetRoles: [StaffRole.sale, StaffRole.teacher],
      requestedRoles: [StaffRole.teacher],
    });
    expect(result.nextRoles).toEqual([StaffRole.sale, StaffRole.teacher]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('403 khi payload có role ngoài phạm vi', () => {
    expect(() =>
      planTrainingHeadRoleChange({
        ...base,
        targetRoles: [StaffRole.teacher],
        requestedRoles: [StaffRole.teacher, StaffRole.lesson_plan_head],
      }),
    ).toThrow(ForbiddenException);
  });

  it('chặn tài khoản admin hệ thống dù staff không mang role admin', () => {
    expect(() =>
      planTrainingHeadRoleChange({
        ...base,
        targetIsAdminAccount: true,
        targetRoles: [StaffRole.communication],
        requestedRoles: [StaffRole.teacher],
      }),
    ).toThrow(ForbiddenException);
  });

  it.each([
    StaffRole.admin,
    StaffRole.sale_customer_care_head,
    StaffRole.training_head,
    StaffRole.lesson_plan_head,
  ])('403 khi target có role %s', (role) => {
    expect(() =>
      planTrainingHeadRoleChange({
        ...base,
        targetRoles: [role, StaffRole.teacher],
        requestedRoles: [StaffRole.teacher],
      }),
    ).toThrow(ForbiddenException);
  });

  it('403 khi tự chỉnh chính mình', () => {
    expect(() =>
      planTrainingHeadRoleChange({
        actorStaffId: 'HEAD',
        targetStaffId: 'HEAD',
        targetIsAdminAccount: false,
        targetRoles: [StaffRole.teacher],
        requestedRoles: [],
      }),
    ).toThrow(ForbiddenException);
  });

  it('người ngoài ba nhóm: bật role được, không bật gì thì 403 (như khoá tài khoản)', () => {
    expect(
      planTrainingHeadRoleChange({
        ...base,
        targetRoles: [StaffRole.customer_care],
        requestedRoles: [StaffRole.teacher],
      }).added,
    ).toEqual([StaffRole.teacher]);
    expect(() =>
      planTrainingHeadRoleChange({
        ...base,
        targetRoles: [StaffRole.customer_care],
        requestedRoles: [],
      }),
    ).toThrow(ForbiddenException);
  });

  it('400 khi bỏ hết role', () => {
    expect(() =>
      planTrainingHeadRoleChange({
        ...base,
        targetRoles: [StaffRole.teacher],
        requestedRoles: [],
      }),
    ).toThrow(BadRequestException);
  });
});

describe('pickTrainingTeamRoles', () => {
  it('chỉ giữ ba role Gia sư / Ban Chuyên môn / Đào tạo, giữ thứ tự', () => {
    expect(
      pickTrainingTeamRoles([
        StaffRole.sale,
        StaffRole.training,
        StaffRole.customer_care,
        StaffRole.teacher,
      ]),
    ).toEqual([StaffRole.training, StaffRole.teacher]);
    expect(pickTrainingTeamRoles(null)).toEqual([]);
  });
});

describe('cấp dưới của Trưởng ban Đào tạo (#278)', () => {
  const target = (
    targetRoles: StaffRole[],
    overrides: Partial<typeof base> = {},
  ) => ({ ...base, targetRoles, ...overrides });

  it('người mang role ba nhóm (kể cả kiêm role khác) là cấp dưới', () => {
    expect(isTrainingHeadSubordinate(target([StaffRole.teacher]))).toBe(true);
    expect(
      isTrainingHeadSubordinate(
        target([StaffRole.lesson_plan, StaffRole.customer_care]),
      ),
    ).toBe(true);
    expect(() =>
      assertTrainingHeadSubordinate(target([StaffRole.training]), 'sửa hồ sơ'),
    ).not.toThrow();
  });

  it.each([
    ['ngoài ba nhóm', target([StaffRole.sale])],
    [
      'mang role trưởng',
      target([StaffRole.teacher, StaffRole.lesson_plan_head]),
    ],
    ['Admin', target([StaffRole.teacher, StaffRole.admin])],
    [
      'tài khoản admin hệ thống',
      target([StaffRole.teacher], { targetIsAdminAccount: true }),
    ],
    ['chính mình', target([StaffRole.teacher], { targetStaffId: 'HEAD' })],
  ])('không phải cấp dưới: %s', (_label, value) => {
    expect(isTrainingHeadSubordinate(value)).toBe(false);
    expect(() => assertTrainingHeadSubordinate(value, 'sửa hồ sơ')).toThrow(
      ForbiddenException,
    );
  });

  it('khoá / đổi trạng thái được khi chỉ mang role ba nhóm', () => {
    const value = target([StaffRole.teacher, StaffRole.training]);
    expect(canTrainingHeadLockAccount(value)).toBe(true);
    expect(() => assertTrainingHeadCanLockAccount(value)).not.toThrow();
    expect(() => assertTrainingHeadCanChangeStatus(value)).not.toThrow();
  });

  it.each([
    ['kiêm role ngoài ba nhóm', target([StaffRole.teacher, StaffRole.sale])],
    ['mang role trưởng', target([StaffRole.teacher, StaffRole.training_head])],
    ['chính mình', target([StaffRole.teacher], { targetStaffId: 'HEAD' })],
  ])('từ chối khoá / đổi trạng thái: %s', (_label, value) => {
    expect(canTrainingHeadLockAccount(value)).toBe(false);
    expect(() => assertTrainingHeadCanLockAccount(value)).toThrow(
      ForbiddenException,
    );
    expect(() => assertTrainingHeadCanChangeStatus(value)).toThrow(
      ForbiddenException,
    );
  });
});

describe('assertTrainingHeadCanChangeAccountHandle (16/11)', () => {
  const target = (
    targetRoles: StaffRole[],
    overrides: Partial<typeof base> = {},
  ) => ({ ...base, targetRoles, ...overrides });

  it('đổi được khi chỉ mang role ba nhóm', () => {
    const value = target([StaffRole.teacher, StaffRole.lesson_plan]);
    expect(canTrainingHeadChangeAccountHandle(value)).toBe(true);
    expect(() => assertTrainingHeadCanChangeAccountHandle(value)).not.toThrow();
  });

  it.each([
    ['kiêm role ngoài ba nhóm', target([StaffRole.teacher, StaffRole.sale])],
    ['ngoài ba nhóm', target([StaffRole.accountant_expense])],
    ['mang role trưởng', target([StaffRole.teacher, StaffRole.training_head])],
    ['Admin', target([StaffRole.teacher, StaffRole.admin])],
    [
      'tài khoản admin hệ thống',
      target([StaffRole.teacher], { targetIsAdminAccount: true }),
    ],
    ['chính mình', target([StaffRole.teacher], { targetStaffId: 'HEAD' })],
  ])('từ chối: %s', (_label, value) => {
    expect(canTrainingHeadChangeAccountHandle(value)).toBe(false);
    expect(() => assertTrainingHeadCanChangeAccountHandle(value)).toThrow(
      ForbiddenException,
    );
  });
});

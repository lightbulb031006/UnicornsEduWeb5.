import { ForbiddenException } from '@nestjs/common';
import { StaffRole, UserRole } from 'generated/enums';
import {
  assertCanViewStaffIncome,
  computeStaffSensitiveView,
  redactStaffRecordForView,
  resolveStaffSensitiveView,
  type StaffSensitiveView,
} from './staff-sensitive-view';
import type { StaffPolicyActor } from './staff-role-policy';

const TARGET = 'target-staff';
const VIEWER = 'viewer-staff';

function staffActor(roles: StaffRole[], staffId = VIEWER): StaffPolicyActor {
  return { isAdmin: false, staffId, roles };
}

const FULL: StaffSensitiveView = { personal: true, bank: true, income: true };
const NONE: StaffSensitiveView = {
  personal: false,
  bank: false,
  income: false,
};
const BANK_AND_INCOME: StaffSensitiveView = {
  personal: false,
  bank: true,
  income: true,
};

describe('computeStaffSensitiveView (#270)', () => {
  it.each<[string, StaffPolicyActor, StaffSensitiveView]>([
    ['Admin', { isAdmin: true, staffId: null, roles: [] }, FULL],
    [
      'Admin (staff role admin)',
      { isAdmin: true, staffId: VIEWER, roles: [StaffRole.admin] },
      FULL,
    ],
    ['chính người đó (teacher)', staffActor([StaffRole.teacher], TARGET), FULL],
    [
      'chính người đó (Kế toán thu)',
      staffActor([StaffRole.accountant_income], TARGET),
      FULL,
    ],
    [
      'Kế toán chi',
      staffActor([StaffRole.accountant_expense]),
      BANK_AND_INCOME,
    ],
    ['Kế toán thu', staffActor([StaffRole.accountant_income]), NONE],
    [
      'Trưởng phòng Sale & CSKH',
      staffActor([StaffRole.sale_customer_care_head]),
      NONE,
    ],
    ['Trưởng ban Đào tạo', staffActor([StaffRole.training_head]), NONE],
    ['Trưởng ban Chuyên môn', staffActor([StaffRole.lesson_plan_head]), NONE],
    ['Gia sư khác', staffActor([StaffRole.teacher]), NONE],
    ['CSKH khác', staffActor([StaffRole.customer_care]), NONE],
    ['không role', staffActor([]), NONE],
    [
      'Kế toán thu + Kế toán chi',
      staffActor([StaffRole.accountant_income, StaffRole.accountant_expense]),
      BANK_AND_INCOME,
    ],
    [
      'Gia sư + Kế toán chi',
      staffActor([StaffRole.teacher, StaffRole.accountant_expense]),
      BANK_AND_INCOME,
    ],
    [
      'Sale head + Kế toán thu',
      staffActor([
        StaffRole.sale_customer_care_head,
        StaffRole.accountant_income,
      ]),
      NONE,
    ],
    [
      'Trưởng ban Đào tạo + Kế toán chi',
      staffActor([StaffRole.training_head, StaffRole.accountant_expense]),
      BANK_AND_INCOME,
    ],
  ])('%s', (_label, actor, expected) => {
    expect(computeStaffSensitiveView(actor, TARGET)).toEqual(expected);
  });

  it('không coi staff chưa có hồ sơ là chính chủ khi target rỗng', () => {
    expect(
      computeStaffSensitiveView(
        { isAdmin: false, staffId: null, roles: [] },
        null,
      ),
    ).toEqual(NONE);
  });
});

describe('resolveStaffSensitiveView', () => {
  it('job nội bộ (không userId) được xem đủ', async () => {
    const db = { user: { findUnique: jest.fn() } };
    await expect(
      resolveStaffSensitiveView(db as never, undefined, TARGET),
    ).resolves.toEqual(FULL);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('đọc role từ DB cho người xem', async () => {
    const db = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          roleType: UserRole.staff,
          staffInfo: { id: VIEWER, roles: [StaffRole.accountant_income] },
        }),
      },
    };
    await expect(
      resolveStaffSensitiveView(
        db as never,
        { userId: 'u1', roleType: UserRole.staff },
        TARGET,
      ),
    ).resolves.toEqual(NONE);
  });
});

describe('assertCanViewStaffIncome', () => {
  it('chặn Kế toán thu', () => {
    expect(() =>
      assertCanViewStaffIncome(
        staffActor([StaffRole.accountant_income]),
        TARGET,
      ),
    ).toThrow(ForbiddenException);
  });

  it('cho Kế toán chi và chính chủ', () => {
    expect(() =>
      assertCanViewStaffIncome(
        staffActor([StaffRole.accountant_expense]),
        TARGET,
      ),
    ).not.toThrow();
    expect(() =>
      assertCanViewStaffIncome(staffActor([StaffRole.teacher], TARGET), TARGET),
    ).not.toThrow();
  });
});

describe('redactStaffRecordForView', () => {
  const record = {
    id: TARGET,
    province: 'Hà Nội',
    university: 'ĐHBK',
    cccdNumber: '001',
    cccdIssuedDate: new Date('2020-01-01'),
    cccdIssuedPlace: 'Hà Nội',
    ethnicity: 'Kinh',
    gender: 'male',
    currentAddress: '1 Phố Huế',
    birthDate: new Date('2000-01-01'),
    bankAccount: '123',
    bankQrLink: 'https://qr',
    classAllowance: [{ classId: 'c1', total: 1 }],
    monthlyStats: { total: 1 },
    unpaidAmountTotal: 100,
    user: {
      first_name: 'An',
      last_name: 'Nguyễn',
      email: 'an@example.com',
      phone: '0900',
    },
  };

  it('giữ nguyên khi xem đủ và gắn sensitiveView', () => {
    expect(redactStaffRecordForView(record, FULL)).toEqual({
      ...record,
      sensitiveView: FULL,
    });
  });

  it('bỏ hẳn key cá nhân, ngân hàng, thu nhập khi không được xem', () => {
    const result = redactStaffRecordForView(record, NONE) as Record<
      string,
      unknown
    >;
    for (const key of [
      'cccdNumber',
      'cccdIssuedDate',
      'cccdIssuedPlace',
      'ethnicity',
      'gender',
      'currentAddress',
      'birthDate',
      'bankAccount',
      'bankQrLink',
      'classAllowance',
      'monthlyStats',
      'unpaidAmountTotal',
    ]) {
      expect(result).not.toHaveProperty(key);
    }
    expect(result.user).toEqual({ first_name: 'An', last_name: 'Nguyễn' });
    expect(result).toMatchObject({
      id: TARGET,
      province: 'Hà Nội',
      university: 'ĐHBK',
      sensitiveView: NONE,
    });
  });

  it('Kế toán chi: giữ ngân hàng + thu nhập, bỏ thông tin cá nhân', () => {
    const result = redactStaffRecordForView(record, BANK_AND_INCOME);
    expect(result).toMatchObject({
      bankAccount: '123',
      bankQrLink: 'https://qr',
      unpaidAmountTotal: 100,
      monthlyStats: { total: 1 },
    });
    expect(result).not.toHaveProperty('cccdNumber');
    expect(result.user).not.toHaveProperty('email');
    expect(result.user).not.toHaveProperty('phone');
  });

  it('không làm hỏng bản ghi gốc và chịu được user null', () => {
    const withoutUser = { id: TARGET, cccdNumber: '1', user: null };
    const result = redactStaffRecordForView(withoutUser, NONE);
    expect(result).toEqual({ id: TARGET, user: null, sensitiveView: NONE });
    expect(withoutUser.cccdNumber).toBe('1');
    expect(record.user.email).toBe('an@example.com');
  });
});

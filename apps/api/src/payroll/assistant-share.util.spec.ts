import {
  commissionTuitionBasisVnd,
  isSelfManagedAssistantShareAttendance,
  isSelfManagedCustomerCareStaff,
  resolveAssistantManagerStaffIdForAttendance,
  resolveSaleCsHeadManagerId,
} from './assistant-share.util';
import { StaffRole } from 'generated/enums';

describe('resolveSaleCsHeadManagerId (#271)', () => {
  it('trả manager khi người quản lý còn role Trưởng phòng', () => {
    expect(
      resolveSaleCsHeadManagerId({
        customerCareManagedByStaffId: 'head-1',
        customerCareManagedBy: {
          roles: [StaffRole.sale_customer_care_head, StaffRole.customer_care],
        },
      }),
    ).toBe('head-1');
  });

  it('không ai nhận hoa hồng khi người quản lý đã mất role Trưởng phòng', () => {
    expect(
      resolveSaleCsHeadManagerId({
        customerCareManagedByStaffId: 'ex-head',
        customerCareManagedBy: { roles: [StaffRole.customer_care] },
      }),
    ).toBeNull();
  });

  it('không có người quản lý → null', () => {
    expect(
      resolveSaleCsHeadManagerId({
        customerCareManagedByStaffId: null,
        customerCareManagedBy: null,
      }),
    ).toBeNull();
  });

  it('nhiều trưởng phòng: mỗi CSKH tính cho đúng người quản lý của mình', () => {
    const headRoles = { roles: [StaffRole.sale_customer_care_head] };
    expect(
      [
        {
          customerCareManagedByStaffId: 'head-1',
          customerCareManagedBy: headRoles,
        },
        {
          customerCareManagedByStaffId: 'head-2',
          customerCareManagedBy: headRoles,
        },
      ].map(resolveSaleCsHeadManagerId),
    ).toEqual(['head-1', 'head-2']);
  });
});

describe('assistant-share.util', () => {
  it('detects self-managed staff FK', () => {
    expect(
      isSelfManagedCustomerCareStaff({
        staffId: 'a',
        customerCareManagedByStaffId: 'a',
      }),
    ).toBe(true);
    expect(
      isSelfManagedCustomerCareStaff({
        staffId: 'a',
        customerCareManagedByStaffId: 'b',
      }),
    ).toBe(false);
    expect(
      isSelfManagedCustomerCareStaff({
        staffId: 'a',
        customerCareManagedByStaffId: null,
      }),
    ).toBe(false);
  });

  it('detects self-managed attendance snapshot', () => {
    expect(
      isSelfManagedAssistantShareAttendance({
        saleCsHeadStaffId: 'x',
        customerCareStaffId: 'x',
      }),
    ).toBe(true);
    expect(
      isSelfManagedAssistantShareAttendance({
        saleCsHeadStaffId: 'x',
        customerCareStaffId: 'y',
      }),
    ).toBe(false);
  });

  it('resolves null manager when self-managed', () => {
    expect(
      resolveAssistantManagerStaffIdForAttendance({
        customerCareStaffId: 'a',
        customerCareManagedByStaffId: 'a',
      }),
    ).toBeNull();
    expect(
      resolveAssistantManagerStaffIdForAttendance({
        customerCareStaffId: 'a',
        customerCareManagedByStaffId: 'b',
      }),
    ).toBe('b');
    expect(
      resolveAssistantManagerStaffIdForAttendance({
        customerCareStaffId: null,
        customerCareManagedByStaffId: 'b',
      }),
    ).toBeNull();
  });

  it('reads the frozen basis whenever one exists, regardless of payment status', () => {
    expect(
      commissionTuitionBasisVnd({
        tuitionFee: 0,
        payrollBasisTuitionFee: 300_000,
      }),
    ).toBe(300_000);
    expect(
      commissionTuitionBasisVnd({ tuitionFee: 0, payrollBasisTuitionFee: 0 }),
    ).toBe(0);
  });

  it('falls back to tuition when no basis is frozen', () => {
    expect(
      commissionTuitionBasisVnd({
        tuitionFee: 4_500_000,
        payrollBasisTuitionFee: null,
      }),
    ).toBe(4_500_000);
    expect(commissionTuitionBasisVnd({})).toBe(0);
  });
});

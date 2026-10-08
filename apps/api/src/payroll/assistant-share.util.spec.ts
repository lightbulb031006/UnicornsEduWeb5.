import {
  commissionTuitionBasisVnd,
  isSelfManagedAssistantShareAttendance,
  isSelfManagedCustomerCareStaff,
  resolveAssistantManagerStaffIdForAttendance,
} from './assistant-share.util';

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
        assistantManagerStaffId: 'x',
        customerCareStaffId: 'x',
      }),
    ).toBe(true);
    expect(
      isSelfManagedAssistantShareAttendance({
        assistantManagerStaffId: 'x',
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

import { resolveClassTeacherCustomScaleAmountOnWrite } from './class-teacher-allowance.util';

describe('resolveClassTeacherCustomScaleAmountOnWrite', () => {
  it('preserves existing override when field is omitted', () => {
    expect(
      resolveClassTeacherCustomScaleAmountOnWrite({
        incoming: undefined,
        existingCustomScaleAmount: 40_000,
        isExistingAssignment: true,
      }),
    ).toBe(40_000);
    expect(
      resolveClassTeacherCustomScaleAmountOnWrite({
        incoming: undefined,
        existingCustomScaleAmount: 0,
        isExistingAssignment: true,
      }),
    ).toBe(0);
  });

  it('inherits class scale for a new assignment when omitted', () => {
    expect(
      resolveClassTeacherCustomScaleAmountOnWrite({
        incoming: undefined,
        existingCustomScaleAmount: undefined,
        isExistingAssignment: false,
      }),
    ).toBeNull();
  });

  it('clears override on explicit null', () => {
    expect(
      resolveClassTeacherCustomScaleAmountOnWrite({
        incoming: null,
        existingCustomScaleAmount: 40_000,
        isExistingAssignment: true,
      }),
    ).toBeNull();
  });

  it('stores 0 as a real override and floors positive amounts', () => {
    expect(
      resolveClassTeacherCustomScaleAmountOnWrite({
        incoming: 0,
        existingCustomScaleAmount: 40_000,
        isExistingAssignment: true,
      }),
    ).toBe(0);
    expect(
      resolveClassTeacherCustomScaleAmountOnWrite({
        incoming: 25_000.7,
        existingCustomScaleAmount: null,
        isExistingAssignment: false,
      }),
    ).toBe(25_000);
  });
});

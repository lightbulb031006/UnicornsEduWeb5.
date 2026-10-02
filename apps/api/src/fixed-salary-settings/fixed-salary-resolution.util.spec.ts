import { resolveFixedSalaryAxis } from './fixed-salary-resolution.util';

describe('resolveFixedSalaryAxis', () => {
  it('uses the role default when there is no override row', () => {
    expect(
      resolveFixedSalaryAxis({
        hasOverride: false,
        roleDefaultValue: 8_000_000,
      }),
    ).toEqual({
      applied: 8_000_000,
      source: 'role_default',
      hasOverride: false,
      overrideValue: null,
      roleDefaultValue: 8_000_000,
    });
  });

  it('uses a non-zero override even when the role default differs', () => {
    expect(
      resolveFixedSalaryAxis({
        hasOverride: true,
        overrideValue: 9_500_000,
        roleDefaultValue: 8_000_000,
      }),
    ).toEqual({
      applied: 9_500_000,
      source: 'override',
      hasOverride: true,
      overrideValue: 9_500_000,
      roleDefaultValue: 8_000_000,
    });
  });

  it('treats an override of 0 as an intentional exclusion, not unconfigured', () => {
    expect(
      resolveFixedSalaryAxis({
        hasOverride: true,
        overrideValue: 0,
        roleDefaultValue: 8_000_000,
      }),
    ).toEqual({
      applied: 0,
      source: 'override',
      hasOverride: true,
      overrideValue: 0,
      roleDefaultValue: 8_000_000,
    });
  });

  it('is unconfigured when there is no override and the role has no default', () => {
    expect(
      resolveFixedSalaryAxis({
        hasOverride: false,
        overrideValue: null,
        roleDefaultValue: null,
      }),
    ).toEqual({
      applied: null,
      source: 'unconfigured',
      hasOverride: false,
      overrideValue: null,
      roleDefaultValue: null,
    });
  });

  it('resolves one axis independently of another stored value', () => {
    const amount = resolveFixedSalaryAxis({
      hasOverride: false,
      roleDefaultValue: 8_000_000,
    });
    const operatingRate = resolveFixedSalaryAxis({
      hasOverride: true,
      overrideValue: 12,
      roleDefaultValue: 10,
    });

    expect(amount.source).toBe('role_default');
    expect(amount.applied).toBe(8_000_000);
    expect(operatingRate.source).toBe('override');
    expect(operatingRate.applied).toBe(12);
  });
});

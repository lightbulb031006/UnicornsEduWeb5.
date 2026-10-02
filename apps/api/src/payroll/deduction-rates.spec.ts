import { calculateDeductionAmounts } from './deduction-rates';

describe('calculateDeductionAmounts', () => {
  it('calculates tax on the amount after operating deduction', () => {
    expect(
      calculateDeductionAmounts({
        grossAmount: 100_000,
        operatingRatePercent: 10,
        taxRatePercent: 10,
      }),
    ).toEqual({
      grossAmount: 100_000,
      operatingDeductionAmount: 10_000,
      taxDeductionAmount: 9_000,
      totalDeductionAmount: 19_000,
      netAmount: 81_000,
    });
  });

  it('applies tax to the remainder after operating deduction, not to gross', () => {
    const result = calculateDeductionAmounts({
      grossAmount: 1_000_000,
      operatingRatePercent: 20,
      taxRatePercent: 10,
    });

    expect(result.operatingDeductionAmount).toBe(200_000);
    expect(result.taxDeductionAmount).toBe(80_000);
    expect(result.taxDeductionAmount).not.toBe(100_000);
    expect(result.netAmount).toBe(720_000);
  });
});

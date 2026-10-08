import { BadRequestException } from '@nestjs/common';
import { normalizeCustomerCareProfitPercent } from './customer-care-profit-percent';

describe('normalizeCustomerCareProfitPercent', () => {
  it('passes undefined and null through', () => {
    expect(normalizeCustomerCareProfitPercent(undefined)).toBeUndefined();
    expect(normalizeCustomerCareProfitPercent(null)).toBeNull();
  });

  it('rounds to two decimals as a fraction', () => {
    expect(normalizeCustomerCareProfitPercent(0.155)?.toString()).toBe('0.16');
    expect(normalizeCustomerCareProfitPercent(0)?.toString()).toBe('0');
  });

  it('rejects values outside 0.00–0.99', () => {
    expect(() => normalizeCustomerCareProfitPercent(1)).toThrow(
      BadRequestException,
    );
    expect(() => normalizeCustomerCareProfitPercent(-0.01)).toThrow(
      BadRequestException,
    );
  });
});

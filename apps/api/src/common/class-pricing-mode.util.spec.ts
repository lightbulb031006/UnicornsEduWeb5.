import { BadRequestException } from '@nestjs/common';
import {
  assertCanEnableBlockPricing,
  isBlockPricingMode,
  isFrozenSessionPaymentStatus,
  resolveSnapshotBlockCountForPricingMode,
} from './class-pricing-mode.util';

describe('class-pricing-mode.util', () => {
  it('treats omitted and per_session as not block mode', () => {
    expect(isBlockPricingMode(undefined)).toBe(false);
    expect(isBlockPricingMode('per_session')).toBe(false);
    expect(isBlockPricingMode('per_block')).toBe(true);
  });

  it('freezes paid, deposit, and cọc sessions', () => {
    expect(isFrozenSessionPaymentStatus('paid')).toBe(true);
    expect(isFrozenSessionPaymentStatus('deposit')).toBe(true);
    expect(isFrozenSessionPaymentStatus('cọc')).toBe(true);
    expect(isFrozenSessionPaymentStatus('unpaid')).toBe(false);
  });

  it('writes snapshot_block_count only in block mode', () => {
    expect(
      resolveSnapshotBlockCountForPricingMode({
        pricingMode: 'per_session',
        startTime: '19:00:00',
        endTime: '21:00:00',
        standardBlockCount: 3,
      }),
    ).toBeNull();
    expect(
      resolveSnapshotBlockCountForPricingMode({
        pricingMode: 'per_block',
        startTime: '19:00:00',
        endTime: '21:00:00',
        standardBlockCount: 3,
      }),
    ).toBe(4);
  });

  it('rejects enabling block mode without a standard block count', () => {
    expect(() => assertCanEnableBlockPricing(null)).toThrow(
      BadRequestException,
    );
  });
});

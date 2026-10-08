import { BadRequestException } from '@nestjs/common';
import {
  assertCanEnableBlockPricing,
  assertCanEnableOneTimeCourse,
  assertCourseChangeKeepsSaleMode,
  assertOneTimePackageTotal,
  resolveClassPricingModeForCourse,
  isBlockPricingMode,
  isFrozenSessionPaymentStatus,
  resolveSnapshotBlockCountForPricingMode,
} from './class-pricing-mode.util';

describe('class-pricing-mode.util', () => {
  describe('one-time course rules', () => {
    it('forces one_time on classes of a one-time course', () => {
      expect(
        resolveClassPricingModeForCourse({
          courseIsOneTime: true,
          requestedMode: 'per_block',
        }),
      ).toBe('one_time');
    });

    it('keeps per_session/per_block on regular courses and rejects one_time', () => {
      expect(resolveClassPricingModeForCourse({ courseIsOneTime: false })).toBe(
        'per_session',
      );
      expect(
        resolveClassPricingModeForCourse({
          courseIsOneTime: false,
          requestedMode: 'per_block',
        }),
      ).toBe('per_block');
      expect(() =>
        resolveClassPricingModeForCourse({
          courseIsOneTime: false,
          requestedMode: 'one_time',
        }),
      ).toThrow(BadRequestException);
    });

    it('only allows course changes within the same sale mode', () => {
      expect(() =>
        assertCourseChangeKeepsSaleMode({
          fromCourseIsOneTime: true,
          toCourseIsOneTime: true,
        }),
      ).not.toThrow();
      expect(() =>
        assertCourseChangeKeepsSaleMode({
          fromCourseIsOneTime: false,
          toCourseIsOneTime: false,
        }),
      ).not.toThrow();
      expect(() =>
        assertCourseChangeKeepsSaleMode({
          fromCourseIsOneTime: false,
          toCourseIsOneTime: true,
        }),
      ).toThrow(BadRequestException);
      expect(() =>
        assertCourseChangeKeepsSaleMode({
          fromCourseIsOneTime: true,
          toCourseIsOneTime: false,
        }),
      ).toThrow(BadRequestException);
    });

    it('requires a positive package total on one-time classes only', () => {
      expect(() =>
        assertOneTimePackageTotal({
          isOneTime: false,
          tuitionPackageTotal: null,
        }),
      ).not.toThrow();
      expect(() =>
        assertOneTimePackageTotal({ isOneTime: true, tuitionPackageTotal: 1 }),
      ).not.toThrow();
      for (const total of [null, undefined, 0, -1]) {
        expect(() =>
          assertOneTimePackageTotal({
            isOneTime: true,
            tuitionPackageTotal: total,
          }),
        ).toThrow(BadRequestException);
      }
    });

    it('blocks enabling one-time on a course that already charged tuition', () => {
      expect(() => assertCanEnableOneTimeCourse(0)).not.toThrow();
      expect(() => assertCanEnableOneTimeCourse(1)).toThrow(
        BadRequestException,
      );
    });
  });

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

import {
  blockCountFromClockRange,
  dualWritePerBlockClassFields,
  perBlockReconstructionErrorVnd,
  perSessionToPerBlock,
  presentCustomAllowanceAsPerSession,
  standardBlockCountFromSlots,
} from './block-pricing.util';

describe('block-pricing.util', () => {
  describe('blockCountFromClockRange', () => {
    it('maps 90-minute slots to 3 blocks', () => {
      expect(blockCountFromClockRange('19:00', '20:30')).toBe(3);
      expect(blockCountFromClockRange('19:00:00', '20:30:00')).toBe(3);
    });

    it('rejects durations that are not a 30-minute multiple', () => {
      expect(blockCountFromClockRange('19:00', '20:15')).toBeNull();
    });
  });

  describe('standardBlockCountFromSlots', () => {
    it('returns the shared count when every active slot agrees', () => {
      expect(
        standardBlockCountFromSlots([
          { from: '19:00:00', to: '20:30:00' },
          { from: '09:00', to: '10:30' },
        ]),
      ).toBe(3);
    });

    it('returns null when the class has no fixed schedule', () => {
      expect(standardBlockCountFromSlots([])).toBeNull();
      expect(standardBlockCountFromSlots(null)).toBeNull();
    });

    it('falls back to the greatest common block count when slots differ', () => {
      expect(
        standardBlockCountFromSlots([
          { from: '19:00', to: '20:00' },
          { from: '19:00', to: '20:30' },
        ]),
      ).toBe(1);
      // Lịch thật của UNICL-37f607c5df: 120 / 240 / 60 phút → 4, 8, 2 block.
      expect(
        standardBlockCountFromSlots([
          { from: '09:00', to: '11:00' },
          { from: '13:00', to: '17:00' },
          { from: '14:00', to: '15:00' },
        ]),
      ).toBe(2);
    });

    it('still returns null when any slot is not a 30-minute multiple', () => {
      expect(
        standardBlockCountFromSlots([
          { from: '19:00', to: '20:00' },
          { from: '19:00', to: '20:15' },
        ]),
      ).toBeNull();
    });
  });

  describe('per-session → per-block backfill', () => {
    it('keeps reconstruction error within 1đ for typical 1–3 block classes', () => {
      const samples = [0, 1, 2, 3, 100_000, 150_000, 180_000, 250_001, 999_999];
      for (const perSession of samples) {
        for (const blocks of [1, 2, 3]) {
          expect(
            perBlockReconstructionErrorVnd(perSession, blocks),
          ).toBeLessThanOrEqual(1);
        }
      }
    });

    it('presents stored per-block custom_allowance back as per-session for API', () => {
      expect(presentCustomAllowanceAsPerSession(60_000, 3, true)).toBe(180_000);
      expect(presentCustomAllowanceAsPerSession(180_000, 3, false)).toBe(
        180_000,
      );
    });

    it('leaves values null when the class has no standard block count', () => {
      expect(perSessionToPerBlock(100_000, null)).toBeNull();
      expect(
        dualWritePerBlockClassFields({
          allowancePerSessionPerStudent: 90_000,
          maxAllowancePerSession: 200_000,
          studentTuitionPerSession: 300_000,
          standardBlockCount: null,
        }),
      ).toEqual({});
    });

    it('dual-writes class per-block columns from per-session amounts', () => {
      expect(
        dualWritePerBlockClassFields({
          allowancePerSessionPerStudent: 90_000,
          maxAllowancePerSession: 210_000,
          studentTuitionPerSession: 300_000,
          standardBlockCount: 3,
        }),
      ).toEqual({
        allowancePerBlockPerStudent: 30_000,
        maxAllowancePerBlock: 70_000,
        studentTuitionPerBlock: 100_000,
      });
    });

    it('keeps an explicit student_tuition_per_block instead of deriving from the package', () => {
      expect(
        dualWritePerBlockClassFields({
          studentTuitionPerSession: 300_000,
          studentTuitionPerBlock: 50_000,
          standardBlockCount: 3,
        }),
      ).toEqual({
        studentTuitionPerBlock: 50_000,
      });
    });

    it('derives student_tuition_per_block from the package when the explicit field is empty', () => {
      expect(
        dualWritePerBlockClassFields({
          studentTuitionPerSession: 300_000,
          studentTuitionPerBlock: null,
          standardBlockCount: 3,
        }),
      ).toEqual({
        studentTuitionPerBlock: 100_000,
      });
    });
  });
});

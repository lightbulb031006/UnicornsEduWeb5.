import { ATTEMPT_TOTAL_POINTS, splitTotalPoints } from './split-total-points';

describe('splitTotalPoints', () => {
  it.each([3, 6, 7])(
    'N=%s: tổng đúng 100, không bị 99.99',
    (n: number) => {
      const parts = splitTotalPoints(ATTEMPT_TOTAL_POINTS, n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((sum, p) => sum + p, 0)).toBe(100);
      expect(parts.every((p) => Number.isInteger(p))).toBe(true);
    },
  );

  it('N=3 → 34, 33, 33', () => {
    expect(splitTotalPoints(100, 3)).toEqual([34, 33, 33]);
  });

  it('N=6 → bốn câu 17 rồi hai câu 16', () => {
    expect(splitTotalPoints(100, 6)).toEqual([17, 17, 17, 17, 16, 16]);
  });

  it('N=7 → hai câu 15 rồi năm câu 14', () => {
    expect(splitTotalPoints(100, 7)).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });

  it('N=0 → mảng rỗng', () => {
    expect(splitTotalPoints(100, 0)).toEqual([]);
  });
});

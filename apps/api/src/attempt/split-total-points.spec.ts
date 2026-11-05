import {
  ATTEMPT_TOTAL_POINTS,
  splitTotalPoints,
  splitTotalPointsByWeight,
} from './split-total-points';

describe('splitTotalPoints', () => {
  it.each([3, 6, 7])('N=%s: tổng đúng 100, không bị 99.99', (n: number) => {
    const parts = splitTotalPoints(ATTEMPT_TOTAL_POINTS, n);
    expect(parts).toHaveLength(n);
    expect(parts.reduce((sum, p) => sum + p, 0)).toBe(100);
    expect(parts.every((p) => Number.isInteger(p))).toBe(true);
  });

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

describe('splitTotalPointsByWeight', () => {
  it('trọng số bằng nhau → giống hệt chia đều', () => {
    expect(splitTotalPointsByWeight(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitTotalPointsByWeight(100, [2, 2, 2, 2, 2, 2, 2])).toEqual([
      15, 15, 14, 14, 14, 14, 14,
    ]);
  });

  it('chia đúng tỉ lệ khi không có phần dư', () => {
    expect(splitTotalPointsByWeight(100, [1, 2, 1])).toEqual([25, 50, 25]);
    expect(splitTotalPointsByWeight(100, [1, 1, 1, 2])).toEqual([
      20, 20, 20, 40,
    ]);
  });

  it('phần dư cho câu có phần lẻ lớn nhất, hoà thì câu đứng trước', () => {
    // 66,67 / 33,33 → câu 1 nhận phần dư
    expect(splitTotalPointsByWeight(100, [2, 1])).toEqual([67, 33]);
    // 14,29 / 28,57 / 57,14 → phần lẻ lớn nhất ở câu 2
    expect(splitTotalPointsByWeight(100, [1, 2, 4])).toEqual([14, 29, 57]);
    // 14,29 / 42,86 / 42,86 → dư 2, hai câu phần lẻ lớn nhất mỗi câu +1
    expect(splitTotalPointsByWeight(100, [1, 3, 3])).toEqual([14, 43, 43]);
  });

  it('tổng luôn là 100', () => {
    const parts = splitTotalPointsByWeight(100, [3, 7, 1, 1, 5, 2, 9]);
    expect(parts.reduce((s, p) => s + p, 0)).toBe(100);
  });

  it('rỗng → mảng rỗng', () => {
    expect(splitTotalPointsByWeight(100, [])).toEqual([]);
  });
});

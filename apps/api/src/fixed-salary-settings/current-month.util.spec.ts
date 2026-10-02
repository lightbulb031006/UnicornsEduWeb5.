import { getMonthKeyInTimeZone } from './current-month.util';

describe('getMonthKeyInTimeZone', () => {
  it('uses Vietnam calendar date, not UTC, around midnight', () => {
    expect(
      getMonthKeyInTimeZone(
        new Date('2026-08-31T17:30:00.000Z'),
        'Asia/Ho_Chi_Minh',
      ),
    ).toBe('2026-09');
  });
});

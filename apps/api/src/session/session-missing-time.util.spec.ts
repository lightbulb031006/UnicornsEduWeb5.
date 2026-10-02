import {
  formatMissingSessionLine,
  formatSessionDateUtc,
  MISSING_SESSION_TIME_WHERE,
} from './session-missing-time.util';

describe('session-missing-time.util', () => {
  it('filters sessions missing startTime or endTime', () => {
    expect(MISSING_SESSION_TIME_WHERE).toEqual({
      OR: [{ startTime: null }, { endTime: null }],
    });
  });

  it('formats a listing row with id, class name, and UTC date', () => {
    expect(
      formatMissingSessionLine({
        id: 'session-1',
        date: new Date('2026-03-18T00:00:00.000Z'),
        class: { name: 'Toán 10A' },
      }),
    ).toBe(
      `session-1\tToán 10A\t${formatSessionDateUtc(new Date('2026-03-18T00:00:00.000Z'))}`,
    );
  });
});

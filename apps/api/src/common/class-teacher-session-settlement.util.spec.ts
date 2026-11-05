import { ClassStatus } from '../../generated/enums';
import { buildClassEndEligibility } from './class-teacher-session-settlement.util';

describe('class-teacher-session-settlement.util', () => {
  it('allows ending a running class even with unpaid teacher sessions', () => {
    expect(
      buildClassEndEligibility(ClassStatus.running, {
        sessionCount: 3,
        unpaidSessionCount: 2,
      }),
    ).toEqual({
      sessionCount: 3,
      unpaidSessionCount: 2,
      canEnd: true,
    });
  });

  it('returns canEnd false for ended classes', () => {
    expect(
      buildClassEndEligibility(ClassStatus.ended, {
        sessionCount: 2,
        unpaidSessionCount: 0,
      }),
    ).toMatchObject({ canEnd: false });
  });
});

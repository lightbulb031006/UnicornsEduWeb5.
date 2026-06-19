import { ClassStatus } from '../../generated/enums';
import {
  buildClassEndEligibility,
  resolveClassTeacherSessionSettlementCounts,
} from './class-teacher-session-settlement.util';

describe('class-teacher-session-settlement.util', () => {
  it('allows end when all sessions are paid', () => {
    expect(resolveClassTeacherSessionSettlementCounts(5, 0)).toEqual({
      sessionCount: 5,
      unpaidSessionCount: 0,
      canEndClass: true,
      blockReason: null,
    });
  });

  it('allows end when class has zero sessions', () => {
    expect(resolveClassTeacherSessionSettlementCounts(0, 0)).toEqual({
      sessionCount: 0,
      unpaidSessionCount: 0,
      canEndClass: true,
      blockReason: null,
    });
  });

  it('blocks end when unpaid teacher sessions remain', () => {
    expect(resolveClassTeacherSessionSettlementCounts(3, 2)).toEqual({
      sessionCount: 3,
      unpaidSessionCount: 2,
      canEndClass: false,
      blockReason: 'Còn 2 buổi chưa thanh toán trợ cấp gia sư.',
    });
  });

  it('returns canEnd false for ended classes regardless of settlement', () => {
    const settlement = resolveClassTeacherSessionSettlementCounts(2, 0);
    expect(
      buildClassEndEligibility(ClassStatus.ended, settlement),
    ).toMatchObject({
      canEnd: false,
      blockReason: null,
    });
  });

  it('mirrors canEndClass for running classes', () => {
    const settlement = resolveClassTeacherSessionSettlementCounts(1, 1);
    expect(
      buildClassEndEligibility(ClassStatus.running, settlement),
    ).toMatchObject({
      canEnd: false,
      blockReason: 'Còn 1 buổi chưa thanh toán trợ cấp gia sư.',
    });
  });
});

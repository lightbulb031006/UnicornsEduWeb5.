import { AttendanceStatus } from '../../generated/enums';
import {
  planTrialCatchUp,
  resolveTrialCatchUpTargetId,
  type TrialCatchUpRow,
} from './session-trial-catch-up.service';

function row(
  attendanceId: string,
  day: number,
  overrides: Partial<TrialCatchUpRow> = {},
): TrialCatchUpRow {
  return {
    attendanceId,
    sessionId: `s-${attendanceId}`,
    status: AttendanceStatus.present,
    tuitionFee: 200_000,
    trialCatchUpFee: null,
    trialCatchUpTransactionId: null,
    trialCatchUpTransactionAmount: null,
    sessionDate: new Date(Date.UTC(2026, 9, day)),
    sessionStartTime: null,
    sessionCreatedAt: new Date(Date.UTC(2026, 9, day)),
    ...overrides,
  };
}

const trial = (day: number) =>
  row('trial', day, { status: AttendanceStatus.trial, tuitionFee: null });

describe('resolveTrialCatchUpTargetId', () => {
  it('returns null without a trial attendance', () => {
    expect(resolveTrialCatchUpTargetId([row('a', 1), row('b', 2)])).toBeNull();
  });

  it('picks the first present/excused session after the trial, skipping absences and earlier sessions', () => {
    expect(
      resolveTrialCatchUpTargetId([
        row('after-2', 5, { status: AttendanceStatus.excused }),
        row('absent', 3, {
          status: AttendanceStatus.absent,
          tuitionFee: null,
        }),
        trial(2),
        row('before', 1),
        row('after-3', 7),
      ]),
    ).toBe('after-2');
  });

  it('skips sessions with zero tuition', () => {
    expect(
      resolveTrialCatchUpTargetId([
        trial(1),
        row('free', 2, { tuitionFee: 0 }),
        row('paid', 3),
      ]),
    ).toBe('paid');
  });
});

describe('planTrialCatchUp', () => {
  it('charges the target once when nothing was collected yet', () => {
    expect(planTrialCatchUp([trial(1), row('next', 2)])).toEqual([
      { kind: 'charge', attendanceId: 'next', baseFee: 200_000 },
    ]);
  });

  it('does nothing when the target already holds a folded catch-up of the right amount', () => {
    expect(
      planTrialCatchUp([
        trial(1),
        row('next', 2, {
          tuitionFee: 400_000,
          trialCatchUpFee: 200_000,
          trialCatchUpTransactionId: 'tx',
          trialCatchUpTransactionAmount: 200_000,
        }),
      ]),
    ).toEqual([]);
  });

  it('re-folds the target after a session update wrote back the base fee', () => {
    expect(
      planTrialCatchUp([
        trial(1),
        row('next', 2, {
          trialCatchUpTransactionId: 'tx',
          trialCatchUpTransactionAmount: 200_000,
        }),
      ]),
    ).toEqual([
      { kind: 'fold', attendanceId: 'next', baseFee: 200_000, amount: 200_000 },
    ]);
  });

  it('moves the catch-up to the next eligible session when the holder turns absent', () => {
    expect(
      planTrialCatchUp([
        trial(1),
        row('was-target', 2, {
          status: AttendanceStatus.absent,
          tuitionFee: null,
          trialCatchUpTransactionId: 'tx',
          trialCatchUpTransactionAmount: 200_000,
        }),
        row('new-target', 3, { tuitionFee: 250_000 }),
      ]),
    ).toEqual([
      {
        kind: 'release',
        attendanceId: 'was-target',
        baseFee: 0,
        amount: 200_000,
      },
      { kind: 'charge', attendanceId: 'new-target', baseFee: 250_000 },
    ]);
  });

  it('refunds the catch-up when the trial is gone', () => {
    expect(
      planTrialCatchUp([
        row('held', 2, {
          tuitionFee: 400_000,
          trialCatchUpFee: 200_000,
          trialCatchUpTransactionId: 'tx',
          trialCatchUpTransactionAmount: 200_000,
        }),
      ]),
    ).toEqual([
      {
        kind: 'release',
        attendanceId: 'held',
        baseFee: 200_000,
        amount: 200_000,
      },
    ]);
  });

  it('re-charges when the target tuition changed', () => {
    expect(
      planTrialCatchUp([
        trial(1),
        row('next', 2, {
          tuitionFee: 300_000,
          trialCatchUpTransactionId: 'tx',
          trialCatchUpTransactionAmount: 200_000,
        }),
      ]),
    ).toEqual([
      {
        kind: 'release',
        attendanceId: 'next',
        baseFee: 300_000,
        amount: 200_000,
      },
      { kind: 'charge', attendanceId: 'next', baseFee: 300_000 },
    ]);
  });
});

import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/client';
import { AttendanceStatus, WalletTransactionType } from '../../generated/enums';
import { syncLessonPlanHeadCommissions } from '../payroll/lesson-plan-head-commission.util';
import { SessionLedgerService } from './session-ledger.service';
import { SessionStudentBalanceService } from './session-student-balance.service';

type Tx = Prisma.TransactionClient;

export interface TrialCatchUpPair {
  studentId: string;
  classId: string;
}

/** Một dòng điểm danh của học sinh trên lớp, đã sắp theo thứ tự buổi. */
export interface TrialCatchUpRow {
  attendanceId: string;
  sessionId: string;
  status: AttendanceStatus;
  tuitionFee: number | null;
  /** Phần thu bù đang gộp trong `tuitionFee` (null = chưa gộp). */
  trialCatchUpFee: number | null;
  trialCatchUpTransactionId: string | null;
  /** Số tiền dòng ví thu bù đã trừ thật. */
  trialCatchUpTransactionAmount: number | null;
  sessionDate: Date;
  sessionStartTime: Date | null;
  sessionCreatedAt: Date;
}

export type TrialCatchUpAction =
  /** Buổi đích đã thu bù đúng số tiền: chỉ cần gộp lại vào `tuitionFee` nếu lệch. */
  | { kind: 'fold'; attendanceId: string; baseFee: number; amount: number }
  /** Hoàn dòng thu bù ở buổi không còn là đích (hoặc số tiền lệch). */
  | { kind: 'release'; attendanceId: string; baseFee: number; amount: number }
  /** Gỡ phần gộp mồ côi (không còn dòng ví). */
  | { kind: 'unfold'; attendanceId: string; baseFee: number }
  /** Trừ ví lần thu bù ở buổi đích. */
  | { kind: 'charge'; attendanceId: string; baseFee: number };

const CHARGEABLE_STATUSES = new Set<AttendanceStatus>([
  AttendanceStatus.present,
  AttendanceStatus.excused,
]);

export function baseTuitionFee(
  row: Pick<TrialCatchUpRow, 'tuitionFee' | 'trialCatchUpFee'>,
) {
  return Math.max(0, (row.tuitionFee ?? 0) - (row.trialCatchUpFee ?? 0));
}

export function compareSessionOrder(
  a: Pick<
    TrialCatchUpRow,
    'sessionDate' | 'sessionStartTime' | 'sessionCreatedAt'
  >,
  b: Pick<
    TrialCatchUpRow,
    'sessionDate' | 'sessionStartTime' | 'sessionCreatedAt'
  >,
) {
  return (
    a.sessionDate.getTime() - b.sessionDate.getTime() ||
    (a.sessionStartTime?.getTime() ?? 0) -
      (b.sessionStartTime?.getTime() ?? 0) ||
    a.sessionCreatedAt.getTime() - b.sessionCreatedAt.getTime()
  );
}

/**
 * Buổi thu bù = buổi present/excused đầu tiên có học phí > 0, sau buổi học thử, cùng lớp.
 * Không có buổi học thử → không có buổi đích.
 */
export function resolveTrialCatchUpTargetId(
  rows: TrialCatchUpRow[],
): string | null {
  const ordered = [...rows].sort(compareSessionOrder);
  const trialIndex = ordered.findIndex(
    (row) => row.status === AttendanceStatus.trial,
  );
  if (trialIndex < 0) return null;

  const target = ordered
    .slice(trialIndex + 1)
    .find(
      (row) => CHARGEABLE_STATUSES.has(row.status) && baseTuitionFee(row) > 0,
    );
  return target?.attendanceId ?? null;
}

/** Tính các thao tác đưa ví + `tuitionFee` của một cặp học sinh–lớp về trạng thái đúng. */
export function planTrialCatchUp(
  rows: TrialCatchUpRow[],
): TrialCatchUpAction[] {
  const targetId = resolveTrialCatchUpTargetId(rows);
  const actions: TrialCatchUpAction[] = [];
  let targetSatisfied = false;

  for (const row of rows) {
    const baseFee = baseTuitionFee(row);
    if (row.trialCatchUpTransactionId) {
      const amount = Math.max(0, row.trialCatchUpTransactionAmount ?? 0);
      if (row.attendanceId === targetId && amount === baseFee) {
        targetSatisfied = true;
        if (row.trialCatchUpFee !== amount) {
          actions.push({
            kind: 'fold',
            attendanceId: row.attendanceId,
            baseFee,
            amount,
          });
        }
      } else {
        actions.push({
          kind: 'release',
          attendanceId: row.attendanceId,
          baseFee,
          amount,
        });
      }
    } else if (row.trialCatchUpFee != null) {
      actions.push({ kind: 'unfold', attendanceId: row.attendanceId, baseFee });
    }
  }

  if (targetId && !targetSatisfied) {
    const target = rows.find((row) => row.attendanceId === targetId);
    if (target) {
      actions.push({
        kind: 'charge',
        attendanceId: targetId,
        baseFee: baseTuitionFee(target),
      });
    }
  }

  return actions;
}

@Injectable()
export class SessionTrialCatchUpService {
  constructor(
    private readonly sessionLedgerService: SessionLedgerService,
    private readonly sessionStudentBalanceService: SessionStudentBalanceService,
  ) {}

  /**
   * Học thử chỉ hợp lệ khi: lớp không bán một lần, học sinh chưa có buổi học thử khác trên lớp,
   * và chưa từng học chính thức (present/excused, kể cả học phí 0đ) hay bị thu học phí
   * trên lớp trước buổi này.
   */
  async assertTrialAttendanceAllowed(
    tx: Tx,
    params: {
      classId: string;
      isOneTimeClass: boolean;
      sessionId?: string | null;
      sessionDate: Date;
      sessionStartTime: Date | null;
      trialStudentIds: string[];
    },
  ) {
    const studentIds = [...new Set(params.trialStudentIds)];
    if (studentIds.length === 0) return;
    if (params.isOneTimeClass) {
      throw new BadRequestException('Lớp bán một lần không có học thử.');
    }

    const otherAttendances = await tx.attendance.findMany({
      where: {
        studentId: { in: studentIds },
        session: {
          classId: params.classId,
          ...(params.sessionId ? { id: { not: params.sessionId } } : {}),
        },
        OR: [
          { status: AttendanceStatus.trial },
          { status: { in: [...CHARGEABLE_STATUSES] } },
          { transactionId: { not: null } },
        ],
      },
      select: {
        studentId: true,
        status: true,
        student: { select: { fullName: true } },
        session: { select: { date: true, startTime: true, createdAt: true } },
      },
    });

    const current = {
      sessionDate: params.sessionDate,
      sessionStartTime: params.sessionStartTime,
      sessionCreatedAt: new Date(8_640_000_000_000_000),
    };
    for (const row of otherAttendances) {
      const name = row.student.fullName;
      if (row.status === AttendanceStatus.trial) {
        throw new BadRequestException(
          `${name} đã có một buổi học thử trên lớp này.`,
        );
      }
      const studiedBefore =
        compareSessionOrder(
          {
            sessionDate: row.session.date,
            sessionStartTime: row.session.startTime,
            sessionCreatedAt: row.session.createdAt,
          },
          current,
        ) < 0;
      if (studiedBefore) {
        throw new BadRequestException(
          `${name} đã học chính thức trên lớp này nên không thể học thử.`,
        );
      }
    }
  }

  /**
   * Hoàn dòng thu bù của các điểm danh sắp bị xoá (xoá buổi / bỏ học sinh khỏi buổi).
   * Phải gọi trước khi xoá vì xoá điểm danh làm mất liên kết tới dòng ví thu bù.
   */
  async releaseBeforeDelete(tx: Tx, attendanceIds: string[]) {
    if (attendanceIds.length === 0) return;
    const rows = await tx.attendance.findMany({
      where: {
        id: { in: attendanceIds },
        trialCatchUpTransactionId: { not: null },
      },
      select: {
        id: true,
        studentId: true,
        trialCatchUpTransaction: { select: { amount: true } },
        session: { select: { date: true, class: { select: { name: true } } } },
      },
    });

    for (const row of rows) {
      await this.refund(tx, {
        attendanceId: row.id,
        studentId: row.studentId,
        amount: row.trialCatchUpTransaction?.amount ?? 0,
        className: row.session.class.name,
        dateLabel: toDateLabel(row.session.date),
      });
    }
  }

  /** Đưa thu bù học thử của từng cặp học sinh–lớp về đúng buổi đích. */
  async reconcile(tx: Tx, pairs: TrialCatchUpPair[]) {
    const uniquePairs = [
      ...new Map(
        pairs.map((pair) => [`${pair.studentId}|${pair.classId}`, pair]),
      ).values(),
    ];
    if (uniquePairs.length === 0) return;
    const studentIdsByClassId = new Map<string, string[]>();
    for (const pair of uniquePairs) {
      studentIdsByClassId.set(pair.classId, [
        ...(studentIdsByClassId.get(pair.classId) ?? []),
        pair.studentId,
      ]);
    }
    // Chỉ cặp nào có dính học thử / thu bù mới cần đối soát.
    const candidates = await tx.attendance.findMany({
      where: {
        OR: [...studentIdsByClassId.entries()].map(([classId, studentIds]) => ({
          studentId: { in: studentIds },
          session: { classId },
        })),
        AND: {
          OR: [
            { status: AttendanceStatus.trial },
            { trialCatchUpTransactionId: { not: null } },
            { trialCatchUpFee: { not: null } },
          ],
        },
      },
      select: { studentId: true, session: { select: { classId: true } } },
    });
    const candidateKeys = new Set(
      candidates.map((row) => `${row.studentId}|${row.session.classId}`),
    );
    const touchedSessionIds = new Set<string>();
    const touchedAttendanceIds: string[] = [];

    for (const pair of uniquePairs) {
      if (!candidateKeys.has(`${pair.studentId}|${pair.classId}`)) continue;
      const attendances = await tx.attendance.findMany({
        where: {
          studentId: pair.studentId,
          session: { classId: pair.classId },
        },
        select: {
          id: true,
          sessionId: true,
          status: true,
          tuitionFee: true,
          trialCatchUpFee: true,
          trialCatchUpTransactionId: true,
          trialCatchUpTransaction: { select: { amount: true } },
          session: {
            select: {
              date: true,
              startTime: true,
              createdAt: true,
              class: { select: { name: true } },
            },
          },
        },
      });
      if (attendances.length === 0) continue;

      const rows: TrialCatchUpRow[] = attendances.map((row) => ({
        attendanceId: row.id,
        sessionId: row.sessionId,
        status: row.status,
        tuitionFee: row.tuitionFee,
        trialCatchUpFee: row.trialCatchUpFee,
        trialCatchUpTransactionId: row.trialCatchUpTransactionId,
        trialCatchUpTransactionAmount:
          row.trialCatchUpTransaction?.amount ?? null,
        sessionDate: row.session.date,
        sessionStartTime: row.session.startTime,
        sessionCreatedAt: row.session.createdAt,
      }));
      const actions = planTrialCatchUp(rows);
      if (actions.length === 0) continue;

      const byId = new Map(attendances.map((row) => [row.id, row]));
      const trialRow = [...rows]
        .sort(compareSessionOrder)
        .find((row) => row.status === AttendanceStatus.trial);

      for (const action of actions) {
        const attendance = byId.get(action.attendanceId);
        if (!attendance) continue;
        touchedSessionIds.add(attendance.sessionId);
        touchedAttendanceIds.push(attendance.id);
        const className = attendance.session.class.name;
        const dateLabel = toDateLabel(attendance.session.date);

        if (action.kind === 'fold') {
          await tx.attendance.update({
            where: { id: attendance.id },
            data: {
              tuitionFee: action.baseFee + action.amount,
              trialCatchUpFee: action.amount,
            },
          });
        } else if (action.kind === 'unfold') {
          await tx.attendance.update({
            where: { id: attendance.id },
            data: { tuitionFee: action.baseFee, trialCatchUpFee: null },
          });
        } else if (action.kind === 'release') {
          await this.refund(tx, {
            attendanceId: attendance.id,
            studentId: pair.studentId,
            amount: action.amount,
            className,
            dateLabel,
          });
          await tx.attendance.update({
            where: { id: attendance.id },
            data: {
              tuitionFee: attendance.tuitionFee == null ? null : action.baseFee,
              trialCatchUpFee: null,
            },
          });
        } else {
          const student = await tx.studentInfo.findUnique({
            where: { id: pair.studentId },
            select: { accountBalance: true },
          });
          await this.sessionStudentBalanceService.applyBalanceChanges(tx, [
            { studentId: pair.studentId, change: -action.baseFee },
          ]);
          const transaction = await tx.walletTransactionsHistory.create({
            data: {
              studentId: pair.studentId,
              type: WalletTransactionType.extend,
              amount: action.baseFee,
              note: this.sessionLedgerService.buildTrialCatchUpChargeNote({
                className,
                dateLabel,
                trialDateLabel: trialRow
                  ? toDateLabel(trialRow.sessionDate)
                  : dateLabel,
                balanceBefore: student?.accountBalance ?? 0,
                amount: action.baseFee,
              }),
            },
          });
          await tx.attendance.update({
            where: { id: attendance.id },
            data: {
              tuitionFee: action.baseFee * 2,
              trialCatchUpFee: action.baseFee,
              trialCatchUpTransactionId: transaction.id,
            },
          });
        }
      }
    }

    await this.refreshSessionTotals(tx, [...touchedSessionIds]);
    await syncLessonPlanHeadCommissions(tx, touchedAttendanceIds);
  }

  private async refund(
    tx: Tx,
    params: {
      attendanceId: string;
      studentId: string;
      amount: number;
      className: string;
      dateLabel: string;
    },
  ) {
    await tx.attendance.update({
      where: { id: params.attendanceId },
      data: { trialCatchUpTransactionId: null },
    });
    if (params.amount <= 0) return;

    const student = await tx.studentInfo.findUnique({
      where: { id: params.studentId },
      select: { accountBalance: true },
    });
    await this.sessionStudentBalanceService.applyBalanceChanges(tx, [
      { studentId: params.studentId, change: params.amount },
    ]);
    await tx.walletTransactionsHistory.create({
      data: {
        studentId: params.studentId,
        type: WalletTransactionType.topup,
        amount: params.amount,
        note: this.sessionLedgerService.buildTrialCatchUpRefundNote({
          className: params.className,
          dateLabel: params.dateLabel,
          balanceBefore: student?.accountBalance ?? 0,
          amount: params.amount,
        }),
      },
    });
  }

  /** `sessions.tuition_fee` và hoa hồng Quản lý đào tạo theo tổng học phí mới của buổi. */
  private async refreshSessionTotals(tx: Tx, sessionIds: string[]) {
    for (const sessionId of sessionIds) {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        select: {
          trainingManagerStaffId: true,
          trainingManagerRatePercent: true,
          attendance: { select: { tuitionFee: true } },
        },
      });
      if (!session) continue;
      const total = session.attendance.reduce(
        (sum, row) => sum + (row.tuitionFee ?? 0),
        0,
      );
      const rate = Number(session.trainingManagerRatePercent ?? 0);
      const allowance =
        session.trainingManagerStaffId && rate > 0
          ? Math.round((total * rate) / 100)
          : null;
      await tx.session.update({
        where: { id: sessionId },
        data: {
          tuitionFee: total,
          ...(session.trainingManagerStaffId
            ? {
                trainingManagerAllowanceAmount:
                  allowance && allowance > 0 ? allowance : null,
              }
            : {}),
        },
      });
    }
  }
}

function toDateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

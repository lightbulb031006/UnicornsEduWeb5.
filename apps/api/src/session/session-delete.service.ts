import { Injectable, NotFoundException } from '@nestjs/common';
import { WalletTransactionType } from '../../generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from '../action-history/action-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionLedgerService } from './session-ledger.service';
import { SessionSnapshotService } from './session-snapshot.service';
import { SessionStudentBalanceService } from './session-student-balance.service';
import { SessionTrialCatchUpService } from './session-trial-catch-up.service';

@Injectable()
export class SessionDeleteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionStudentBalanceService: SessionStudentBalanceService,
    private readonly sessionLedgerService: SessionLedgerService,
    private readonly sessionSnapshotService: SessionSnapshotService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly sessionTrialCatchUpService: SessionTrialCatchUpService,
  ) {}

  async deleteSession(id: string, actor?: ActionHistoryActor) {
    const deletedSession = await this.prisma.$transaction(async (tx) => {
      const existingSession = await tx.session.findUnique({
        where: { id },
        include: {
          class: { select: { name: true } },
          attendance: {
            include: {
              student: { select: { accountBalance: true } },
              transaction: true,
            },
          },
        },
      });

      if (!existingSession) {
        throw new NotFoundException('Session not found');
      }
      const beforeValue = actor
        ? await this.sessionSnapshotService.getSessionAuditSnapshot(tx, id)
        : null;

      const sessionDateLabel = existingSession.date.toISOString().slice(0, 10);
      const studentBalanceChanges = Array.from(
        existingSession.attendance
          .reduce((acc, attendanceItem) => {
            const changeAmount =
              this.sessionLedgerService.getAttendanceChargeAmount(
                attendanceItem,
              );

            if (changeAmount <= 0) {
              return acc;
            }

            const currentItem = acc.get(attendanceItem.studentId);
            acc.set(attendanceItem.studentId, {
              studentId: attendanceItem.studentId,
              change: (currentItem?.change ?? 0) + changeAmount,
              accountBalance:
                currentItem?.accountBalance ??
                attendanceItem.student.accountBalance ??
                0,
            });
            return acc;
          }, new Map<string, { studentId: string; change: number; accountBalance: number }>())
          .values(),
      );

      await this.sessionStudentBalanceService.applyBalanceChanges(
        tx,
        studentBalanceChanges.map((balanceChange) => ({
          studentId: balanceChange.studentId,
          change: balanceChange.change,
        })),
      );

      if (studentBalanceChanges.length > 0) {
        await tx.walletTransactionsHistory.createMany({
          data: studentBalanceChanges.map((balanceChange) => ({
            studentId: balanceChange.studentId,
            type: WalletTransactionType.topup,
            amount: balanceChange.change,
            note: this.sessionLedgerService.buildRefundNote({
              className: existingSession.class.name,
              dateLabel: sessionDateLabel,
              balanceBefore: balanceChange.accountBalance,
              amount: balanceChange.change,
            }),
          })),
        });
      }

      await this.sessionTrialCatchUpService.releaseBeforeDelete(
        tx,
        existingSession.attendance.map((attendanceItem) => attendanceItem.id),
      );

      const deletedSession = await tx.session.delete({
        where: { id },
      });

      // Xoá buổi thử → hoàn thu bù; xoá buổi thu bù → dời sang buổi đủ điều kiện kế tiếp.
      await this.sessionTrialCatchUpService.reconcile(
        tx,
        existingSession.attendance.map((attendanceItem) => ({
          studentId: attendanceItem.studentId,
          classId: existingSession.classId,
        })),
      );

      if (actor && beforeValue) {
        await this.actionHistoryService.recordDelete(tx, {
          actor,
          entityType: 'session',
          entityId: id,
          description: 'Xóa buổi học',
          beforeValue,
        });
      }

      return deletedSession;
    });

    return deletedSession;
  }
}

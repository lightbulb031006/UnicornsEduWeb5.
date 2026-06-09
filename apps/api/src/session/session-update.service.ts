import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/client';
import {
  PaymentStatus,
  SessionPaymentStatus,
  StaffRole,
  StudentClassStatus,
  UserRole,
  WalletTransactionType,
} from '../../generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from '../action-history/action-history.service';
import {
  SessionBulkPaymentStatusUpdateResult,
  SessionUpdateDto,
} from '../dtos/session.dto';
import { PrismaService } from '../prisma/prisma.service';
import { StaffOperationsAccessService } from '../staff-ops/staff-operations-access.service';
import { SessionLedgerService } from './session-ledger.service';
import { SessionRosterService } from './session-roster.service';
import { SessionSnapshotService } from './session-snapshot.service';
import { SessionStudentBalanceService } from './session-student-balance.service';
import { SessionValidationService } from './session-validation.service';
import {
  createMemoizedTaxDeductionResolver,
  normalizePercent,
  resolveTaxDeductionRate,
} from '../payroll/deduction-rates';
import { resolveAssistantManagerStaffIdForAttendance } from '../payroll/assistant-share.util';
import {
  computeDefaultSessionAllowanceAmountVnd,
  hasSessionAllowanceSnapshots,
} from './session-allowance.util';

const SESSION_UPDATE_TRANSACTION_MAX_WAIT_MS = 10_000;
const SESSION_UPDATE_TRANSACTION_TIMEOUT_MS = 20_000;
const DEPOSIT_SESSION_PAYMENT_STATUSES = new Set<string>([
  SessionPaymentStatus.deposit,
  'deposite',
  'coc',
  'cọc',
]);

type TeacherPaymentSnapshotSession = {
  id: string;
  classId: string;
  teacherId: string;
  teacherPaymentStatus: string | null;
};

type TeacherPaymentRateSnapshot = {
  teacherOperatingDeductionRatePercent: number;
  teacherTaxDeductionRatePercent: number;
};

function isDepositSessionPaymentStatus(value?: string | null) {
  return DEPOSIT_SESSION_PAYMENT_STATUSES.has(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );
}

function normalizeSessionPaymentStatus(
  value?: string | null,
): SessionPaymentStatus {
  const normalized = String(value ?? SessionPaymentStatus.unpaid).toLowerCase();

  if (normalized === SessionPaymentStatus.paid) {
    return SessionPaymentStatus.paid;
  }

  if (isDepositSessionPaymentStatus(normalized)) {
    return SessionPaymentStatus.deposit;
  }

  return SessionPaymentStatus.unpaid;
}

@Injectable()
export class SessionUpdateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
    private readonly sessionRosterService: SessionRosterService,
    private readonly sessionValidationService: SessionValidationService,
    private readonly sessionStudentBalanceService: SessionStudentBalanceService,
    private readonly sessionLedgerService: SessionLedgerService,
    private readonly sessionSnapshotService: SessionSnapshotService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

  private async resolveTeacherPaymentRateSnapshot(
    db: Prisma.TransactionClient,
    params: {
      classId: string;
      teacherId: string;
      effectiveDate: Date;
    },
  ): Promise<TeacherPaymentRateSnapshot> {
    const classTeacher = await db.classTeacher.findUnique({
      where: {
        classId_teacherId: {
          classId: params.classId,
          teacherId: params.teacherId,
        },
      },
      select: {
        operatingDeductionRatePercent: true,
      },
    });
    const teacherOperatingDeductionRatePercent = normalizePercent(
      classTeacher?.operatingDeductionRatePercent,
    );

    const teacherTaxDeductionRatePercent = await resolveTaxDeductionRate(db, {
      staffId: params.teacherId,
      roleType: StaffRole.teacher,
      effectiveDate: params.effectiveDate,
    });

    return {
      teacherOperatingDeductionRatePercent,
      teacherTaxDeductionRatePercent,
    };
  }

  private async updateTeacherPaymentStatusesWithSnapshots(
    db: Prisma.TransactionClient,
    sessions: TeacherPaymentSnapshotSession[],
    teacherPaymentStatus: SessionPaymentStatus,
  ) {
    const sessionIds = sessions.map((session) => session.id);

    if (sessionIds.length === 0) {
      return 0;
    }

    if (teacherPaymentStatus !== SessionPaymentStatus.paid) {
      const updateResult = await db.session.updateMany({
        where: {
          id: {
            in: sessionIds,
          },
        },
        data: {
          teacherPaymentStatus,
          teacherOperatingDeductionRatePercent: 0,
          teacherTaxDeductionRatePercent: 0,
        },
      });
      return updateResult.count;
    }

    const depositSessionIds = sessions
      .filter((session) =>
        isDepositSessionPaymentStatus(session.teacherPaymentStatus),
      )
      .map((session) => session.id);
    const depositSessionIdSet = new Set(depositSessionIds);
    const regularSessions = sessions.filter(
      (session) => !depositSessionIdSet.has(session.id),
    );
    let updatedCount = 0;

    if (depositSessionIds.length > 0) {
      const updateResult = await db.session.updateMany({
        where: {
          id: {
            in: depositSessionIds,
          },
        },
        data: {
          teacherPaymentStatus,
          teacherOperatingDeductionRatePercent: 0,
          teacherTaxDeductionRatePercent: 0,
        },
      });
      updatedCount += updateResult.count;
    }

    const paymentEffectiveDate = new Date();
    const groupedRegularSessionIds = new Map<
      string,
      TeacherPaymentRateSnapshot & { ids: string[] }
    >();

    for (const session of regularSessions) {
      const snapshot = await this.resolveTeacherPaymentRateSnapshot(db, {
        classId: session.classId,
        teacherId: session.teacherId,
        effectiveDate: paymentEffectiveDate,
      });
      const key = `${snapshot.teacherOperatingDeductionRatePercent}:${snapshot.teacherTaxDeductionRatePercent}`;
      const current = groupedRegularSessionIds.get(key) ?? {
        ...snapshot,
        ids: [],
      };
      current.ids.push(session.id);
      groupedRegularSessionIds.set(key, current);
    }

    for (const snapshot of groupedRegularSessionIds.values()) {
      const updateResult = await db.session.updateMany({
        where: {
          id: {
            in: snapshot.ids,
          },
        },
        data: {
          teacherPaymentStatus,
          teacherOperatingDeductionRatePercent:
            snapshot.teacherOperatingDeductionRatePercent,
          teacherTaxDeductionRatePercent:
            snapshot.teacherTaxDeductionRatePercent,
        },
      });
      updatedCount += updateResult.count;
    }

    return updatedCount;
  }

  async updateSessionPaymentStatuses(
    sessionIds: string[],
    teacherPaymentStatus: SessionPaymentStatus,
    actor?: ActionHistoryActor,
  ): Promise<SessionBulkPaymentStatusUpdateResult> {
    const uniqueSessionIds = Array.from(
      new Set(
        sessionIds.filter(
          (sessionId): sessionId is string =>
            typeof sessionId === 'string' && sessionId.trim().length > 0,
        ),
      ),
    );

    if (uniqueSessionIds.length === 0) {
      throw new BadRequestException('sessionIds must contain at least one id.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const existingSessions = await tx.session.findMany({
          where: {
            id: {
              in: uniqueSessionIds,
            },
          },
          select: {
            id: true,
            classId: true,
            teacherId: true,
            teacherPaymentStatus: true,
          },
        });

        if (existingSessions.length !== uniqueSessionIds.length) {
          const existingIds = new Set(
            existingSessions.map((session) => session.id),
          );
          const missingSessionId = uniqueSessionIds.find(
            (sessionId) => !existingIds.has(sessionId),
          );

          throw new NotFoundException(
            missingSessionId
              ? `Session not found: ${missingSessionId}`
              : 'Session not found',
          );
        }

        const changedSessions = existingSessions.filter(
          (session) =>
            normalizeSessionPaymentStatus(session.teacherPaymentStatus) !==
            teacherPaymentStatus,
        );
        const changedSessionIds = changedSessions.map((session) => session.id);

        if (changedSessionIds.length === 0) {
          return {
            requestedCount: uniqueSessionIds.length,
            updatedCount: 0,
          };
        }

        const beforeValueBySessionId = actor
          ? await this.sessionSnapshotService.getSessionAuditSnapshots(
              tx,
              changedSessionIds,
            )
          : new Map<string, unknown>();

        const updatedCount =
          await this.updateTeacherPaymentStatusesWithSnapshots(
            tx,
            changedSessions,
            teacherPaymentStatus,
          );

        if (actor) {
          const afterValueBySessionId =
            await this.sessionSnapshotService.getSessionAuditSnapshots(
              tx,
              changedSessionIds,
            );

          for (const sessionId of changedSessionIds) {
            await this.actionHistoryService.recordUpdate(tx, {
              actor,
              entityType: 'session',
              entityId: sessionId,
              description: 'Cập nhật trạng thái thanh toán buổi học',
              beforeValue: beforeValueBySessionId.get(sessionId) ?? null,
              afterValue: afterValueBySessionId.get(sessionId) ?? null,
            });
          }
        }

        return {
          requestedCount: uniqueSessionIds.length,
          updatedCount,
        };
      },
      {
        maxWait: SESSION_UPDATE_TRANSACTION_MAX_WAIT_MS,
        timeout: SESSION_UPDATE_TRANSACTION_TIMEOUT_MS,
      },
    );
  }

  async updateSession(data: SessionUpdateDto, actor?: ActionHistoryActor) {
    if (!data.id) {
      throw new BadRequestException('Session id is required');
    }

    this.sessionValidationService.validateAttendanceItems(data.attendance, {
      required: false,
    });

    const sessionId = data.id;

    const updatedSession = await this.prisma.$transaction(
      async (tx) => {
        const beforeValue = actor
          ? await this.sessionSnapshotService.getSessionAuditSnapshot(
              tx,
              sessionId,
            )
          : null;
        const existingSession = await tx.session.findUnique({
          where: { id: sessionId },
          select: {
            id: true,
            classId: true,
            teacherId: true,
            date: true,
            teacherPaymentStatus: true,
            snapshotPerStudentAllowance: true,
            snapshotScaleAmount: true,
            class: {
              select: {
                name: true,
              },
            },
            attendance: {
              select: {
                id: true,
                studentId: true,
                status: true,
                notes: true,
                tuitionFee: true,
                customerCareCoef: true,
                customerCareStaffId: true,
                customerCarePaymentStatus: true,
                assistantManagerStaffId: true,
                assistantPaymentStatus: true,
                transactionId: true,
                transaction: {
                  select: {
                    id: true,
                    amount: true,
                  },
                },
                student: {
                  select: {
                    accountBalance: true,
                  },
                },
              },
            },
          },
        });

        if (!existingSession) {
          throw new NotFoundException('Session not found');
        }

        const nextClassId = data.classId ?? existingSession.classId;
        const nextTeacherId = data.teacherId ?? existingSession.teacherId;
        const hasClassOrTeacherChange =
          nextClassId !== existingSession.classId ||
          nextTeacherId !== existingSession.teacherId;

        const hasDateChange = data.date !== undefined;
        const currentTeacherPaymentStatus = normalizeSessionPaymentStatus(
          existingSession.teacherPaymentStatus,
        );
        const nextTeacherPaymentStatus =
          data.teacherPaymentStatus !== undefined
            ? normalizeSessionPaymentStatus(data.teacherPaymentStatus)
            : currentTeacherPaymentStatus;
        const hasTeacherPaymentStatusChange =
          data.teacherPaymentStatus !== undefined &&
          nextTeacherPaymentStatus !== currentTeacherPaymentStatus;

        const shouldRefreshAttendanceAssignments =
          data.attendance !== undefined ||
          nextClassId !== existingSession.classId;
        const shouldRebuildAttendanceState =
          shouldRefreshAttendanceAssignments || hasDateChange;

        const existingAttendanceByStudentId = new Map(
          existingSession.attendance.map((attendanceItem) => [
            attendanceItem.studentId,
            attendanceItem,
          ]),
        );

        const sessionDate =
          data.date !== undefined
            ? this.sessionValidationService.parseSessionDate(data.date)
            : undefined;
        const sessionStartTime =
          data.startTime !== undefined
            ? this.sessionValidationService.parseSessionTime(
                data.startTime,
                'startTime',
              )
            : undefined;
        const sessionEndTime =
          data.endTime !== undefined
            ? this.sessionValidationService.parseSessionTime(
                data.endTime,
                'endTime',
              )
            : undefined;

        const coefficientUpdate =
          this.sessionValidationService.normalizeCoefficient(data.coefficient);

        let allowanceAmountUpdate: number | null | undefined;
        let classTeacherForAllowance: {
          customAllowance: number | null;
          class: {
            name: string;
            allowancePerSessionPerStudent: number;
            scaleAmount: number | null;
          };
        } | null = null;
        let teacherOperatingDeductionRatePercentUpdate: number | undefined;
        let teacherTaxDeductionRatePercentUpdate: number | undefined;
        let nextClassName = existingSession.class.name;
        const effectiveSessionDate = sessionDate ?? existingSession.date;
        if (hasClassOrTeacherChange || hasDateChange) {
          const classTeacher = await tx.classTeacher.findUnique({
            where: {
              classId_teacherId: {
                classId: nextClassId,
                teacherId: nextTeacherId,
              },
            },
            select: {
              customAllowance: true,
              operatingDeductionRatePercent: true,
              class: {
                select: {
                  name: true,
                  allowancePerSessionPerStudent: true,
                  scaleAmount: true,
                },
              },
            },
          });

          if (!classTeacher) {
            throw new NotFoundException(
              'Class teacher not found for this class and teacher.',
            );
          }

          nextClassName = classTeacher.class.name;
          classTeacherForAllowance = classTeacher;
          if (
            !hasTeacherPaymentStatusChange &&
            currentTeacherPaymentStatus !== SessionPaymentStatus.paid
          ) {
            const currentTeacherOperatingDeductionRatePercent = Number(
              classTeacher.operatingDeductionRatePercent ?? 0,
            );
            teacherOperatingDeductionRatePercentUpdate = Number.isFinite(
              currentTeacherOperatingDeductionRatePercent,
            )
              ? Math.round(currentTeacherOperatingDeductionRatePercent * 100) /
                100
              : 0;
            teacherTaxDeductionRatePercentUpdate =
              await resolveTaxDeductionRate(tx, {
                staffId: nextTeacherId,
                roleType: StaffRole.teacher,
                effectiveDate: effectiveSessionDate,
              });
          }
        }

        if (hasTeacherPaymentStatusChange) {
          if (nextTeacherPaymentStatus !== SessionPaymentStatus.paid) {
            teacherOperatingDeductionRatePercentUpdate = 0;
            teacherTaxDeductionRatePercentUpdate = 0;
          } else if (
            isDepositSessionPaymentStatus(existingSession.teacherPaymentStatus)
          ) {
            teacherOperatingDeductionRatePercentUpdate = 0;
            teacherTaxDeductionRatePercentUpdate = 0;
          } else {
            const paymentSnapshot =
              await this.resolveTeacherPaymentRateSnapshot(tx, {
                classId: nextClassId,
                teacherId: nextTeacherId,
                effectiveDate: new Date(),
              });
            teacherOperatingDeductionRatePercentUpdate =
              paymentSnapshot.teacherOperatingDeductionRatePercent;
            teacherTaxDeductionRatePercentUpdate =
              paymentSnapshot.teacherTaxDeductionRatePercent;
          }
        }

        const attendanceSource =
          data.attendance ??
          existingSession.attendance.map((attendanceItem) => ({
            studentId: attendanceItem.studentId,
            status: attendanceItem.status,
            notes: attendanceItem.notes ?? null,
            tuitionFee: attendanceItem.tuitionFee ?? null,
          }));

        const nextAttendanceStudentIds = attendanceSource.map(
          (attendanceItem) => attendanceItem.studentId,
        );
        const chargeableAttendanceStudentIds = attendanceSource
          .filter((item) =>
            this.sessionValidationService.isTuitionChargeableStatus(
              item.status,
            ),
          )
          .map((attendanceItem) => attendanceItem.studentId);

        const hasAttendancePayload = data.attendance !== undefined;

        if (
          data.allowanceAmount !== undefined &&
          data.allowanceAmount !== null
        ) {
          allowanceAmountUpdate = Math.floor(Number(data.allowanceAmount));
        } else if (
          hasAttendancePayload &&
          currentTeacherPaymentStatus !== SessionPaymentStatus.paid
        ) {
          if (
            hasSessionAllowanceSnapshots({
              snapshotPerStudentAllowance:
                existingSession.snapshotPerStudentAllowance,
              snapshotScaleAmount: existingSession.snapshotScaleAmount,
            })
          ) {
            allowanceAmountUpdate = computeDefaultSessionAllowanceAmountVnd({
              perStudentAllowance:
                existingSession.snapshotPerStudentAllowance,
              classDefaultPerStudent: null,
              scaleAmount: existingSession.snapshotScaleAmount,
              chargeableStudentCount: chargeableAttendanceStudentIds.length,
            });
          } else {
            if (!classTeacherForAllowance) {
              const classTeacher = await tx.classTeacher.findUnique({
                where: {
                  classId_teacherId: {
                    classId: nextClassId,
                    teacherId: nextTeacherId,
                  },
                },
                select: {
                  customAllowance: true,
                  class: {
                    select: {
                      allowancePerSessionPerStudent: true,
                      scaleAmount: true,
                    },
                  },
                },
              });
              if (classTeacher) {
                classTeacherForAllowance = {
                  customAllowance: classTeacher.customAllowance,
                  class: {
                    name: existingSession.class.name,
                    allowancePerSessionPerStudent:
                      classTeacher.class.allowancePerSessionPerStudent,
                    scaleAmount: classTeacher.class.scaleAmount,
                  },
                };
              }
            }
            if (classTeacherForAllowance) {
              allowanceAmountUpdate = computeDefaultSessionAllowanceAmountVnd({
                perStudentAllowance:
                  classTeacherForAllowance.customAllowance,
                classDefaultPerStudent:
                  classTeacherForAllowance.class
                    .allowancePerSessionPerStudent,
                scaleAmount: classTeacherForAllowance.class.scaleAmount,
                chargeableStudentCount: chargeableAttendanceStudentIds.length,
              });
            }
          }
        } else if (hasClassOrTeacherChange && classTeacherForAllowance) {
          allowanceAmountUpdate = computeDefaultSessionAllowanceAmountVnd({
            perStudentAllowance: classTeacherForAllowance.customAllowance,
            classDefaultPerStudent:
              classTeacherForAllowance.class.allowancePerSessionPerStudent,
            scaleAmount: classTeacherForAllowance.class.scaleAmount,
            chargeableStudentCount: chargeableAttendanceStudentIds.length,
          });
        }

        const studentTuitionFeeByStudentId = new Map<string, number | null>();
        if (
          shouldRebuildAttendanceState &&
          nextAttendanceStudentIds.length > 0
        ) {
          const studentClasses = await tx.studentClass.findMany({
            where: {
              classId: nextClassId,
              status: StudentClassStatus.active,
              studentId: {
                in: nextAttendanceStudentIds,
              },
            },
            select: {
              studentId: true,
              customStudentTuitionPerSession: true,
              class: {
                select: {
                  studentTuitionPerSession: true,
                  tuitionPackageTotal: true,
                  tuitionPackageSession: true,
                },
              },
            },
          });

          studentClasses.forEach((studentClass) => {
            studentTuitionFeeByStudentId.set(
              studentClass.studentId,
              this.sessionValidationService.resolveDefaultStudentTuitionPerSession(
                {
                  customTuitionPerSession:
                    studentClass.customStudentTuitionPerSession,
                  classTuitionPerSession:
                    studentClass.class?.studentTuitionPerSession,
                  classTuitionPackageTotal:
                    studentClass.class?.tuitionPackageTotal,
                  classTuitionPackageSession:
                    studentClass.class?.tuitionPackageSession,
                },
              ),
            );
          });

          const uniqueAttendanceStudentIds = new Set(nextAttendanceStudentIds);
          if (studentClasses.length !== uniqueAttendanceStudentIds.size) {
            throw new BadRequestException(
              'attendance chỉ được phép chứa học sinh thuộc lớp học hiện tại.',
            );
          }
        }

        const customerCareByStudentId = new Map<
          string,
          { profitPercent: number | null; staffId: string | null }
        >();
        if (
          shouldRefreshAttendanceAssignments &&
          chargeableAttendanceStudentIds.length > 0
        ) {
          const studentCustomerCare = await tx.customerCareService.findMany({
            where: {
              studentId: {
                in: chargeableAttendanceStudentIds,
              },
            },
            select: {
              studentId: true,
              profitPercent: true,
              staffId: true,
            },
          });

          studentCustomerCare.forEach((customerCare) => {
            customerCareByStudentId.set(customerCare.studentId, {
              profitPercent:
                customerCare.profitPercent === null
                  ? null
                  : Number(customerCare.profitPercent),
              staffId: customerCare.staffId ?? null,
            });
          });
        }

        const assistantManagerByStaffId = new Map<string, string | null>();
        if (shouldRefreshAttendanceAssignments) {
          const uniqueCareStaffIds = [
            ...new Set(
              [...customerCareByStudentId.values()]
                .map((cc) => cc.staffId)
                .filter((id): id is string => !!id),
            ),
          ];
          if (uniqueCareStaffIds.length > 0) {
            const careStaff = await tx.staffInfo.findMany({
              where: { id: { in: uniqueCareStaffIds } },
              select: { id: true, customerCareManagedByStaffId: true },
            });
            careStaff.forEach((s) =>
              assistantManagerByStaffId.set(
                s.id,
                s.customerCareManagedByStaffId,
              ),
            );
          }
        }

        const nextAttendanceState = shouldRebuildAttendanceState
          ? attendanceSource.map((attendanceItem) => {
              const existingAttendance = existingAttendanceByStudentId.get(
                attendanceItem.studentId,
              );
              const defaultTuitionFee =
                studentTuitionFeeByStudentId.get(attendanceItem.studentId) ??
                null;
              const resolvedTuitionFee =
                data.attendance !== undefined
                  ? this.sessionValidationService.resolveChargeableAttendanceTuitionFee(
                      attendanceItem.status,
                      attendanceItem.tuitionFee,
                      defaultTuitionFee,
                    )
                  : nextClassId !== existingSession.classId
                    ? this.sessionValidationService.resolveChargeableAttendanceTuitionFee(
                        attendanceItem.status,
                        undefined,
                        defaultTuitionFee,
                      )
                    : this.sessionValidationService.resolveChargeableAttendanceTuitionFee(
                        attendanceItem.status,
                        existingAttendance?.tuitionFee ?? null,
                        null,
                      );

              const resolvedCareStaffId = shouldRefreshAttendanceAssignments
                ? (customerCareByStudentId.get(attendanceItem.studentId)
                    ?.staffId ?? null)
                : (existingAttendance?.customerCareStaffId ?? null);

              const resolvedAssistantId = shouldRefreshAttendanceAssignments
                ? resolveAssistantManagerStaffIdForAttendance({
                    customerCareStaffId: resolvedCareStaffId,
                    customerCareManagedByStaffId: resolvedCareStaffId
                      ? (assistantManagerByStaffId.get(resolvedCareStaffId) ??
                        null)
                      : null,
                  })
                : (existingAttendance?.assistantManagerStaffId ?? null);

              return {
                studentId: attendanceItem.studentId,
                status: attendanceItem.status,
                notes: attendanceItem.notes ?? null,
                tuitionFee: resolvedTuitionFee,
                customerCareCoef: shouldRefreshAttendanceAssignments
                  ? (customerCareByStudentId.get(attendanceItem.studentId)
                      ?.profitPercent ?? null)
                  : (existingAttendance?.customerCareCoef ?? null),
                customerCareStaffId: resolvedCareStaffId,
                assistantManagerStaffId: resolvedAssistantId,
                existingAttendanceId: existingAttendance?.id ?? null,
                existingTransactionId:
                  existingAttendance?.transactionId ?? null,
                existingCustomerCarePaymentStatus:
                  existingAttendance?.customerCarePaymentStatus ?? null,
                existingAssistantPaymentStatus:
                  existingAttendance?.assistantPaymentStatus ?? null,
              };
            })
          : [];

        const nextAttendanceStateByStudentId = new Map(
          nextAttendanceState.map((attendanceItem) => [
            attendanceItem.studentId,
            attendanceItem,
          ]),
        );
        const sessionTuitionFeeUpdate = shouldRebuildAttendanceState
          ? nextAttendanceState.reduce(
              (sum, attendanceItem) => sum + (attendanceItem.tuitionFee ?? 0),
              0,
            )
          : undefined;

        const balanceStudentIds = Array.from(
          new Set([
            ...existingSession.attendance.map(
              (attendanceItem) => attendanceItem.studentId,
            ),
            ...nextAttendanceStudentIds,
          ]),
        );
        const studentBalanceByStudentId = new Map<string, number | null>();
        if (balanceStudentIds.length > 0) {
          const students = await tx.studentInfo.findMany({
            where: {
              id: {
                in: balanceStudentIds,
              },
            },
            select: {
              id: true,
              accountBalance: true,
            },
          });

          students.forEach((student) => {
            studentBalanceByStudentId.set(student.id, student.accountBalance);
          });
        }

        const getCurrentStudentBalance = (studentId: string) =>
          studentBalanceByStudentId.get(studentId) ?? 0;

        const oldSessionDateLabel = existingSession.date
          .toISOString()
          .slice(0, 10);
        const nextSessionDateLabel = (sessionDate ?? existingSession.date)
          .toISOString()
          .slice(0, 10);

        const refundHistoryItems: Array<{
          studentId: string;
          amount: number;
          balanceBefore: number;
          className: string;
          dateLabel: string;
        }> = [];
        const chargeHistoryItems: Array<{
          studentId: string;
          amount: number;
          balanceBefore: number;
          className: string;
          dateLabel: string;
        }> = [];
        const attendanceIdsToDelete: string[] = [];

        if (shouldRebuildAttendanceState) {
          existingSession.attendance.forEach((attendanceItem) => {
            if (nextAttendanceStateByStudentId.has(attendanceItem.studentId)) {
              return;
            }

            attendanceIdsToDelete.push(attendanceItem.id);

            const oldChargeAmount =
              this.sessionLedgerService.getAttendanceChargeAmount(
                attendanceItem,
              );
            if (oldChargeAmount <= 0) {
              return;
            }

            refundHistoryItems.push({
              studentId: attendanceItem.studentId,
              amount: oldChargeAmount,
              balanceBefore: getCurrentStudentBalance(attendanceItem.studentId),
              className: existingSession.class.name,
              dateLabel: oldSessionDateLabel,
            });
          });

          nextAttendanceState.forEach((attendanceItem) => {
            const existingAttendance = existingAttendanceByStudentId.get(
              attendanceItem.studentId,
            );
            const oldChargeAmount =
              this.sessionLedgerService.getAttendanceChargeAmount(
                existingAttendance,
              );
            const newChargeAmount =
              this.sessionLedgerService.getAttendanceChargeAmount(
                attendanceItem,
              );
            const balanceBefore = getCurrentStudentBalance(
              attendanceItem.studentId,
            );

            if (existingAttendance && oldChargeAmount !== newChargeAmount) {
              if (oldChargeAmount > 0) {
                refundHistoryItems.push({
                  studentId: attendanceItem.studentId,
                  amount: oldChargeAmount,
                  balanceBefore,
                  className: existingSession.class.name,
                  dateLabel: oldSessionDateLabel,
                });
              }

              if (newChargeAmount > 0) {
                chargeHistoryItems.push({
                  studentId: attendanceItem.studentId,
                  amount: newChargeAmount,
                  balanceBefore: balanceBefore + oldChargeAmount,
                  className: nextClassName,
                  dateLabel: nextSessionDateLabel,
                });
              }

              return;
            }

            if (!existingAttendance && newChargeAmount > 0) {
              chargeHistoryItems.push({
                studentId: attendanceItem.studentId,
                amount: newChargeAmount,
                balanceBefore,
                className: nextClassName,
                dateLabel: nextSessionDateLabel,
              });
            }
          });
        }

        const studentBalanceDeltaByStudentId = new Map<string, number>();
        refundHistoryItems.forEach((refundItem) => {
          studentBalanceDeltaByStudentId.set(
            refundItem.studentId,
            (studentBalanceDeltaByStudentId.get(refundItem.studentId) ?? 0) +
              refundItem.amount,
          );
        });
        chargeHistoryItems.forEach((chargeItem) => {
          studentBalanceDeltaByStudentId.set(
            chargeItem.studentId,
            (studentBalanceDeltaByStudentId.get(chargeItem.studentId) ?? 0) -
              chargeItem.amount,
          );
        });

        await tx.session.update({
          where: { id: sessionId },
          data: {
            ...(data.classId !== undefined && { classId: data.classId }),
            ...(data.teacherId !== undefined && { teacherId: data.teacherId }),
            ...(sessionDate !== undefined && { date: sessionDate }),
            ...(sessionStartTime !== undefined && {
              startTime: sessionStartTime,
            }),
            ...(sessionEndTime !== undefined && { endTime: sessionEndTime }),
            ...(data.notes !== undefined && { notes: data.notes ?? null }),
            ...(data.teacherPaymentStatus !== undefined && {
              teacherPaymentStatus: data.teacherPaymentStatus ?? 'unpaid',
            }),
            ...(coefficientUpdate !== undefined && {
              coefficient: coefficientUpdate,
            }),
            ...(allowanceAmountUpdate !== undefined && {
              allowanceAmount: allowanceAmountUpdate,
            }),
            ...(teacherOperatingDeductionRatePercentUpdate !== undefined && {
              teacherOperatingDeductionRatePercent:
                teacherOperatingDeductionRatePercentUpdate,
            }),
            ...(teacherTaxDeductionRatePercentUpdate !== undefined && {
              teacherTaxDeductionRatePercent:
                teacherTaxDeductionRatePercentUpdate,
            }),
            ...(sessionTuitionFeeUpdate !== undefined && {
              tuitionFee: sessionTuitionFeeUpdate,
            }),
          },
        });

        const balanceChanges = Array.from(
          studentBalanceDeltaByStudentId.entries(),
        )
          .map(([studentId, change]) => ({
            studentId,
            change,
          }))
          .filter((balanceChange) => balanceChange.change !== 0);
        await this.sessionStudentBalanceService.applyBalanceChanges(
          tx,
          balanceChanges,
        );

        if (refundHistoryItems.length > 0) {
          await tx.walletTransactionsHistory.createMany({
            data: refundHistoryItems.map((refundItem) => ({
              studentId: refundItem.studentId,
              type: WalletTransactionType.topup,
              amount: refundItem.amount,
              note: this.sessionLedgerService.buildRefundNote(refundItem),
            })),
          });
        }

        const nextChargeTransactionIdByStudentId = new Map<string, string>();
        if (chargeHistoryItems.length > 0) {
          const chargeTransactions =
            await tx.walletTransactionsHistory.createManyAndReturn({
              data: chargeHistoryItems.map((chargeItem) => ({
                studentId: chargeItem.studentId,
                amount: chargeItem.amount,
                type: WalletTransactionType.repayment,
                note: this.sessionLedgerService.buildChargeNote(chargeItem),
              })),
            });

          chargeTransactions.forEach((transaction) => {
            nextChargeTransactionIdByStudentId.set(
              transaction.studentId,
              transaction.id,
            );
          });
        }

        if (attendanceIdsToDelete.length > 0) {
          await tx.attendance.deleteMany({
            where: {
              id: {
                in: attendanceIdsToDelete,
              },
            },
          });
        }

        if (shouldRebuildAttendanceState) {
          const getTaxRate = createMemoizedTaxDeductionResolver(
            tx,
            effectiveSessionDate,
          );

          const resolveCustomerCareTaxRate = (staffId?: string | null) =>
            staffId
              ? getTaxRate(staffId, StaffRole.customer_care)
              : Promise.resolve(0);

          const resolveAssistantTaxRate = (staffId?: string | null) =>
            staffId
              ? getTaxRate(staffId, StaffRole.assistant)
              : Promise.resolve(0);

          await Promise.all(
            nextAttendanceState.map(async (attendanceItem) => {
              const existingAttendance = existingAttendanceByStudentId.get(
                attendanceItem.studentId,
              );
              const oldChargeAmount =
                this.sessionLedgerService.getAttendanceChargeAmount(
                  existingAttendance,
                );
              const newChargeAmount =
                this.sessionLedgerService.getAttendanceChargeAmount(
                  attendanceItem,
                );
              const transactionId =
                oldChargeAmount === newChargeAmount
                  ? (existingAttendance?.transactionId ?? null)
                  : (nextChargeTransactionIdByStudentId.get(
                      attendanceItem.studentId,
                    ) ?? null);

              return tx.attendance.upsert({
                where: {
                  sessionId_studentId: {
                    sessionId,
                    studentId: attendanceItem.studentId,
                  },
                },
                create: {
                  sessionId,
                  studentId: attendanceItem.studentId,
                  status: attendanceItem.status,
                  notes: attendanceItem.notes,
                  customerCareCoef: attendanceItem.customerCareCoef,
                  customerCareStaffId: attendanceItem.customerCareStaffId,
                  customerCarePaymentStatus: attendanceItem.customerCareStaffId
                    ? PaymentStatus.pending
                    : null,
                  customerCareTaxDeductionRatePercent:
                    await resolveCustomerCareTaxRate(
                      attendanceItem.customerCareStaffId,
                    ),
                  tuitionFee: attendanceItem.tuitionFee,
                  transactionId,
                  assistantManagerStaffId:
                    attendanceItem.assistantManagerStaffId,
                  assistantPaymentStatus: attendanceItem.assistantManagerStaffId
                    ? PaymentStatus.pending
                    : null,
                  assistantTaxDeductionRatePercent:
                    await resolveAssistantTaxRate(
                      attendanceItem.assistantManagerStaffId,
                    ),
                },
                update: {
                  status: attendanceItem.status,
                  notes: attendanceItem.notes,
                  customerCareCoef: shouldRefreshAttendanceAssignments
                    ? attendanceItem.customerCareCoef
                    : undefined,
                  customerCareStaffId: shouldRefreshAttendanceAssignments
                    ? attendanceItem.customerCareStaffId
                    : undefined,
                  customerCarePaymentStatus: shouldRefreshAttendanceAssignments
                    ? attendanceItem.customerCareStaffId
                      ? (attendanceItem.existingCustomerCarePaymentStatus ??
                        PaymentStatus.pending)
                      : null
                    : undefined,
                  customerCareTaxDeductionRatePercent:
                    await resolveCustomerCareTaxRate(
                      attendanceItem.customerCareStaffId,
                    ),
                  tuitionFee: attendanceItem.tuitionFee,
                  transactionId,
                  assistantManagerStaffId: shouldRefreshAttendanceAssignments
                    ? attendanceItem.assistantManagerStaffId
                    : undefined,
                  assistantPaymentStatus: shouldRefreshAttendanceAssignments
                    ? attendanceItem.assistantManagerStaffId
                      ? (attendanceItem.existingAssistantPaymentStatus ??
                        PaymentStatus.pending)
                      : null
                    : undefined,
                  assistantTaxDeductionRatePercent:
                    await resolveAssistantTaxRate(
                      attendanceItem.assistantManagerStaffId,
                    ),
                },
              });
            }),
          );
        }

        const updatedSession = await tx.session.findUnique({
          where: { id: sessionId },
          include: { attendance: true },
        });

        if (!updatedSession) {
          throw new NotFoundException('Session not found');
        }

        if (actor) {
          const afterValue =
            await this.sessionSnapshotService.getSessionAuditSnapshot(
              tx,
              sessionId,
            );

          await this.actionHistoryService.recordUpdate(tx, {
            actor,
            entityType: 'session',
            entityId: sessionId,
            description: 'Cập nhật buổi học',
            beforeValue,
            afterValue,
          });
        }

        return updatedSession;
      },
      {
        maxWait: SESSION_UPDATE_TRANSACTION_MAX_WAIT_MS,
        timeout: SESSION_UPDATE_TRANSACTION_TIMEOUT_MS,
      },
    );

    return updatedSession;
  }

  async updateSessionForStaff(
    userId: string,
    roleType: UserRole,
    sessionId: string,
    data: {
      date?: string;
      startTime?: string;
      endTime?: string;
      notes?: string | null;
      coefficient?: number;
      attendance?: Array<{
        studentId: string;
        status: NonNullable<SessionUpdateDto['attendance']>[number]['status'];
        notes?: string | null;
      }>;
    },
    auditActor?: ActionHistoryActor,
  ) {
    const existingSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        classId: true,
        attendance: {
          select: {
            studentId: true,
            tuitionFee: true,
          },
        },
      },
    });

    if (!existingSession) {
      throw new NotFoundException('Session not found');
    }

    const actor = await this.staffOperationsAccess.resolveActor(
      userId,
      roleType,
    );
    if (actor.roles.includes(StaffRole.teacher)) {
      await this.staffOperationsAccess.assertTeacherAssignedToClass(
        actor.id,
        existingSession.classId,
      );
    }

    let enrichedAttendance: SessionUpdateDto['attendance'] | undefined;
    if (data.attendance !== undefined) {
      const tuitionByStudentId =
        await this.sessionRosterService.assertAttendanceStudentsBelongToClass(
          existingSession.classId,
          data.attendance.map((attendanceItem) => attendanceItem.studentId),
        );
      const existingAttendanceByStudentId = new Map(
        existingSession.attendance.map((attendanceItem) => [
          attendanceItem.studentId,
          attendanceItem.tuitionFee ?? null,
        ]),
      );

      enrichedAttendance = data.attendance.map((attendanceItem) => ({
        studentId: attendanceItem.studentId,
        status: attendanceItem.status,
        notes: attendanceItem.notes ?? null,
        tuitionFee:
          this.sessionValidationService.resolveChargeableAttendanceTuitionFee(
            attendanceItem.status,
            existingAttendanceByStudentId.get(attendanceItem.studentId) ?? null,
            tuitionByStudentId.get(attendanceItem.studentId) ?? null,
          ),
      }));
    }

    return this.updateSession(
      {
        id: sessionId,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        notes: data.notes,
        coefficient: data.coefficient,
        attendance: enrichedAttendance,
      },
      auditActor,
    );
  }
}

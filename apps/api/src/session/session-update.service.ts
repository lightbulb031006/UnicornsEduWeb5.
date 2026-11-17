import { SALE_CS_HEAD_ROLE } from 'src/common/sale-cs-head-access';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ProtectedVideoService } from 'src/protected-video/protected-video.service';
import { Prisma } from '../../generated/client';
import {
  AttendanceStatus,
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
  TrainingHeadSessionUpdateDto,
} from '../dtos/session.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  StaffOperationsAccessService,
  canEditClassSessionCoefficient,
  canWorkOnClassSession,
  isTrainingHeadActor,
} from '../staff-ops/staff-operations-access.service';
import { SessionLedgerService } from './session-ledger.service';
import { SessionRosterService } from './session-roster.service';
import { SessionSnapshotService } from './session-snapshot.service';
import { SessionStudentBalanceService } from './session-student-balance.service';
import { SessionTrialCatchUpService } from './session-trial-catch-up.service';
import {
  AttendanceReviewData,
  AttendanceReviewInput,
  pickAttendanceReviewInput,
  pickSessionReviewInput,
  ReviewValidationOptions,
  SessionReviewInput,
  SessionValidationService,
} from './session-validation.service';
import {
  createMemoizedTaxDeductionResolver,
  normalizePercent,
  resolveTaxDeductionRate,
} from '../payroll/deduction-rates';
import { computeTrainingManagerSessionSnapshot } from '../training-manager/training-manager.utils';
import {
  resolveAssistantManagerStaffIdForAttendance,
  resolveSaleCsHeadManagerId,
} from '../payroll/assistant-share.util';
import { syncLessonPlanHeadCommissions } from '../payroll/lesson-plan-head-commission.util';
import { syncClassTimelineSortByTime } from '../class-timeline/append-timeline-item';
import {
  computeDefaultSessionAllowanceAmountVnd,
  hasSessionAllowanceSnapshots,
  resolveLiveSessionAllowanceSnapshots,
  resolveTeacherScaleAmountVnd,
} from './session-allowance.util';
import {
  isBlockPricingMode,
  isOneTimePricingMode,
  resolveAllowanceReconstructionBlockCount,
  resolveSnapshotBlockCountForPricingMode,
} from '../common/class-pricing-mode.util';
import {
  findOneTimeChargedStudentIds,
  lockOneTimeClassCharges,
} from '../common/one-time-charge.util';
import {
  presentCustomAllowanceAsPerSession,
  standardBlockCountFromSlots,
} from '../common/block-pricing.util';
import {
  assertActorNotEditingOwnCompensation,
  assertNotEditingOwnCompensation,
  resolveStaffPolicyActor,
} from 'src/common/staff-role-policy';
import { redactSessionForTrainingHeadView } from 'src/common/accountant-finance-redaction.util';
import { resolveTrainingHeadAttendanceChanges } from './training-head-session-policy';

const SESSION_UPDATE_TRANSACTION_MAX_WAIT_MS = 10_000;
const SESSION_UPDATE_TRANSACTION_TIMEOUT_MS = 20_000;
const DEPOSIT_SESSION_PAYMENT_STATUSES = new Set<string>([
  SessionPaymentStatus.deposit,
  'deposite',
  'coc',
  'cọc',
]);

// Buổi học của lớp không điểm danh tự quản danh sách; bỏ qua attendance gửi kèm trong payload
function stripAttendanceForNoAttendanceSession<
  T extends { attendance?: unknown },
>(data: T, snapshotNoAttendance: boolean): T {
  if (!snapshotNoAttendance || !data.attendance) return data;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure to omit attendance
  const { attendance, ...rest } = data;
  return rest as T;
}

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

type ClassTeacherAllowanceSource = {
  customAllowance: number | null;
  customAllowancePerSession?: number | null;
  customScaleAmount: number | null;
  class: {
    name: string;
    pricingMode?: string | null;
    allowancePerSessionPerStudent: number;
    allowancePerBlockPerStudent?: number | null;
    scaleAmount: number | null;
  };
};

function liveAllowanceFromClassTeacher(
  classTeacher: ClassTeacherAllowanceSource,
  options: {
    snapshotBlockCount: number | null;
    startTime?: string | null;
    endTime?: string | null;
    chargeableStudentCount: number;
  },
) {
  const storedAsPerBlock =
    classTeacher.class.allowancePerBlockPerStudent != null;
  const reconstructionBlocks = resolveAllowanceReconstructionBlockCount({
    snapshotBlockCount: options.snapshotBlockCount,
    startTime: options.startTime,
    endTime: options.endTime,
  });
  return resolveLiveSessionAllowanceSnapshots({
    pricingMode: classTeacher.class.pricingMode,
    customAllowanceStored: classTeacher.customAllowance,
    classDefaultPerStudent: classTeacher.class.allowancePerSessionPerStudent,
    classDefaultPerBlock:
      classTeacher.class.allowancePerBlockPerStudent ?? null,
    scaleAmount: resolveTeacherScaleAmountVnd({
      customScaleAmount: classTeacher.customScaleAmount,
      classScaleAmount: classTeacher.class.scaleAmount,
    }),
    reconstructionBlocks,
    storedAsPerBlock,
    snapshotBlockCount: options.snapshotBlockCount,
    chargeableStudentCount: options.chargeableStudentCount,
    presentCustomAsPerSession: presentCustomAllowanceAsPerSession(
      classTeacher.customAllowance,
      reconstructionBlocks,
      storedAsPerBlock,
      classTeacher.customAllowancePerSession,
    ),
  });
}

@Injectable()
export class SessionUpdateService {
  /** Đồng bộ video sau khi lưu link recording (Optional: spec dựng service bằng `new`). */
  @Optional()
  @Inject(ProtectedVideoService)
  private readonly protectedVideos?: ProtectedVideoService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
    private readonly sessionRosterService: SessionRosterService,
    private readonly sessionValidationService: SessionValidationService,
    private readonly sessionStudentBalanceService: SessionStudentBalanceService,
    private readonly sessionLedgerService: SessionLedgerService,
    private readonly sessionSnapshotService: SessionSnapshotService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly sessionTrialCatchUpService: SessionTrialCatchUpService,
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

        await assertActorNotEditingOwnCompensation(
          tx,
          actor,
          existingSessions.map((session) => session.teacherId),
        );

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

  /**
   * `PUT /sessions/:id` (Admin + Kế toán chi, #275): luật #265 — không ai trừ
   * Admin tự sửa trợ cấp / hệ số / trạng thái thanh toán của buổi do chính mình
   * dạy (hoặc gán buổi sang chính mình).
   */
  async assertAdminRouteUpdateAllowed(
    data: SessionUpdateDto,
    actor?: ActionHistoryActor,
  ): Promise<void> {
    const touchesCompensation =
      data.allowanceAmount !== undefined ||
      data.coefficient !== undefined ||
      data.teacherPaymentStatus !== undefined ||
      data.includeTeacherOperatingDeduction !== undefined ||
      data.teacherId !== undefined;
    if (!touchesCompensation || !data.id) {
      return;
    }

    const session = await this.prisma.session.findUnique({
      where: { id: data.id },
      select: { teacherId: true },
    });
    if (!session) {
      return;
    }

    await assertActorNotEditingOwnCompensation(this.prisma, actor, [
      session.teacherId,
      ...(data.teacherId ? [data.teacherId] : []),
    ]);
  }

  async updateSession(
    data: SessionUpdateDto,
    actor?: ActionHistoryActor,
    reviewOptions: ReviewValidationOptions = {},
  ) {
    if (!data.id) {
      throw new BadRequestException('Session id is required');
    }

    this.sessionValidationService.validateAttendanceItems(data.attendance, {
      required: false,
      ...reviewOptions,
    });
    const hasSessionContentPayload =
      data.lessonContent !== undefined ||
      data.homework !== undefined ||
      data.tutorial !== undefined;
    if (hasSessionContentPayload && !reviewOptions.skipRequired) {
      this.sessionValidationService.validateSessionCommentFields(
        {
          lessonContent: data.lessonContent,
          homework: data.homework,
          tutorial: data.tutorial,
        },
        { required: true },
      );
    }

    // Sửa nội dung buổi (kể cả buổi legacy) ⇒ bắt buộc nhập đủ Nhận xét buổi học có cấu trúc.
    const sessionReview =
      hasSessionContentPayload ||
      this.sessionValidationService.hasAnySessionReviewField(data)
        ? this.sessionValidationService.resolveSessionReviewFields(
            data,
            reviewOptions,
          )
        : undefined;

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
            startTime: true,
            endTime: true,
            recordingUrl: true,
            teacherPaymentStatus: true,
            snapshotPerStudentAllowance: true,
            snapshotScaleAmount: true,
            snapshotNoAttendance: true,
            snapshotBlockCount: true,
            progressStatus: true,
            hasInClassTest: true,
            inClassTestTotal: true,
            class: {
              select: {
                name: true,
                pricingMode: true,
              },
            },
            attendance: {
              select: {
                id: true,
                studentId: true,
                status: true,
                notes: true,
                testCorrectCount: true,
                testComment: true,
                strengths: true,
                improvements: true,
                homeworkQuality: true,
                homeworkComment: true,
                tuitionFee: true,
                trialCatchUpFee: true,
                customerCareCoef: true,
                customerCareStaffId: true,
                customerCarePaymentStatus: true,
                saleCsHeadStaffId: true,
                saleCsHeadPaymentStatus: true,
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

        data = stripAttendanceForNoAttendanceSession(
          data,
          existingSession.snapshotNoAttendance,
        );

        // Phần từng HS chỉ áp dụng cho buổi có cấu trúc + lớp có điểm danh.
        // Đổi phần chung mà không gửi attendance ⇒ kiểm lại review đang lưu theo mốc kiểm tra mới.
        const attendanceReviewByStudentId = new Map<
          string,
          AttendanceReviewData
        >();
        const isStructuredReview =
          sessionReview !== undefined ||
          existingSession.progressStatus !== null;
        if (isStructuredReview && !existingSession.snapshotNoAttendance) {
          const testContext = sessionReview ?? {
            hasInClassTest: existingSession.hasInClassTest,
            inClassTestTotal: existingSession.inClassTestTotal,
          };
          const reviewSource =
            data.attendance ??
            (sessionReview !== undefined ? existingSession.attendance : []);
          for (const attendanceItem of reviewSource) {
            attendanceReviewByStudentId.set(
              attendanceItem.studentId,
              this.sessionValidationService.resolveAttendanceReview(
                attendanceItem,
                testContext,
                reviewOptions,
              ),
            );
          }
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
        const hasTeacherOperatingDeductionPreference =
          data.includeTeacherOperatingDeduction !== undefined;
        const includeTeacherOperatingDeduction =
          data.includeTeacherOperatingDeduction !== false;

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
        const hasStartTimePayload = data.startTime !== undefined;
        const hasEndTimePayload = data.endTime !== undefined;
        let sessionStartTime: Date | null | undefined;
        let sessionEndTime: Date | null | undefined;
        let snapshotBlockCountUpdate: number | null | undefined;
        if (hasStartTimePayload || hasEndTimePayload) {
          const requireSessionTimes = isBlockPricingMode(
            existingSession.class.pricingMode,
          );
          const resolvedStart = hasStartTimePayload
            ? data.startTime
            : this.sessionValidationService.formatSessionTimeHms(
                existingSession.startTime,
              );
          const resolvedEnd = hasEndTimePayload
            ? data.endTime
            : this.sessionValidationService.formatSessionTimeHms(
                existingSession.endTime,
              );
          this.sessionValidationService.assertRequiredSessionTimes(
            resolvedStart,
            resolvedEnd,
            { required: requireSessionTimes },
          );
          const startTrimmed =
            typeof resolvedStart === 'string' ? resolvedStart.trim() : '';
          const endTrimmed =
            typeof resolvedEnd === 'string' ? resolvedEnd.trim() : '';
          if (!requireSessionTimes && !startTrimmed && !endTrimmed) {
            sessionStartTime = null;
            sessionEndTime = null;
          } else {
            sessionStartTime = this.sessionValidationService.parseSessionTime(
              resolvedStart as string,
              'startTime',
            );
            sessionEndTime = this.sessionValidationService.parseSessionTime(
              resolvedEnd as string,
              'endTime',
            );
            this.sessionValidationService.assertSessionEndAfterStart(
              sessionStartTime,
              sessionEndTime,
            );
            this.sessionValidationService.assertSessionTimesUnlockedForPayment({
              paymentStatus: existingSession.teacherPaymentStatus,
              existingStartTime: existingSession.startTime,
              existingEndTime: existingSession.endTime,
              nextStartTime: sessionStartTime,
              nextEndTime: sessionEndTime,
              payloadIncludesStart: hasStartTimePayload,
              payloadIncludesEnd: hasEndTimePayload,
            });
          }
        }
        const canWriteSessionTimes =
          !this.sessionValidationService.isSessionTimeEditLocked(
            existingSession.teacherPaymentStatus,
          );
        if (
          canWriteSessionTimes &&
          (hasStartTimePayload || hasEndTimePayload)
        ) {
          const nextStartHms =
            sessionStartTime === null
              ? null
              : this.sessionValidationService.formatSessionTimeHms(
                  sessionStartTime ?? existingSession.startTime,
                );
          const nextEndHms =
            sessionEndTime === null
              ? null
              : this.sessionValidationService.formatSessionTimeHms(
                  sessionEndTime ?? existingSession.endTime,
                );
          const scheduleRows = await tx.classScheduleEntry.findMany({
            where: { classId: nextClassId, effectiveTo: null },
            select: { from: true, to: true },
          });
          snapshotBlockCountUpdate = resolveSnapshotBlockCountForPricingMode({
            pricingMode: existingSession.class.pricingMode,
            startTime: nextStartHms,
            endTime: nextEndHms,
            standardBlockCount: standardBlockCountFromSlots(scheduleRows),
          });
        }

        const coefficientUpdate =
          this.sessionValidationService.normalizeCoefficient(data.coefficient);

        let allowanceAmountUpdate: number | null | undefined;
        let snapshotPerStudentAllowanceUpdate: number | undefined;
        let snapshotScaleAmountUpdate: number | undefined;
        let classTeacherForAllowance: {
          customAllowance: number | null;
          customAllowancePerSession?: number | null;
          customScaleAmount: number | null;
          operatingDeductionRatePercent?:
            | Prisma.Decimal
            | number
            | string
            | null;
          class: {
            name: string;
            pricingMode?: string | null;
            allowancePerSessionPerStudent: number;
            allowancePerBlockPerStudent: number | null;
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
              customAllowancePerSession: true,
              customScaleAmount: true,
              operatingDeductionRatePercent: true,
              class: {
                select: {
                  name: true,
                  pricingMode: true,
                  allowancePerSessionPerStudent: true,
                  allowancePerBlockPerStudent: true,
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
              includeTeacherOperatingDeduction
                ? (classTeacher.operatingDeductionRatePercent ?? 0)
                : 0,
            );
            teacherOperatingDeductionRatePercentUpdate =
              includeTeacherOperatingDeduction &&
              Number.isFinite(currentTeacherOperatingDeductionRatePercent)
                ? Math.round(
                    currentTeacherOperatingDeductionRatePercent * 100,
                  ) / 100
                : 0;
            teacherTaxDeductionRatePercentUpdate =
              await resolveTaxDeductionRate(tx, {
                staffId: nextTeacherId,
                roleType: StaffRole.teacher,
                effectiveDate: effectiveSessionDate,
              });
          }
        }

        if (
          hasTeacherOperatingDeductionPreference &&
          !hasTeacherPaymentStatusChange &&
          currentTeacherPaymentStatus !== SessionPaymentStatus.paid
        ) {
          if (!includeTeacherOperatingDeduction) {
            teacherOperatingDeductionRatePercentUpdate = 0;
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
                  customAllowancePerSession: true,
                  customScaleAmount: true,
                  operatingDeductionRatePercent: true,
                  class: {
                    select: {
                      name: true,
                      pricingMode: true,
                      allowancePerSessionPerStudent: true,
                      allowancePerBlockPerStudent: true,
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

              classTeacherForAllowance = classTeacher;
            }

            teacherOperatingDeductionRatePercentUpdate = normalizePercent(
              classTeacherForAllowance.operatingDeductionRatePercent,
            );
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
          } else if (!includeTeacherOperatingDeduction) {
            teacherOperatingDeductionRatePercentUpdate = 0;
            teacherTaxDeductionRatePercentUpdate =
              await resolveTaxDeductionRate(tx, {
                staffId: nextTeacherId,
                roleType: StaffRole.teacher,
                effectiveDate: new Date(),
              });
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
        const existingTrialFoldByStudentId = new Map(
          existingSession.attendance
            .filter((attendanceItem) => attendanceItem.trialCatchUpFee != null)
            .map((attendanceItem) => [
              attendanceItem.studentId,
              {
                foldedFee: attendanceItem.tuitionFee ?? 0,
                baseFee: Math.max(
                  0,
                  (attendanceItem.tuitionFee ?? 0) -
                    (attendanceItem.trialCatchUpFee ?? 0),
                ),
              },
            ]),
        );
        // Học phí trên form là số đã gộp thu bù học thử; đưa về học phí gốc của buổi.
        const toBaseTuitionFee = <T extends string | number | null | undefined>(
          studentId: string,
          value: T,
        ): T | number => {
          const fold = existingTrialFoldByStudentId.get(studentId);
          return fold && value != null && Number(value) === fold.foldedFee
            ? fold.baseFee
            : value;
        };

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

        const effectiveSnapshotBlockCount =
          snapshotBlockCountUpdate !== undefined
            ? snapshotBlockCountUpdate
            : existingSession.snapshotBlockCount;
        const effectiveStartHms =
          this.sessionValidationService.formatSessionTimeHms(
            sessionStartTime === undefined
              ? existingSession.startTime
              : sessionStartTime,
          );
        const effectiveEndHms =
          this.sessionValidationService.formatSessionTimeHms(
            sessionEndTime === undefined
              ? existingSession.endTime
              : sessionEndTime,
          );
        const shouldRecomputeLiveAllowance =
          currentTeacherPaymentStatus !== SessionPaymentStatus.paid &&
          (hasClassOrTeacherChange || snapshotBlockCountUpdate !== undefined);

        if (
          data.allowanceAmount !== undefined &&
          data.allowanceAmount !== null
        ) {
          allowanceAmountUpdate = Math.floor(Number(data.allowanceAmount));
        } else if (
          hasAttendancePayload &&
          currentTeacherPaymentStatus !== SessionPaymentStatus.paid &&
          !shouldRecomputeLiveAllowance &&
          hasSessionAllowanceSnapshots({
            snapshotPerStudentAllowance:
              existingSession.snapshotPerStudentAllowance,
            snapshotScaleAmount: existingSession.snapshotScaleAmount,
          })
        ) {
          allowanceAmountUpdate = computeDefaultSessionAllowanceAmountVnd({
            perStudentAllowance: existingSession.snapshotPerStudentAllowance,
            classDefaultPerStudent: null,
            scaleAmount: existingSession.snapshotScaleAmount,
            chargeableStudentCount: chargeableAttendanceStudentIds.length,
          });
        } else if (
          (hasAttendancePayload || shouldRecomputeLiveAllowance) &&
          currentTeacherPaymentStatus !== SessionPaymentStatus.paid
        ) {
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
                customAllowancePerSession: true,
                customScaleAmount: true,
                class: {
                  select: {
                    pricingMode: true,
                    allowancePerSessionPerStudent: true,
                    allowancePerBlockPerStudent: true,
                    scaleAmount: true,
                  },
                },
              },
            });
            if (classTeacher) {
              classTeacherForAllowance = {
                customAllowance: classTeacher.customAllowance,
                customAllowancePerSession:
                  classTeacher.customAllowancePerSession,
                customScaleAmount: classTeacher.customScaleAmount,
                class: {
                  name: existingSession.class.name,
                  pricingMode: classTeacher.class.pricingMode,
                  allowancePerSessionPerStudent:
                    classTeacher.class.allowancePerSessionPerStudent,
                  allowancePerBlockPerStudent:
                    classTeacher.class.allowancePerBlockPerStudent,
                  scaleAmount: classTeacher.class.scaleAmount,
                },
              };
            }
          }
          if (classTeacherForAllowance) {
            const live = liveAllowanceFromClassTeacher(
              classTeacherForAllowance,
              {
                snapshotBlockCount: effectiveSnapshotBlockCount,
                startTime: effectiveStartHms,
                endTime: effectiveEndHms,
                chargeableStudentCount: chargeableAttendanceStudentIds.length,
              },
            );
            allowanceAmountUpdate = live.allowanceAmount;
            snapshotPerStudentAllowanceUpdate =
              live.snapshotPerStudentAllowance;
            snapshotScaleAmountUpdate = live.snapshotScaleAmount;
          }
        }

        if (shouldRebuildAttendanceState) {
          const nextPricingMode =
            nextClassId === existingSession.classId
              ? existingSession.class.pricingMode
              : (
                  await tx.class.findUnique({
                    where: { id: nextClassId },
                    select: { pricingMode: true },
                  })
                )?.pricingMode;
          await this.sessionTrialCatchUpService.assertTrialAttendanceAllowed(
            tx,
            {
              classId: nextClassId,
              isOneTimeClass: nextPricingMode
                ? isOneTimePricingMode(nextPricingMode)
                : false,
              sessionId: existingSession.id,
              sessionDate: effectiveSessionDate,
              sessionStartTime:
                sessionStartTime === undefined
                  ? existingSession.startTime
                  : sessionStartTime,
              trialStudentIds: attendanceSource
                .filter((item) => item.status === AttendanceStatus.trial)
                .map((item) => item.studentId),
            },
          );
        }

        const oneTimeAlreadyChargedStudentIds = new Set<string>();
        if (
          shouldRebuildAttendanceState &&
          nextAttendanceStudentIds.length > 0 &&
          isOneTimePricingMode(existingSession.class.pricingMode)
        ) {
          await lockOneTimeClassCharges(tx, nextClassId);
          const charged = await findOneTimeChargedStudentIds(tx, {
            classId: nextClassId,
            studentIds: nextAttendanceStudentIds,
            excludeSessionId: existingSession.id,
          });
          charged.forEach((studentId) =>
            oneTimeAlreadyChargedStudentIds.add(studentId),
          );
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
              customTuitionPerBlock: true,
              customTuitionPackageTotal: true,
              customTuitionPackageSession: true,
              class: {
                select: {
                  studentTuitionPerSession: true,
                  studentTuitionPerBlock: true,
                  tuitionPackageTotal: true,
                  tuitionPackageSession: true,
                  pricingMode: true,
                },
              },
            },
          });

          studentClasses.forEach((studentClass) => {
            studentTuitionFeeByStudentId.set(
              studentClass.studentId,
              this.sessionValidationService.resolveDefaultStudentTuitionPerSession(
                {
                  pricingMode: studentClass.class?.pricingMode,
                  customTuitionPerSession:
                    studentClass.customStudentTuitionPerSession,
                  customTuitionPerBlock: studentClass.customTuitionPerBlock,
                  customTuitionPackageTotal:
                    studentClass.customTuitionPackageTotal,
                  customTuitionPackageSession:
                    studentClass.customTuitionPackageSession,
                  classTuitionPerSession:
                    studentClass.class?.studentTuitionPerSession,
                  classTuitionPerBlock:
                    studentClass.class?.studentTuitionPerBlock,
                  classTuitionPackageTotal:
                    studentClass.class?.tuitionPackageTotal,
                  classTuitionPackageSession:
                    studentClass.class?.tuitionPackageSession,
                  blockCount: existingSession.snapshotBlockCount,
                  oneTimeAlreadyCharged: oneTimeAlreadyChargedStudentIds.has(
                    studentClass.studentId,
                  ),
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
              select: {
                id: true,
                customerCareManagedByStaffId: true,
                customerCareManagedBy: { select: { roles: true } },
              },
            });
            careStaff.forEach((s) =>
              assistantManagerByStaffId.set(
                s.id,
                resolveSaleCsHeadManagerId(s),
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
              const oneTimeAlreadyCharged = oneTimeAlreadyChargedStudentIds.has(
                attendanceItem.studentId,
              );
              const resolvedTuitionFee = oneTimeAlreadyCharged
                ? this.sessionValidationService.resolveOneTimeAlreadyChargedTuitionFee(
                    attendanceItem.status,
                  )
                : data.attendance !== undefined
                  ? this.sessionValidationService.resolveChargeableAttendanceTuitionFee(
                      attendanceItem.status,
                      toBaseTuitionFee(
                        attendanceItem.studentId,
                        attendanceItem.tuitionFee,
                      ),
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
                        toBaseTuitionFee(
                          attendanceItem.studentId,
                          existingAttendance?.tuitionFee ?? null,
                        ),
                        null,
                      );

              // Buổi đã ghi giữ nguyên người chăm sóc / trưởng phòng đã chụp
              // (glossary «Người chăm sóc»): chỉ chụp lại khi dòng mới, đổi lớp
              // hoặc đổi giữa trạng thái tính phí và không tính phí.
              const refreshAssignments =
                shouldRefreshAttendanceAssignments &&
                (!existingAttendance ||
                  nextClassId !== existingSession.classId ||
                  this.sessionValidationService.isTuitionChargeableStatus(
                    existingAttendance.status,
                  ) !==
                    this.sessionValidationService.isTuitionChargeableStatus(
                      attendanceItem.status,
                    ));

              const resolvedCareStaffId = refreshAssignments
                ? (customerCareByStudentId.get(attendanceItem.studentId)
                    ?.staffId ?? null)
                : (existingAttendance?.customerCareStaffId ?? null);

              const resolvedAssistantId = refreshAssignments
                ? resolveAssistantManagerStaffIdForAttendance({
                    customerCareStaffId: resolvedCareStaffId,
                    customerCareManagedByStaffId: resolvedCareStaffId
                      ? (assistantManagerByStaffId.get(resolvedCareStaffId) ??
                        null)
                      : null,
                  })
                : (existingAttendance?.saleCsHeadStaffId ?? null);

              return {
                studentId: attendanceItem.studentId,
                status: attendanceItem.status,
                notes: attendanceItem.notes ?? null,
                tuitionFee: resolvedTuitionFee,
                customerCareCoef: refreshAssignments
                  ? (customerCareByStudentId.get(attendanceItem.studentId)
                      ?.profitPercent ?? null)
                  : (existingAttendance?.customerCareCoef ?? null),
                customerCareStaffId: resolvedCareStaffId,
                saleCsHeadStaffId: resolvedAssistantId,
                refreshAssignments,
                existingAttendanceId: existingAttendance?.id ?? null,
                existingTransactionId:
                  existingAttendance?.transactionId ?? null,
                existingCustomerCarePaymentStatus:
                  existingAttendance?.customerCarePaymentStatus ?? null,
                existingAssistantPaymentStatus:
                  existingAttendance?.saleCsHeadPaymentStatus ?? null,
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

        let trainingManagerUpdate:
          | {
              trainingManagerStaffId: string | null;
              trainingManagerRatePercent: number;
              trainingManagerAllowanceAmount: number | null;
              trainingManagerPaymentStatus: PaymentStatus | null;
            }
          | undefined;

        if (sessionTuitionFeeUpdate !== undefined) {
          const classTrainingConfig = await tx.class.findUnique({
            where: { id: nextClassId },
            select: {
              trainingManagerStaffId: true,
              trainingManagerRatePercent: true,
            },
          });
          trainingManagerUpdate = computeTrainingManagerSessionSnapshot({
            sessionTuitionTotal: sessionTuitionFeeUpdate,
            trainingManagerStaffId: classTrainingConfig?.trainingManagerStaffId,
            trainingManagerRatePercent:
              classTrainingConfig?.trainingManagerRatePercent,
          });
        }

        await tx.session.update({
          where: { id: sessionId },
          data: {
            ...(data.classId !== undefined && { classId: data.classId }),
            ...(data.teacherId !== undefined && { teacherId: data.teacherId }),
            ...(sessionDate !== undefined && { date: sessionDate }),
            ...(canWriteSessionTimes &&
              sessionStartTime !== undefined && {
                startTime: sessionStartTime,
              }),
            ...(canWriteSessionTimes &&
              sessionEndTime !== undefined && { endTime: sessionEndTime }),
            ...(canWriteSessionTimes &&
              snapshotBlockCountUpdate !== undefined && {
                snapshotBlockCount: snapshotBlockCountUpdate,
              }),
            ...(data.notes !== undefined && { notes: data.notes ?? null }),
            ...(data.lessonContent !== undefined && {
              lessonContent: data.lessonContent ?? null,
            }),
            ...(data.homework !== undefined && {
              homework: data.homework ?? null,
            }),
            ...(data.tutorial !== undefined && {
              tutorial: data.tutorial ?? null,
            }),
            ...sessionReview,
            ...(data.recordingUrl !== undefined && {
              recordingUrl: data.recordingUrl ? data.recordingUrl.trim() : null,
            }),
            ...(data.teacherPaymentStatus !== undefined && {
              teacherPaymentStatus: data.teacherPaymentStatus ?? 'unpaid',
            }),
            ...(coefficientUpdate !== undefined && {
              coefficient: coefficientUpdate,
            }),
            ...(allowanceAmountUpdate !== undefined && {
              allowanceAmount: allowanceAmountUpdate,
            }),
            ...(snapshotPerStudentAllowanceUpdate !== undefined && {
              snapshotPerStudentAllowance: snapshotPerStudentAllowanceUpdate,
            }),
            ...(snapshotScaleAmountUpdate !== undefined && {
              snapshotScaleAmount: snapshotScaleAmountUpdate,
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
            ...(trainingManagerUpdate
              ? {
                  trainingManagerStaffId:
                    trainingManagerUpdate.trainingManagerStaffId,
                  trainingManagerRatePercent:
                    trainingManagerUpdate.trainingManagerRatePercent,
                  trainingManagerAllowanceAmount:
                    trainingManagerUpdate.trainingManagerAllowanceAmount,
                  trainingManagerPaymentStatus:
                    trainingManagerUpdate.trainingManagerPaymentStatus,
                }
              : {}),
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
          await this.sessionTrialCatchUpService.releaseBeforeDelete(
            tx,
            attendanceIdsToDelete,
          );
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
              ? getTaxRate(staffId, SALE_CS_HEAD_ROLE)
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
                  trialCatchUpFee: null,
                  transactionId,
                  saleCsHeadStaffId: attendanceItem.saleCsHeadStaffId,
                  saleCsHeadPaymentStatus: attendanceItem.saleCsHeadStaffId
                    ? PaymentStatus.pending
                    : null,
                  saleCsHeadTaxDeductionRatePercent:
                    await resolveAssistantTaxRate(
                      attendanceItem.saleCsHeadStaffId,
                    ),
                },
                update: {
                  status: attendanceItem.status,
                  notes: attendanceItem.notes,
                  customerCareCoef: attendanceItem.refreshAssignments
                    ? attendanceItem.customerCareCoef
                    : undefined,
                  customerCareStaffId: attendanceItem.refreshAssignments
                    ? attendanceItem.customerCareStaffId
                    : undefined,
                  customerCarePaymentStatus: attendanceItem.refreshAssignments
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
                  trialCatchUpFee: null,
                  transactionId,
                  saleCsHeadStaffId: attendanceItem.refreshAssignments
                    ? attendanceItem.saleCsHeadStaffId
                    : undefined,
                  saleCsHeadPaymentStatus: attendanceItem.refreshAssignments
                    ? attendanceItem.saleCsHeadStaffId
                      ? (attendanceItem.existingAssistantPaymentStatus ??
                        PaymentStatus.pending)
                      : null
                    : undefined,
                  saleCsHeadTaxDeductionRatePercent:
                    await resolveAssistantTaxRate(
                      attendanceItem.saleCsHeadStaffId,
                    ),
                },
              });
            }),
          );
        }

        await Promise.all(
          [...attendanceReviewByStudentId].map(([studentId, review]) =>
            tx.attendance.updateMany({
              where: { sessionId, studentId },
              data: review,
            }),
          ),
        );

        if (sessionDate !== undefined || sessionStartTime !== undefined) {
          await syncClassTimelineSortByTime(tx, nextClassId);
        }

        const updatedSession = await tx.session.findUnique({
          where: { id: sessionId },
          include: { attendance: true },
        });

        if (updatedSession) {
          await syncLessonPlanHeadCommissions(
            tx,
            updatedSession.attendance.map(
              (attendanceItem) => attendanceItem.id,
            ),
          );
        }

        if (!updatedSession) {
          throw new NotFoundException('Session not found');
        }

        await this.sessionTrialCatchUpService.reconcile(tx, [
          ...existingSession.attendance.map((attendanceItem) => ({
            studentId: attendanceItem.studentId,
            classId: existingSession.classId,
          })),
          ...updatedSession.attendance.map((attendanceItem) => ({
            studentId: attendanceItem.studentId,
            classId: nextClassId,
          })),
        ]);

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

    if (data.recordingUrl !== undefined) {
      this.protectedVideos?.track(data.recordingUrl);
    }
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
      lessonContent?: string;
      homework?: string;
      tutorial?: string;
      recordingUrl?: string | null;
      coefficient?: number;
      attendance?: Array<
        AttendanceReviewInput & {
          studentId: string;
          status: NonNullable<SessionUpdateDto['attendance']>[number]['status'];
          notes?: string | null;
        }
      >;
    } & SessionReviewInput,
    auditActor?: ActionHistoryActor,
  ) {
    const existingSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        snapshotNoAttendance: true,
        snapshotBlockCount: true,
        coefficient: true,
        teacherPaymentStatus: true,
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

    // #275: gia sư chỉ buổi do mình dạy; Admin + Quản lý lớp mọi buổi của lớp
    // (hợp quyền). Kế toán / Ban Đào tạo không quản lý lớp → 403.
    const access = await this.staffOperationsAccess.resolveClassWorkAccess(
      userId,
      roleType,
      existingSession.classId,
    );
    if (!canWorkOnClassSession(access, existingSession.teacherId)) {
      throw new ForbiddenException(
        'Bạn chỉ được sửa buổi học do chính mình dạy.',
      );
    }

    const nextCoefficient = this.sessionValidationService.normalizeCoefficient(
      data.coefficient,
    );
    const hasCoefficientChange =
      nextCoefficient !== undefined &&
      nextCoefficient !== Number(existingSession.coefficient ?? 1);
    if (
      hasCoefficientChange &&
      !canEditClassSessionCoefficient(access, existingSession.teacherId)
    ) {
      throw new ForbiddenException(
        'Quản lý lớp không được đổi hệ số hay đánh dấu dạy thử của buổi gia sư khác.',
      );
    }

    // Trợ cấp = allowance_amount × coefficient: đổi Dạy thử sau khi đã chốt
    // thanh toán/cọc sẽ làm lệch số đã chi, nên staff-ops không cho đổi.
    if (
      hasCoefficientChange &&
      this.sessionValidationService.isSessionTimeEditLocked(
        existingSession.teacherPaymentStatus,
      )
    ) {
      throw new BadRequestException(
        'Không thể đổi Dạy thử của buổi đã thanh toán hoặc ghi cọc.',
      );
    }

    data = stripAttendanceForNoAttendanceSession(
      data,
      existingSession.snapshotNoAttendance,
    );

    let enrichedAttendance: SessionUpdateDto['attendance'] | undefined;
    if (data.attendance !== undefined) {
      const tuitionByStudentId =
        await this.sessionRosterService.assertAttendanceStudentsBelongToClass(
          existingSession.classId,
          data.attendance.map((attendanceItem) => attendanceItem.studentId),
          { blockCount: existingSession.snapshotBlockCount },
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
        ...pickAttendanceReviewInput(attendanceItem),
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
        lessonContent: data.lessonContent,
        homework: data.homework,
        tutorial: data.tutorial,
        ...pickSessionReviewInput(data),
        recordingUrl: data.recordingUrl,
        // Dạy thử: Admin hoặc gia sư trên buổi của mình (#275); FE chỉ gửi khi đổi toggle.
        coefficient: data.coefficient,
        attendance: enrichedAttendance,
      },
      auditActor,
    );
  }

  /**
   * `PATCH /staff-ops/sessions/:id/training-head` (14/11): Trưởng ban Đào tạo
   * (mọi lớp) chỉnh tay trợ cấp buổi, tick Dạy thử (hệ số 0/1) và tick Học
   * thử từng học sinh. Không đụng nội dung / giờ / nhận xét.
   * - Luật #265: không sửa buổi do chính mình dạy.
   * - Buổi đã thanh toán / ghi cọc: không đổi trợ cấp hay Dạy thử.
   * - Điểm danh: chỉ đổi sang / ra khỏi Học thử; học sinh khác giữ nguyên.
   */
  async updateSessionAsTrainingHead(
    userId: string,
    roleType: UserRole,
    sessionId: string,
    data: TrainingHeadSessionUpdateDto,
    auditActor?: ActionHistoryActor,
  ) {
    const policyActor = await resolveStaffPolicyActor(this.prisma, {
      userId,
      roleType,
    });
    if (!policyActor.isAdmin && !isTrainingHeadActor(policyActor.roles)) {
      throw new ForbiddenException(
        'Chỉ Admin hoặc Trưởng ban Đào tạo được chỉnh tay trợ cấp và học thử của buổi.',
      );
    }

    const existingSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        snapshotNoAttendance: true,
        snapshotBlockCount: true,
        coefficient: true,
        allowanceAmount: true,
        teacherPaymentStatus: true,
        attendance: {
          select: {
            studentId: true,
            status: true,
            notes: true,
            tuitionFee: true,
            testCorrectCount: true,
            testComment: true,
            strengths: true,
            improvements: true,
            homeworkQuality: true,
            homeworkComment: true,
          },
        },
      },
    });
    if (!existingSession) {
      throw new NotFoundException('Session not found');
    }

    assertNotEditingOwnCompensation(policyActor, [existingSession.teacherId]);

    const nextCoefficient = this.sessionValidationService.normalizeCoefficient(
      data.coefficient,
    );
    const hasCoefficientChange =
      nextCoefficient !== undefined &&
      nextCoefficient !== Number(existingSession.coefficient ?? 1);
    const hasAllowanceChange =
      data.allowanceAmount !== undefined &&
      data.allowanceAmount !== existingSession.allowanceAmount;
    if (
      (hasCoefficientChange || hasAllowanceChange) &&
      this.sessionValidationService.isSessionTimeEditLocked(
        existingSession.teacherPaymentStatus,
      )
    ) {
      throw new BadRequestException(
        'Không thể đổi trợ cấp hoặc Dạy thử của buổi đã thanh toán hoặc ghi cọc.',
      );
    }

    let attendance: SessionUpdateDto['attendance'] | undefined;
    if (data.attendance?.length) {
      if (existingSession.snapshotNoAttendance) {
        throw new BadRequestException('Buổi này không có điểm danh học sinh.');
      }
      const changes = resolveTrainingHeadAttendanceChanges(
        new Map(
          existingSession.attendance.map((row) => [row.studentId, row.status]),
        ),
        data.attendance,
      );
      if (changes.length > 0) {
        const nextStatusByStudentId = new Map(
          changes.map((change) => [change.studentId, change.status]),
        );
        const defaultTuitionByStudentId =
          await this.sessionRosterService.assertAttendanceStudentsBelongToClass(
            existingSession.classId,
            existingSession.attendance.map((row) => row.studentId),
            { blockCount: existingSession.snapshotBlockCount },
          );
        // Payload attendance thay toàn bộ điểm danh → gửi lại đủ học sinh, giữ
        // ghi chú + nhận xét; học phí tính lại theo trạng thái mới.
        attendance = existingSession.attendance.map((row) => {
          const status = nextStatusByStudentId.get(row.studentId) ?? row.status;
          return {
            studentId: row.studentId,
            status,
            notes: row.notes,
            ...pickAttendanceReviewInput({
              testCorrectCount: row.testCorrectCount,
              testComment: row.testComment,
              strengths: row.strengths,
              improvements: row.improvements,
              homeworkQuality: row.homeworkQuality,
              homeworkComment: row.homeworkComment,
            } as AttendanceReviewInput),
            tuitionFee:
              this.sessionValidationService.resolveChargeableAttendanceTuitionFee(
                status,
                row.tuitionFee ?? null,
                defaultTuitionByStudentId.get(row.studentId) ?? null,
              ),
          };
        });
      }
    }

    if (!hasCoefficientChange && !hasAllowanceChange && !attendance) {
      throw new BadRequestException('Không có thay đổi nào để lưu.');
    }

    const updated = await this.updateSession(
      {
        id: sessionId,
        ...(hasCoefficientChange && { coefficient: nextCoefficient }),
        // Đổi Học thử mà không nhập trợ cấp → updateSession tự tính lại trợ cấp
        // theo số học sinh tính phí; nhập tay thì số nhập tay thắng.
        ...(hasAllowanceChange && { allowanceAmount: data.allowanceAmount }),
        attendance,
      },
      auditActor,
      { skipRequired: true },
    );

    return policyActor.isAdmin
      ? updated
      : redactSessionForTrainingHeadView(updated);
  }
}

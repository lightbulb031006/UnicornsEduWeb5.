import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  PaymentStatus,
  StaffRole,
  StudentClassStatus,
  UserRole,
  WalletTransactionType,
  ClassTimelineItemKind,
} from '../../generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from '../action-history/action-history.service';
import { SessionCreateDto } from '../dtos/session.dto';
import { PrismaService } from '../prisma/prisma.service';
import { StaffOperationsAccessService } from '../staff-ops/staff-operations-access.service';
import { SessionLedgerService } from './session-ledger.service';
import { SessionRosterService } from './session-roster.service';
import { SessionSnapshotService } from './session-snapshot.service';
import { SessionStudentBalanceService } from './session-student-balance.service';
import { SessionValidationService } from './session-validation.service';
import { SessionScheduleRulesService } from './session-schedule-rules.service';
import { computeTrainingManagerSessionSnapshot } from '../training-manager/training-manager.utils';
import { createMemoizedTaxDeductionResolver } from '../payroll/deduction-rates';
import { resolveAssistantManagerStaffIdForAttendance } from '../payroll/assistant-share.util';
import { syncLessonPlanHeadCommissions } from '../payroll/lesson-plan-head-commission.util';
import { resolveLiveSessionAllowanceSnapshots } from './session-allowance.util';
import { appendClassTimelineItem } from '../class-timeline/append-timeline-item';
import {
  presentCustomAllowanceAsPerSession,
  standardBlockCountFromSlots,
} from '../common/block-pricing.util';
import {
  isBlockPricingMode,
  resolveAllowanceReconstructionBlockCount,
  resolveSnapshotBlockCountForPricingMode,
} from '../common/class-pricing-mode.util';

/** Interactive tx: create runs many reads, balance/wallet writes, nested attendance create, optional audit snapshot. */
const SESSION_CREATE_TRANSACTION_MAX_WAIT_MS = 10_000;
const SESSION_CREATE_TRANSACTION_TIMEOUT_MS = 20_000;

export function shouldEnforceDeclaredSchedule(
  actor?: ActionHistoryActor,
): boolean {
  return actor?.roleType !== UserRole.admin;
}

@Injectable()
export class SessionCreateService {
  private readonly activeSessionCreations = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
    private readonly sessionRosterService: SessionRosterService,
    private readonly sessionValidationService: SessionValidationService,
    private readonly sessionStudentBalanceService: SessionStudentBalanceService,
    private readonly sessionLedgerService: SessionLedgerService,
    private readonly sessionSnapshotService: SessionSnapshotService,
    private readonly sessionScheduleRulesService: SessionScheduleRulesService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

  async createSession(data: SessionCreateDto, actor?: ActionHistoryActor) {
    const lockKey = `${data.classId}:${data.date}:${data.startTime || ''}`;
    if (this.activeSessionCreations.has(lockKey)) {
      throw new BadRequestException(
        'Yêu cầu tạo buổi học đang được xử lý, vui lòng không click nhiều lần.',
      );
    }
    this.activeSessionCreations.add(lockKey);

    try {
      this.sessionValidationService.validateSessionCommentFields(
        {
          lessonContent: data.lessonContent,
          homework: data.homework,
          tutorial: data.tutorial,
        },
        { required: true },
      );
      const classPricing = await this.prisma.class.findUnique({
        where: { id: data.classId },
        select: { pricingMode: true },
      });
      if (!classPricing) {
        throw new NotFoundException('Class not found');
      }
      const requireSessionTimes = isBlockPricingMode(classPricing.pricingMode);
      this.sessionValidationService.assertRequiredSessionTimes(
        data.startTime,
        data.endTime,
        { required: requireSessionTimes },
      );
      const hasSessionTimes = Boolean(
        (typeof data.startTime === 'string' && data.startTime.trim()) ||
        (typeof data.endTime === 'string' && data.endTime.trim()),
      );
      const sessionStartTime = hasSessionTimes
        ? this.sessionValidationService.parseSessionTime(
            data.startTime as string,
            'startTime',
          )
        : null;
      const sessionEndTime = hasSessionTimes
        ? this.sessionValidationService.parseSessionTime(
            data.endTime as string,
            'endTime',
          )
        : null;
      if (hasSessionTimes) {
        this.sessionValidationService.assertSessionEndAfterStart(
          sessionStartTime as Date,
          sessionEndTime as Date,
        );
      }

      const createdSession = await this.prisma.$transaction(
        async (tx) => {
          const sessionDate = this.sessionValidationService.parseSessionDate(
            data.date,
          );
          const getTaxRate = createMemoizedTaxDeductionResolver(
            tx,
            sessionDate,
          );

          const classTeacher = await tx.classTeacher.findUnique({
            where: {
              classId_teacherId: {
                classId: data.classId,
                teacherId: data.teacherId,
              },
            },
            select: {
              customAllowance: true,
              operatingDeductionRatePercent: true,
              class: {
                select: {
                  name: true,
                  noAttendance: true,
                  pricingMode: true,
                  allowancePerSessionPerStudent: true,
                  allowancePerBlockPerStudent: true,
                  scaleAmount: true,
                  trainingManagerStaffId: true,
                  trainingManagerRatePercent: true,
                },
              },
            },
          });

          if (!classTeacher) {
            throw new NotFoundException(
              'Class teacher not found for this class and teacher.',
            );
          }

          const isNoAttendanceClass = classTeacher.class.noAttendance;

          let resolvedAttendanceInput: NonNullable<
            SessionCreateDto['attendance']
          >;

          if (isNoAttendanceClass) {
            // Auto-generate attendance: present for all active students
            const activeStudents = await tx.studentClass.findMany({
              where: {
                classId: data.classId,
                status: StudentClassStatus.active,
              },
              select: { studentId: true },
            });
            resolvedAttendanceInput = activeStudents.map((sc) => ({
              studentId: sc.studentId,
              status: AttendanceStatus.present,
              notes: null,
            }));
          } else {
            const attendanceInput = data.attendance ?? [];
            this.sessionValidationService.validateAttendanceItems(
              attendanceInput,
              { required: true },
            );
            this.sessionValidationService.validateAttendanceNotes(
              attendanceInput,
              { required: true },
            );
            resolvedAttendanceInput = attendanceInput;
          }

          const attendanceStudentIds = resolvedAttendanceInput.map(
            (attendanceItem) => attendanceItem.studentId,
          );
          const chargeableAttendanceStudentIds = resolvedAttendanceInput
            .filter((item) =>
              this.sessionValidationService.isTuitionChargeableStatus(
                item.status,
              ),
            )
            .map((attendanceItem) => attendanceItem.studentId);

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

          const studentClasses = await tx.studentClass.findMany({
            where: {
              studentId: {
                in: attendanceStudentIds,
              },
              classId: data.classId,
              status: StudentClassStatus.active,
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
                },
              },
              student: {
                select: {
                  accountBalance: true,
                },
              },
            },
          });

          const customerCareByStudentId = new Map(
            studentCustomerCare.map((customerCare) => [
              customerCare.studentId,
              customerCare,
            ]),
          );

          const uniqueCareStaffIds = [
            ...new Set(
              studentCustomerCare
                .map((cc) => cc.staffId)
                .filter((id): id is string => !!id),
            ),
          ];
          const assistantManagerByStaffId = new Map<string, string | null>();
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

          const studentClassByStudentId = new Map(
            studentClasses.map((studentClass) => [
              studentClass.studentId,
              studentClass,
            ]),
          );
          const studentAccountBalanceByStudentId = new Map(
            studentClasses.map((studentClass) => [
              studentClass.studentId,
              studentClass.student.accountBalance,
            ]),
          );

          const scheduleMatch = shouldEnforceDeclaredSchedule(actor)
            ? await this.sessionScheduleRulesService.assertSessionMatchesDeclaredSchedule(
                tx,
                {
                  classId: data.classId,
                  teacherId: data.teacherId,
                  date: sessionDate,
                  startTime: data.startTime,
                },
              )
            : {};

          const uniqueAttendanceStudentIds = new Set(attendanceStudentIds);
          if (studentClasses.length !== uniqueAttendanceStudentIds.size) {
            throw new BadRequestException(
              'attendance chỉ được phép chứa học sinh thuộc lớp học hiện tại.',
            );
          }

          const coefficient =
            this.sessionValidationService.normalizeCoefficient(
              data.coefficient,
            ) ?? 1.0;
          let snapshotBlockCount = resolveSnapshotBlockCountForPricingMode({
            pricingMode: classTeacher.class.pricingMode,
            startTime: data.startTime,
            endTime: data.endTime,
          });
          const scheduleRows = await tx.classScheduleEntry.findMany({
            where: { classId: data.classId, effectiveTo: null },
            select: { from: true, to: true },
          });
          const standardBlockCount = standardBlockCountFromSlots(scheduleRows);
          if (
            isBlockPricingMode(classTeacher.class.pricingMode) &&
            snapshotBlockCount == null
          ) {
            snapshotBlockCount = standardBlockCount;
          }
          const reconstructionBlocks = resolveAllowanceReconstructionBlockCount(
            {
              snapshotBlockCount,
              startTime: data.startTime,
              endTime: data.endTime,
              standardBlockCount,
            },
          );
          const storedAsPerBlock =
            classTeacher.class.allowancePerBlockPerStudent != null;
          const liveAllowance = resolveLiveSessionAllowanceSnapshots({
            pricingMode: classTeacher.class.pricingMode,
            customAllowanceStored: classTeacher.customAllowance,
            classDefaultPerStudent:
              classTeacher.class.allowancePerSessionPerStudent,
            classDefaultPerBlock:
              classTeacher.class.allowancePerBlockPerStudent,
            scaleAmount: classTeacher.class.scaleAmount,
            reconstructionBlocks,
            storedAsPerBlock,
            snapshotBlockCount,
            chargeableStudentCount: chargeableAttendanceStudentIds.length,
            presentCustomAsPerSession: presentCustomAllowanceAsPerSession(
              classTeacher.customAllowance,
              reconstructionBlocks,
              storedAsPerBlock,
            ),
          });
          const snapshotPerStudentAllowance =
            liveAllowance.snapshotPerStudentAllowance;
          const snapshotScaleAmount = liveAllowance.snapshotScaleAmount;
          const allowanceAmount =
            data.allowanceAmount !== undefined && data.allowanceAmount !== null
              ? Math.floor(Number(data.allowanceAmount))
              : liveAllowance.allowanceAmount;
          const includeTeacherOperatingDeduction =
            data.includeTeacherOperatingDeduction !== false;
          const currentTeacherOperatingDeductionRatePercent =
            includeTeacherOperatingDeduction
              ? Number(classTeacher.operatingDeductionRatePercent ?? 0)
              : 0;
          const teacherOperatingDeductionRatePercent =
            includeTeacherOperatingDeduction &&
            Number.isFinite(currentTeacherOperatingDeductionRatePercent)
              ? Math.round(currentTeacherOperatingDeductionRatePercent * 100) /
                100
              : 0;
          const teacherTaxDeductionRatePercent = await getTaxRate(
            data.teacherId,
            StaffRole.teacher,
          );

          const resolvedAttendance = resolvedAttendanceInput.map(
            (attendanceItem) => {
              const customerCare = customerCareByStudentId.get(
                attendanceItem.studentId,
              );

              return {
                studentId: attendanceItem.studentId,
                status: attendanceItem.status,
                notes: attendanceItem.notes ?? null,
                customerCareCoef: customerCare?.profitPercent,
                customerCareStaffId: customerCare?.staffId,
                tuitionFee:
                  this.sessionValidationService.resolveChargeableAttendanceTuitionFee(
                    attendanceItem.status,
                    attendanceItem.tuitionFee,
                    this.sessionValidationService.resolveDefaultStudentTuitionPerSession(
                      {
                        pricingMode: classTeacher.class.pricingMode,
                        customTuitionPerSession: studentClassByStudentId.get(
                          attendanceItem.studentId,
                        )?.customStudentTuitionPerSession,
                        customTuitionPerBlock: studentClassByStudentId.get(
                          attendanceItem.studentId,
                        )?.customTuitionPerBlock,
                        customTuitionPackageTotal: studentClassByStudentId.get(
                          attendanceItem.studentId,
                        )?.customTuitionPackageTotal,
                        customTuitionPackageSession:
                          studentClassByStudentId.get(attendanceItem.studentId)
                            ?.customTuitionPackageSession,
                        classTuitionPerSession: studentClassByStudentId.get(
                          attendanceItem.studentId,
                        )?.class?.studentTuitionPerSession,
                        classTuitionPerBlock: studentClassByStudentId.get(
                          attendanceItem.studentId,
                        )?.class?.studentTuitionPerBlock,
                        classTuitionPackageTotal: studentClassByStudentId.get(
                          attendanceItem.studentId,
                        )?.class?.tuitionPackageTotal,
                        classTuitionPackageSession: studentClassByStudentId.get(
                          attendanceItem.studentId,
                        )?.class?.tuitionPackageSession,
                        blockCount: snapshotBlockCount,
                      },
                    ),
                  ),
                accountBalance: studentAccountBalanceByStudentId.get(
                  attendanceItem.studentId,
                ),
              };
            },
          );

          const tuitionFee = resolvedAttendance.reduce(
            (sum, attendanceItem) => sum + (attendanceItem.tuitionFee ?? 0),
            0,
          );
          const trainingManagerSnapshot = computeTrainingManagerSessionSnapshot(
            {
              sessionTuitionTotal: tuitionFee,
              trainingManagerStaffId: classTeacher.class.trainingManagerStaffId,
              trainingManagerRatePercent:
                classTeacher.class.trainingManagerRatePercent,
            },
          );

          const attendanceWithCharge = resolvedAttendance.filter(
            (attendanceItem) => (attendanceItem.tuitionFee ?? 0) > 0,
          );

          await this.sessionStudentBalanceService.applyBalanceChanges(
            tx,
            attendanceWithCharge.map((attendanceItem) => ({
              studentId: attendanceItem.studentId,
              change: -(attendanceItem.tuitionFee ?? 0),
            })),
          );

          const studentTransactionAttendanceId = new Map<string, string>();

          if (attendanceWithCharge.length > 0) {
            const transactions =
              await tx.walletTransactionsHistory.createManyAndReturn({
                data: attendanceWithCharge.map((attendanceItem) => ({
                  studentId: attendanceItem.studentId,
                  amount: attendanceItem.tuitionFee ?? 0,
                  type: WalletTransactionType.extend,
                  note: this.sessionLedgerService.buildChargeNote({
                    className: classTeacher.class.name,
                    dateLabel: data.date,
                    balanceBefore: attendanceItem.accountBalance ?? 0,
                    amount: attendanceItem.tuitionFee ?? 0,
                  }),
                })),
              });

            transactions.forEach((transaction) => {
              studentTransactionAttendanceId.set(
                transaction.studentId,
                transaction.id,
              );
            });
          }

          const attendanceCreateData = await Promise.all(
            resolvedAttendance.map(async (attendanceItem) => {
              const assistantId = resolveAssistantManagerStaffIdForAttendance({
                customerCareStaffId: attendanceItem.customerCareStaffId,
                customerCareManagedByStaffId: attendanceItem.customerCareStaffId
                  ? (assistantManagerByStaffId.get(
                      attendanceItem.customerCareStaffId,
                    ) ?? null)
                  : null,
              });

              return {
                studentId: attendanceItem.studentId,
                status: attendanceItem.status,
                notes: attendanceItem.notes,
                customerCareCoef: attendanceItem.customerCareCoef,
                customerCareStaffId: attendanceItem.customerCareStaffId,
                customerCarePaymentStatus: attendanceItem.customerCareStaffId
                  ? PaymentStatus.pending
                  : null,
                customerCareTaxDeductionRatePercent:
                  attendanceItem.customerCareStaffId
                    ? await getTaxRate(
                        attendanceItem.customerCareStaffId,
                        StaffRole.customer_care,
                      )
                    : 0,
                tuitionFee: attendanceItem.tuitionFee,
                transactionId: studentTransactionAttendanceId.get(
                  attendanceItem.studentId,
                ),
                assistantManagerStaffId: assistantId,
                assistantPaymentStatus: assistantId
                  ? PaymentStatus.pending
                  : null,
                assistantTaxDeductionRatePercent: assistantId
                  ? await getTaxRate(assistantId, StaffRole.assistant)
                  : 0,
              };
            }),
          );

          const createdSession = await tx.session.create({
            data: {
              classId: data.classId,
              teacherId: data.teacherId,
              snapshotNoAttendance: isNoAttendanceClass,
              coefficient,
              allowanceAmount,
              snapshotPerStudentAllowance,
              snapshotScaleAmount,
              snapshotBlockCount,
              teacherOperatingDeductionRatePercent: Number.isFinite(
                teacherOperatingDeductionRatePercent,
              )
                ? Math.round(teacherOperatingDeductionRatePercent * 100) / 100
                : 0,
              teacherTaxDeductionRatePercent: Number.isFinite(
                teacherTaxDeductionRatePercent,
              )
                ? Math.round(teacherTaxDeductionRatePercent * 100) / 100
                : 0,
              tuitionFee,
              date: sessionDate,
              startTime: sessionStartTime,
              endTime: sessionEndTime,
              notes: data.notes ?? null,
              lessonContent: data.lessonContent ?? null,
              homework: data.homework ?? null,
              tutorial: data.tutorial ?? null,
              recordingUrl: data.recordingUrl ? data.recordingUrl.trim() : null,
              teacherPaymentStatus: data.teacherPaymentStatus ?? undefined,
              trainingManagerStaffId:
                trainingManagerSnapshot.trainingManagerStaffId,
              trainingManagerRatePercent:
                trainingManagerSnapshot.trainingManagerRatePercent,
              trainingManagerAllowanceAmount:
                trainingManagerSnapshot.trainingManagerAllowanceAmount,
              trainingManagerPaymentStatus:
                trainingManagerSnapshot.trainingManagerPaymentStatus,
              attendance: {
                createMany: {
                  data: attendanceCreateData,
                },
              },
            },
            include: {
              attendance: true,
            },
          });

          if (scheduleMatch.makeupEventId) {
            await this.sessionScheduleRulesService.linkMakeupEventToSession(
              tx,
              scheduleMatch.makeupEventId,
              createdSession.id,
            );
          }

          await syncLessonPlanHeadCommissions(
            tx,
            createdSession.attendance.map(
              (attendanceItem) => attendanceItem.id,
            ),
          );

          if (actor) {
            const afterValue =
              await this.sessionSnapshotService.getSessionAuditSnapshot(
                tx,
                createdSession.id,
              );

            await this.actionHistoryService.recordCreate(tx, {
              actor,
              entityType: 'session',
              entityId: createdSession.id,
              description: 'Tạo buổi học',
              afterValue,
            });
          }

          await appendClassTimelineItem(tx, {
            classId: data.classId,
            kind: ClassTimelineItemKind.session,
            sessionId: createdSession.id,
          });

          return createdSession;
        },
        {
          maxWait: SESSION_CREATE_TRANSACTION_MAX_WAIT_MS,
          timeout: SESSION_CREATE_TRANSACTION_TIMEOUT_MS,
        },
      );

      return createdSession;
    } finally {
      this.activeSessionCreations.delete(lockKey);
    }
  }

  async createSessionForStaff(
    userId: string,
    roleType: UserRole,
    classId: string,
    data: {
      date: string;
      startTime?: string;
      endTime?: string;
      notes?: string | null;
      lessonContent: string;
      homework: string;
      tutorial: string;
      recordingUrl?: string | null;
      coefficient?: number;
      attendance?: Array<{
        studentId: string;
        status: (typeof AttendanceStatus)[keyof typeof AttendanceStatus];
        notes?: string | null;
      }>;
    },
    auditActor?: ActionHistoryActor,
  ) {
    const actor = await this.staffOperationsAccess.resolveActor(
      userId,
      roleType,
    );
    const isTeacher = actor.roles.includes(StaffRole.teacher);
    if (isTeacher) {
      await this.staffOperationsAccess.assertTeacherAssignedToClass(
        actor.id,
        classId,
      );
    }

    if (data.attendance && data.attendance.length > 0) {
      await this.sessionRosterService.assertAttendanceStudentsBelongToClass(
        classId,
        data.attendance.map((attendanceItem) => attendanceItem.studentId),
      );
    }

    const teacherId = isTeacher
      ? actor.id
      : await this.staffOperationsAccess.resolveSingleTeacherForClass(classId);

    return this.createSession(
      {
        classId,
        teacherId,
        date: data.date,
        coefficient: data.coefficient,
        startTime: data.startTime,
        endTime: data.endTime,
        notes: data.notes ?? null,
        lessonContent: data.lessonContent,
        homework: data.homework,
        tutorial: data.tutorial,
        recordingUrl: data.recordingUrl ?? null,
        attendance: (data.attendance ?? []).map((attendanceItem) => ({
          studentId: attendanceItem.studentId,
          status: attendanceItem.status,
          notes: attendanceItem.notes ?? null,
        })),
      },
      auditActor,
    );
  }
}

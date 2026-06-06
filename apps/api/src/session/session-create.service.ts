import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  StaffRole,
  StudentClassStatus,
  UserRole,
  WalletTransactionType,
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
import { createMemoizedTaxDeductionResolver } from '../payroll/deduction-rates';
import {
  computeDefaultSessionAllowanceAmountVnd,
  resolveSnapshotPerStudentAllowanceVnd,
  resolveSnapshotScaleAmountVnd,
} from './session-allowance.util';

/** Interactive tx: create runs many reads, balance/wallet writes, nested attendance create, optional audit snapshot. */
const SESSION_CREATE_TRANSACTION_MAX_WAIT_MS = 10_000;
const SESSION_CREATE_TRANSACTION_TIMEOUT_MS = 20_000;

@Injectable()
export class SessionCreateService {
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
    this.sessionValidationService.validateAttendanceItems(data.attendance, {
      required: true,
    });

    const createdSession = await this.prisma.$transaction(
      async (tx) => {
        const sessionDate = this.sessionValidationService.parseSessionDate(
          data.date,
        );
        const getTaxRate = createMemoizedTaxDeductionResolver(tx, sessionDate);
        const attendanceStudentIds = data.attendance.map(
          (attendanceItem) => attendanceItem.studentId,
        );
        const chargeableAttendanceStudentIds = data.attendance
          .filter((item) =>
            this.sessionValidationService.isTuitionChargeableStatus(
              item.status,
            ),
          )
          .map((attendanceItem) => attendanceItem.studentId);

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
                allowancePerSessionPerStudent: true,
                scaleAmount: true,
              },
            },
          },
        });

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
            class: {
              select: {
                studentTuitionPerSession: true,
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
            assistantManagerByStaffId.set(s.id, s.customerCareManagedByStaffId),
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

        if (!classTeacher) {
          throw new NotFoundException(
            'Class teacher not found for this class and teacher.',
          );
        }

        const scheduleMatch =
          await this.sessionScheduleRulesService.assertSessionMatchesDeclaredSchedule(
            tx,
            {
              classId: data.classId,
              teacherId: data.teacherId,
              date: sessionDate,
              startTime: data.startTime,
            },
          );

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
        const snapshotPerStudentAllowance = resolveSnapshotPerStudentAllowanceVnd(
          {
            customAllowance: classTeacher.customAllowance,
            classDefaultPerStudent:
              classTeacher.class.allowancePerSessionPerStudent,
          },
        );
        const snapshotScaleAmount = resolveSnapshotScaleAmountVnd(
          classTeacher.class.scaleAmount,
        );
        const allowanceAmount =
          data.allowanceAmount !== undefined && data.allowanceAmount !== null
            ? Math.floor(Number(data.allowanceAmount))
            : computeDefaultSessionAllowanceAmountVnd({
                perStudentAllowance: snapshotPerStudentAllowance,
                classDefaultPerStudent: null,
                scaleAmount: snapshotScaleAmount,
                chargeableStudentCount: chargeableAttendanceStudentIds.length,
              });
        const currentTeacherOperatingDeductionRatePercent = Number(
          classTeacher.operatingDeductionRatePercent ?? 0,
        );
        const teacherOperatingDeductionRatePercent = Number.isFinite(
          currentTeacherOperatingDeductionRatePercent,
        )
          ? Math.round(currentTeacherOperatingDeductionRatePercent * 100) / 100
          : 0;
        const teacherTaxDeductionRatePercent = await getTaxRate(
          data.teacherId,
          StaffRole.teacher,
        );

        const resolvedAttendance = data.attendance.map((attendanceItem) => {
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
                    customTuitionPerSession: studentClassByStudentId.get(
                      attendanceItem.studentId,
                    )?.customStudentTuitionPerSession,
                    classTuitionPerSession: studentClassByStudentId.get(
                      attendanceItem.studentId,
                    )?.class?.studentTuitionPerSession,
                    classTuitionPackageTotal: studentClassByStudentId.get(
                      attendanceItem.studentId,
                    )?.class?.tuitionPackageTotal,
                    classTuitionPackageSession: studentClassByStudentId.get(
                      attendanceItem.studentId,
                    )?.class?.tuitionPackageSession,
                  },
                ),
              ),
            accountBalance: studentAccountBalanceByStudentId.get(
              attendanceItem.studentId,
            ),
          };
        });

        const tuitionFee = resolvedAttendance.reduce(
          (sum, attendanceItem) => sum + (attendanceItem.tuitionFee ?? 0),
          0,
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
            const assistantId = attendanceItem.customerCareStaffId
              ? (assistantManagerByStaffId.get(
                  attendanceItem.customerCareStaffId,
                ) ?? null)
              : null;

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
            coefficient,
            allowanceAmount,
            snapshotPerStudentAllowance,
            snapshotScaleAmount,
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
            startTime: data.startTime
              ? this.sessionValidationService.parseSessionTime(
                  data.startTime,
                  'startTime',
                )
              : null,
            endTime: data.endTime
              ? this.sessionValidationService.parseSessionTime(
                  data.endTime,
                  'endTime',
                )
              : null,
            notes: data.notes ?? null,
            teacherPaymentStatus: data.teacherPaymentStatus ?? undefined,
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

        return createdSession;
      },
      {
        maxWait: SESSION_CREATE_TRANSACTION_MAX_WAIT_MS,
        timeout: SESSION_CREATE_TRANSACTION_TIMEOUT_MS,
      },
    );

    return createdSession;
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
      coefficient?: number;
      attendance: Array<{
        studentId: string;
        status: SessionCreateDto['attendance'][number]['status'];
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

    await this.sessionRosterService.assertAttendanceStudentsBelongToClass(
      classId,
      data.attendance.map((attendanceItem) => attendanceItem.studentId),
    );

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
        attendance: data.attendance.map((attendanceItem) => ({
          studentId: attendanceItem.studentId,
          status: attendanceItem.status,
          notes: attendanceItem.notes ?? null,
        })),
      },
      auditActor,
    );
  }
}

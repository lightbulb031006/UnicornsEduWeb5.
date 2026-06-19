import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from '../action-history/action-history.service';
import {
  ClassStatus,
  Gender,
  StaffRole,
  StudentClassStatus,
  StudentStatus,
  StudentWalletDirectTopUpRequestStatus,
  UserRole,
  WalletTransactionType,
} from 'generated/enums';
import { Prisma } from '../../generated/client';
import {
  CreateStudentSePayTopUpOrderDto,
  CreateStudentWalletDirectTopUpRequestDto,
  CreateStudentDto,
  StudentSePayStaticQrResponseDto,
  StudentSePayTopUpOrderResponseDto,
  StudentWalletDirectTopUpApprovalResultDto,
  StudentWalletDirectTopUpRequestListQueryDto,
  StudentWalletDirectTopUpRequestListResponseDto,
  StudentWalletDirectTopUpRequestResponseDto,
  StudentWalletHistoryQueryDto,
  StudentListQueryDto,
  UpdateMyStudentAccountBalanceDto,
  UpdateStudentAccountBalanceCreateDto,
  UpdateStudentBodyDto,
  UpdateStudentClassesDto,
  UpdateStudentDto,
  UpdateStudentStatusDto,
} from 'src/dtos/student.dto';
import { StudentLandingProfileQueryDto } from 'src/dtos/landing-profile.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { getUserFullNameFromParts } from 'src/common/user-name.util';
import {
  generateStudentId,
  isEntityIdUniqueConstraintError,
} from 'src/common/entity-id';
import {
  hasCustomTuitionOverride,
  normalizeNullableMoney,
  normalizeStudentClassCustomTuitionMoney,
  resolveEffectiveTuitionPerSession,
} from 'src/common/student-class-tuition.util';
import { GoogleCalendarService } from 'src/google-calendar/google-calendar.service';
import {
  SePayDuplicateOrderCodeException,
  SePayService,
} from 'src/sepay/sepay.service';
import { MailService } from 'src/mail/mail.service';
import { NotificationService } from 'src/notification/notification.service';
import { AuthIdentityCacheService } from 'src/auth/auth-identity-cache.service';

const RECENT_TOP_UP_DAYS = 21;
const RECENT_TOP_UP_THRESHOLD = 300_000;
const DIRECT_TOPUP_APPROVAL_TOKEN_DAYS = 14;
const DIRECT_TOPUP_APPROVAL_TOKEN_BYTES = 32;
const ADMIN_EMAIL_PLACEHOLDER_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'localhost',
]);
const ADMIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function withOptionalReason(description: string, reason?: string | null) {
  const trimmedReason = reason?.trim();
  return trimmedReason
    ? `${description} - Lý do: ${trimmedReason}`
    : description;
}

const studentClassDetailInclude = {
  include: {
    class: {
      select: {
        id: true,
        name: true,
        status: true,
        tuitionPackageTotal: true,
        tuitionPackageSession: true,
        studentTuitionPerSession: true,
      },
    },
  },
} satisfies Prisma.StudentClassFindManyArgs;

const studentDetailInclude = {
  studentClasses: studentClassDetailInclude,
  examSchedules: {
    orderBy: [{ examDate: 'asc' }, { createdAt: 'asc' }],
  },
  customerCareServices: {
    include: {
      staff: {
        select: {
          id: true,
          user: {
            select: {
              first_name: true,
              last_name: true,
            },
          },
          roles: true,
          status: true,
        },
      },
    },
  },
} satisfies Prisma.StudentInfoInclude;

type StudentWithClasses = Prisma.StudentInfoGetPayload<{
  include: {
    studentClasses: typeof studentClassDetailInclude;
  };
}>;

type StudentDetailEntity = Prisma.StudentInfoGetPayload<{
  include: typeof studentDetailInclude;
}>;

type WalletTransactionHistoryEntity =
  Prisma.WalletTransactionsHistoryGetPayload<{
    select: {
      id: true;
      type: true;
      amount: true;
      note: true;
      date: true;
      createdAt: true;
    };
  }>;

type StudentWalletDirectTopUpRequestEntity =
  Prisma.StudentWalletDirectTopUpRequestGetPayload<{
    include: {
      student: {
        select: {
          id: true;
          fullName: true;
          accountBalance: true;
        };
      };
    };
  }>;

type StudentAccountBalanceChangeOptions = {
  allowNegativeBalance: boolean;
  topupNotePrefix: string;
  withdrawNotePrefix: string;
  auditDescription: string;
  reason?: string | null;
};

type PersistedStudentWalletSepayOrder = {
  id: string;
  orderCode: string;
  status: string;
  amountRequested: number;
  amountReceived: number | null;
  transferNote: string;
  parentEmail: string | null;
  sepayOrderId: string | null;
  sepayVaNumber: string | null;
  sepayVaHolderName: string | null;
  sepayBankName: string | null;
  sepayAccountNumber: string | null;
  sepayAccountHolderName: string | null;
  sepayQrCode: string | null;
  sepayQrCodeUrl: string | null;
  sepayExpiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeNullableDecimal(
  value: Prisma.Decimal | number | string | null | undefined,
): number | null {
  if (value == null) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCustomerCareProfitPercent(
  value: number | null | undefined,
): Prisma.Decimal | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (!Number.isFinite(value)) {
    throw new BadRequestException(
      'Customer care profit percent must be a valid number.',
    );
  }

  const rounded = Math.round(value * 100) / 100;
  if (rounded < 0 || rounded > 0.99) {
    throw new BadRequestException(
      'Customer care profit percent must be between 0.00 and 0.99.',
    );
  }

  return new Prisma.Decimal(rounded.toFixed(2));
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toDateOrNull(
  value: string | Date | null | undefined,
): Date | null | undefined {
  if (value == null) return value;
  if (value instanceof Date) return value;

  const normalized = String(value).trim();
  if (!normalized) {
    return undefined;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getPreferredUserFullName(user: {
  first_name: string | null;
  last_name: string | null;
  accountHandle: string;
  email: string;
}) {
  const fullName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
  if (fullName) {
    return fullName;
  }

  const handle = user.accountHandle?.trim();
  if (handle) {
    return handle;
  }

  return user.email;
}

type StudentAuditClient = Prisma.TransactionClient | PrismaService;

type StudentDetailAccess = {
  userId: string;
  roleType: UserRole;
};

@Injectable()
export class StudentService {
  private readonly logger = new Logger(StudentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly sePayService: SePayService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
    private readonly authIdentityCacheService: AuthIdentityCacheService,
  ) {}

  private invalidateStudentAuthIdentity(userId: string | null | undefined) {
    if (userId) {
      this.authIdentityCacheService.invalidateUser(userId);
    }
  }

  private formatVND(amount: number) {
    return `${Math.round(amount).toLocaleString('vi-VN')}đ`;
  }

  private getUserEligibilityForStudentAssignment(user: {
    roleType: UserRole;
    studentInfo: { id: string } | null;
    staffInfo: { id: string } | null;
  }) {
    if (user.studentInfo) {
      return {
        isEligible: false,
        ineligibleReason: 'User này đã có hồ sơ học sinh.',
      };
    }

    if (user.staffInfo) {
      return {
        isEligible: false,
        ineligibleReason:
          'User này đang có hồ sơ nhân sự nên không thể gán làm học sinh.',
      };
    }

    if (
      user.roleType !== UserRole.guest &&
      user.roleType !== UserRole.student
    ) {
      return {
        isEligible: false,
        ineligibleReason:
          'Chỉ có thể gán học sinh cho user đang có role guest hoặc student.',
      };
    }

    return {
      isEligible: true,
      ineligibleReason: null,
    };
  }

  private serializeStudentListItem(
    student: StudentWithClasses & {
      recentTopUpTotalLast21Days?: number;
      recentTopUpMeetsThreshold?: boolean;
    },
  ) {
    return {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      parentEmail: student.parentEmail,
      parentReceiptEmailEnabled: student.parentReceiptEmailEnabled,
      accountBalance: student.accountBalance,
      school: student.school,
      province: student.province,
      status: student.status,
      gender: student.gender,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
      studentClasses: (student.studentClasses ?? []).map((studentClass) => ({
        ...(studentClass.status ? { status: studentClass.status } : {}),
        class: {
          id: studentClass.class.id,
          name: studentClass.class.name,
          status: studentClass.class.status,
        },
      })),
      recentTopUpTotalLast21Days: student.recentTopUpTotalLast21Days ?? 0,
      recentTopUpMeetsThreshold: student.recentTopUpMeetsThreshold ?? false,
    };
  }

  private serializeStudentClass(
    studentClass: StudentWithClasses['studentClasses'][number],
  ) {
    const customTuitionPerSession = normalizeStudentClassCustomTuitionMoney(
      studentClass.customStudentTuitionPerSession,
    );
    const customTuitionPackageTotal = normalizeStudentClassCustomTuitionMoney(
      studentClass.customTuitionPackageTotal,
    );
    const customTuitionPackageSession = normalizeStudentClassCustomTuitionMoney(
      studentClass.customTuitionPackageSession,
    );
    const effectiveTuitionPackageTotal =
      customTuitionPackageTotal ??
      normalizeNullableMoney(studentClass.class.tuitionPackageTotal);
    const effectiveTuitionPackageSession =
      customTuitionPackageSession ??
      normalizeNullableMoney(studentClass.class.tuitionPackageSession);
    const effectiveTuitionPerSession = resolveEffectiveTuitionPerSession({
      customTuitionPerSession,
      classTuitionPerSession: studentClass.class.studentTuitionPerSession,
      effectivePackageTotal: effectiveTuitionPackageTotal,
      effectivePackageSession: effectiveTuitionPackageSession,
    });

    return {
      ...(studentClass.status ? { status: studentClass.status } : {}),
      class: {
        id: studentClass.class.id,
        name: studentClass.class.name,
        status: studentClass.class.status,
      },
      customTuitionPerSession,
      customTuitionPackageTotal,
      customTuitionPackageSession,
      effectiveTuitionPerSession,
      effectiveTuitionPackageTotal,
      effectiveTuitionPackageSession,
      tuitionPackageSource: hasCustomTuitionOverride({
        customTuitionPerSession,
        customTuitionPackageTotal,
        customTuitionPackageSession,
      })
        ? 'custom'
        : effectiveTuitionPackageTotal != null ||
            effectiveTuitionPackageSession != null ||
            normalizeNullableMoney(
              studentClass.class.studentTuitionPerSession,
            ) != null
          ? 'class'
          : 'unset',
      totalAttendedSession: studentClass.totalAttendedSession,
    };
  }

  private serializeStudentDetail(student: StudentDetailEntity) {
    return {
      ...this.serializeStudentListItem(student),
      birthYear: student.birthYear,
      parentName: student.parentName,
      parentPhone: student.parentPhone,
      parentEmail: student.parentEmail,
      parentReceiptEmailEnabled: student.parentReceiptEmailEnabled,
      goal: student.goal,
      dropOutDate: student.dropOutDate,
      customerCare: student.customerCareServices
        ? {
            staff: {
              id: student.customerCareServices.staff.id,
              fullName:
                getUserFullNameFromParts(
                  student.customerCareServices.staff.user,
                ) ?? '',
              roles: student.customerCareServices.staff.roles,
              status: student.customerCareServices.staff.status,
            },
            profitPercent: normalizeNullableDecimal(
              student.customerCareServices.profitPercent,
            ),
          }
        : null,
      studentClasses: (student.studentClasses ?? []).map((studentClass) =>
        this.serializeStudentClass(studentClass),
      ),
    };
  }

  private serializeStudentExamScheduleItem(
    item: StudentDetailEntity['examSchedules'][number],
  ) {
    return {
      id: item.id,
      examDate: item.examDate.toISOString().slice(0, 10),
      note: item.note,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private serializeStudentExamScheduleList(student: StudentDetailEntity) {
    // Defensive: some queries/mocks may omit examSchedules, so normalize to [].
    const schedules = student.examSchedules ?? [];
    return schedules.map((item) => this.serializeStudentExamScheduleItem(item));
  }

  private parseSePayTimestamp(value: string | null | undefined) {
    if (!value) {
      return null;
    }

    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const withZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)
      ? normalized
      : `${normalized}Z`;
    const parsed = new Date(withZone);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private serializeStudentWalletSepayOrder(
    order: PersistedStudentWalletSepayOrder,
  ): StudentSePayTopUpOrderResponseDto {
    return {
      id: order.id,
      status: order.status,
      amount: order.amountRequested,
      amountRequested: order.amountRequested,
      amountReceived: order.amountReceived,
      transferNote: order.transferNote,
      parentEmail: order.parentEmail,
      orderCode: order.orderCode,
      qrCode: order.sepayQrCode,
      qrCodeUrl: order.sepayQrCodeUrl,
      orderId: order.sepayOrderId,
      vaNumber: order.sepayVaNumber,
      vaHolderName: order.sepayVaHolderName,
      bankName: order.sepayBankName,
      accountNumber: order.sepayAccountNumber,
      accountHolderName: order.sepayAccountHolderName,
      expiredAt: order.sepayExpiredAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private async syncStudentExamSchedulesWithCalendar(
    student: StudentDetailEntity,
  ) {
    const schedules = student.examSchedules ?? [];
    await this.googleCalendarService.syncStudentExamScheduleEvents({
      studentId: student.id,
      studentName: student.fullName,
      classNames: student.studentClasses
        .map((studentClass) => studentClass.class?.name)
        .filter((value): value is string => Boolean(value)),
      items: schedules.map((item) => ({
        id: item.id,
        examDate: item.examDate.toISOString().slice(0, 10),
        note: item.note,
      })),
    });
  }

  private serializeStudentSelfDetail(student: StudentDetailEntity) {
    return {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      accountBalance: student.accountBalance,
      school: student.school,
      province: student.province,
      status: student.status,
      gender: student.gender,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
      birthYear: student.birthYear,
      parentName: student.parentName,
      parentPhone: student.parentPhone,
      parentEmail: student.parentEmail,
      parentReceiptEmailEnabled: student.parentReceiptEmailEnabled,
      goal: student.goal,
      studentClasses: student.studentClasses.map((studentClass) =>
        this.serializeStudentClass(studentClass),
      ),
    };
  }

  private serializeWalletTransaction(
    transaction: WalletTransactionHistoryEntity,
  ) {
    return {
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      note: transaction.note,
      date: transaction.date,
      createdAt: transaction.createdAt,
    };
  }

  private hashDirectTopUpApprovalToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateDirectTopUpApprovalToken() {
    return randomBytes(DIRECT_TOPUP_APPROVAL_TOKEN_BYTES).toString('base64url');
  }

  private getDirectTopUpApprovalExpiry(now = new Date()) {
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + DIRECT_TOPUP_APPROVAL_TOKEN_DAYS);
    return expiresAt;
  }

  private getAdminEmailForDirectTopUpApproval() {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL')?.trim();
    if (!adminEmail) {
      this.logger.warn(
        'Direct top-up approval email is not configured: ADMIN_EMAIL is missing.',
      );
      throw new ServiceUnavailableException(
        'ADMIN_EMAIL chưa được cấu hình nên không thể gửi yêu cầu duyệt nạp thẳng.',
      );
    }
    if (!this.isUsableAdminEmail(adminEmail)) {
      this.logger.warn(
        `Direct top-up approval email is not configured: ADMIN_EMAIL is invalid domain=${this.getEmailDomain(adminEmail) ?? 'unknown'}.`,
      );
      throw new ServiceUnavailableException(
        'ADMIN_EMAIL phải là email admin thật, đúng định dạng và không dùng domain placeholder như example.com hoặc localhost.',
      );
    }
    return adminEmail;
  }

  private isUsableAdminEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!ADMIN_EMAIL_PATTERN.test(normalizedEmail)) {
      return false;
    }

    const domain = normalizedEmail.split('@').at(-1);
    return Boolean(domain && !ADMIN_EMAIL_PLACEHOLDER_DOMAINS.has(domain));
  }

  private getEmailDomain(email: string | null | undefined): string | null {
    const normalizedEmail = email?.trim().toLowerCase();
    const domain = normalizedEmail?.split('@').at(-1);
    return domain || null;
  }

  private formatErrorForLog(error: unknown): string {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }
    return String(error);
  }

  private escapeNotificationHtml(value: string | null | undefined): string {
    return (value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async sendDirectTopUpRequestAdminNotification(params: {
    requestId: string;
    studentName: string;
    amount: number;
    reason: string;
    requestedByEmail: string | null;
    actor?: ActionHistoryActor;
  }): Promise<void> {
    if (!params.actor?.userId) {
      return;
    }

    const actor = {
      userId: params.actor.userId,
      userEmail: params.actor.userEmail ?? null,
      roleType: params.actor.roleType ?? null,
    };

    try {
      const notification =
        await this.notificationService.createNotificationDraft(
          {
            title: 'Yêu cầu nạp thẳng ví mới',
            message: [
              `<p><strong>${this.escapeNotificationHtml(params.studentName)}</strong> vừa có yêu cầu nạp thẳng ${this.escapeNotificationHtml(this.formatVND(params.amount))}.</p>`,
              `<p>Người yêu cầu: ${this.escapeNotificationHtml(params.requestedByEmail ?? 'không có email')}</p>`,
              `<p>Lý do: ${this.escapeNotificationHtml(params.reason)}</p>`,
              `<p>Mã yêu cầu: <code data-direct-topup-request-id="${this.escapeNotificationHtml(params.requestId)}">${this.escapeNotificationHtml(params.requestId)}</code></p>`,
              '<p>Vào Admin → Duyệt nạp ví để kiểm tra và phê duyệt.</p>',
            ].join(''),
            targetAll: false,
            targetRoleTypes: [UserRole.admin],
            targetStaffRoles: [StaffRole.admin],
            targetUserIds: [],
          },
          actor,
        );

      await this.notificationService.pushNotification(
        notification.id,
        {},
        actor,
      );
    } catch (error) {
      this.logger.warn(
        `Direct top-up admin notification failed: requestId=${params.requestId} error=${this.formatErrorForLog(error)}`,
      );
    }
  }

  private buildDirectTopUpRequestStatusWhere(
    status: StudentWalletDirectTopUpRequestStatus | 'all',
    now: Date,
  ): Prisma.StudentWalletDirectTopUpRequestWhereInput {
    if (status === 'all') {
      return {};
    }
    if (status === StudentWalletDirectTopUpRequestStatus.pending) {
      return {
        status: StudentWalletDirectTopUpRequestStatus.pending,
        expiresAt: { gt: now },
      };
    }
    if (status === StudentWalletDirectTopUpRequestStatus.expired) {
      return {
        OR: [
          { status: StudentWalletDirectTopUpRequestStatus.expired },
          {
            status: StudentWalletDirectTopUpRequestStatus.pending,
            expiresAt: { lte: now },
          },
        ],
      };
    }
    return { status };
  }

  private serializeStudentWalletDirectTopUpRequest(
    request: StudentWalletDirectTopUpRequestEntity,
    now = new Date(),
  ): StudentWalletDirectTopUpRequestResponseDto {
    const isExpired =
      request.status === StudentWalletDirectTopUpRequestStatus.pending &&
      request.expiresAt.getTime() <= now.getTime();
    const status = isExpired
      ? StudentWalletDirectTopUpRequestStatus.expired
      : request.status;

    return {
      id: request.id,
      studentId: request.studentId,
      studentName: request.student.fullName,
      amount: request.amount,
      reason: request.reason,
      status,
      requestedByUserEmail: request.requestedByUserEmail,
      requestedByRoleType: request.requestedByRoleType,
      expiresAt: request.expiresAt.toISOString(),
      createdAt: request.createdAt.toISOString(),
      approvedAt: request.approvedAt?.toISOString() ?? null,
    };
  }

  private async getStudentAuditSnapshot(
    db: StudentAuditClient,
    studentId: string,
  ) {
    const student = await db.studentInfo.findUnique({
      where: { id: studentId },
      include: studentDetailInclude,
    });

    return student
      ? {
          ...this.serializeStudentDetail(student),
          examSchedules: this.serializeStudentExamScheduleList(student),
        }
      : null;
  }

  private async assertCanAccessStudentDetail(
    studentId: string,
    access?: StudentDetailAccess,
  ) {
    if (!access) {
      return;
    }

    if (access.roleType === UserRole.admin) {
      return;
    }

    if (access.roleType !== UserRole.staff) {
      throw new ForbiddenException(
        'Only authorized roles can access this resource',
      );
    }

    const staff = await this.prisma.staffInfo.findUnique({
      where: { userId: access.userId },
      select: {
        id: true,
        roles: true,
      },
    });

    if (!staff) {
      throw new ForbiddenException(
        'Only authorized roles can access this resource',
      );
    }

    if (
      staff.roles.includes(StaffRole.assistant) ||
      staff.roles.includes(StaffRole.accountant) ||
      staff.roles.includes(StaffRole.accountant_income)
    ) {
      return;
    }

    if (!staff.roles.includes(StaffRole.customer_care)) {
      throw new ForbiddenException(
        'Only authorized roles can access this resource',
      );
    }

    const customerCareAssignment =
      await this.prisma.customerCareService.findUnique({
        where: { studentId },
        select: {
          staffId: true,
        },
      });

    if (
      !customerCareAssignment ||
      customerCareAssignment.staffId !== staff.id
    ) {
      throw new NotFoundException('Student not found');
    }
  }

  private buildUpdateData(dto: UpdateStudentBodyDto) {
    const data: Record<string, unknown> = {};

    if (dto.full_name !== undefined) data.fullName = dto.full_name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.school !== undefined) data.school = dto.school;
    if (dto.province !== undefined) data.province = dto.province;
    if (dto.birth_year !== undefined) data.birthYear = dto.birth_year;
    if (dto.parent_name !== undefined) data.parentName = dto.parent_name;
    if (dto.parent_phone !== undefined) data.parentPhone = dto.parent_phone;
    if (dto.parent_email !== undefined) {
      data.parentEmail =
        dto.parent_email === null
          ? null
          : (normalizeOptionalText(dto.parent_email) ?? null);
    }
    if (dto.parent_receipt_email_enabled !== undefined) {
      data.parentReceiptEmailEnabled = dto.parent_receipt_email_enabled;
    }
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.goal !== undefined) data.goal = dto.goal;

    if (dto.drop_out_date !== undefined) {
      const date = new Date(dto.drop_out_date);
      data.dropOutDate = Number.isNaN(date.getTime()) ? undefined : date;
    }

    return data as Parameters<typeof this.prisma.studentInfo.update>[0]['data'];
  }

  private async applyStudentStatusSideEffects(
    tx: Prisma.TransactionClient,
    studentId: string,
    status: StudentStatus,
  ) {
    if (status !== StudentStatus.inactive) {
      return;
    }

    await tx.studentClass.updateMany({
      where: {
        studentId,
        status: StudentClassStatus.active,
      },
      data: {
        status: StudentClassStatus.inactive,
      },
    });
  }

  private async syncCustomerCareAssignment(
    tx: Prisma.TransactionClient,
    studentId: string,
    dto: UpdateStudentBodyDto,
  ) {
    const shouldSyncCustomerCare =
      dto.customer_care_staff_id !== undefined ||
      dto.customer_care_profit_percent !== undefined;

    if (!shouldSyncCustomerCare) {
      return;
    }

    const existingAssignment = await tx.customerCareService.findUnique({
      where: { studentId },
      select: {
        staffId: true,
        profitPercent: true,
      },
    });

    const nextStaffId =
      dto.customer_care_staff_id !== undefined
        ? (dto.customer_care_staff_id ?? null)
        : (existingAssignment?.staffId ?? null);
    const nextProfitPercent =
      dto.customer_care_profit_percent !== undefined
        ? normalizeCustomerCareProfitPercent(
            dto.customer_care_profit_percent ?? null,
          )
        : (existingAssignment?.profitPercent ?? null);

    if (nextStaffId == null) {
      if (dto.customer_care_profit_percent != null) {
        throw new BadRequestException(
          'Cannot set customer care profit percent without a customer care staff.',
        );
      }

      if (existingAssignment) {
        await tx.customerCareService.delete({
          where: { studentId },
        });
      }

      return;
    }

    const customerCareStaff = await tx.staffInfo.findUnique({
      where: { id: nextStaffId },
      select: {
        id: true,
        roles: true,
      },
    });

    if (!customerCareStaff) {
      throw new NotFoundException('Customer care staff not found');
    }

    const isEligibleCustomerCareStaff = customerCareStaff.roles.some(
      (role) => role === StaffRole.customer_care,
    );
    if (!isEligibleCustomerCareStaff) {
      throw new BadRequestException(
        'Selected staff is not eligible for customer care assignment.',
      );
    }

    await tx.customerCareService.upsert({
      where: { studentId },
      create: {
        studentId,
        staffId: nextStaffId,
        profitPercent: nextProfitPercent,
      },
      update: {
        staffId: nextStaffId,
        profitPercent: nextProfitPercent,
      },
    });
  }

  async searchAssignableUsersByEmail(email: string) {
    const trimmedEmail = email.trim();
    if (trimmedEmail.length < 2) {
      throw new BadRequestException('Email tìm kiếm phải có ít nhất 2 ký tự.');
    }

    const users = await this.prisma.user.findMany({
      where: {
        email: {
          contains: trimmedEmail,
          mode: 'insensitive',
        },
      },
      take: 8,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        email: true,
        accountHandle: true,
        province: true,
        roleType: true,
        status: true,
        first_name: true,
        last_name: true,
        studentInfo: {
          select: {
            id: true,
          },
        },
        staffInfo: {
          select: {
            id: true,
          },
        },
      },
    });

    return users
      .map((user) => {
        const eligibility = this.getUserEligibilityForStudentAssignment(user);

        return {
          id: user.id,
          email: user.email,
          accountHandle: user.accountHandle,
          province: user.province,
          roleType: user.roleType,
          status: user.status,
          fullName: getPreferredUserFullName(user),
          hasStudentProfile: Boolean(user.studentInfo),
          studentId: user.studentInfo?.id ?? null,
          hasStaffProfile: Boolean(user.staffInfo),
          staffId: user.staffInfo?.id ?? null,
          isEligible: eligibility.isEligible,
          ineligibleReason: eligibility.ineligibleReason,
        };
      })
      .sort((a, b) => {
        const aExact = a.email.toLowerCase() === trimmedEmail.toLowerCase();
        const bExact = b.email.toLowerCase() === trimmedEmail.toLowerCase();

        if (aExact === bExact) {
          return a.email.localeCompare(b.email);
        }

        return aExact ? -1 : 1;
      });
  }

  async getStudents(query: StudentListQueryDto) {
    const parsedPage = Number(query.page);
    const parsedLimit = Number(query.limit);
    const page =
      Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit =
      Number.isInteger(parsedLimit) && parsedLimit >= 1
        ? Math.min(parsedLimit, 100)
        : 20;

    const trimmedSearch = query.search?.trim();
    const trimmedSchool = query.school?.trim();
    const trimmedProvince = query.province?.trim();
    const trimmedClassName = query.className?.trim();
    const normalizedStatus = query.status?.trim();
    const normalizedGender = query.gender?.trim();

    const statusFilter: StudentStatus | undefined =
      normalizedStatus === StudentStatus.active
        ? StudentStatus.active
        : normalizedStatus === StudentStatus.inactive
          ? StudentStatus.inactive
          : undefined;

    const genderFilter: Gender | undefined =
      normalizedGender === Gender.male
        ? Gender.male
        : normalizedGender === Gender.female
          ? Gender.female
          : undefined;

    const where: Prisma.StudentInfoWhereInput = {
      ...(trimmedSearch
        ? {
            fullName: {
              contains: trimmedSearch,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(trimmedSchool
        ? {
            school: {
              contains: trimmedSchool,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(trimmedProvince
        ? {
            province: {
              contains: trimmedProvince,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(genderFilter ? { gender: genderFilter } : {}),
      ...(trimmedClassName
        ? {
            studentClasses: {
              some: {
                class: {
                  name: {
                    contains: trimmedClassName,
                    mode: 'insensitive' as const,
                  },
                },
              },
            },
          }
        : {}),
    };

    const total = await this.prisma.studentInfo.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;

    const data = await this.prisma.studentInfo.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { accountBalance: 'asc' },
        { status: 'asc' },
        { fullName: 'asc' },
        { id: 'asc' },
      ],
      include: {
        studentClasses: studentClassDetailInclude,
      },
    });

    const studentIds = data.map((student) => student.id);
    const recentTopUpTotals =
      await this.getRecentTopUpTotalsByStudentId(studentIds);

    return {
      data: data.map((student) => {
        const recentTopUpTotal = recentTopUpTotals.get(student.id) ?? 0;
        return this.serializeStudentListItem({
          ...student,
          recentTopUpTotalLast21Days: recentTopUpTotal,
          recentTopUpMeetsThreshold:
            recentTopUpTotal >= RECENT_TOP_UP_THRESHOLD,
        });
      }),
      meta: {
        total,
        page: safePage,
        limit,
      },
    };
  }

  async getLandingProfiles(query: StudentLandingProfileQueryDto) {
    const status = query.status ?? StudentStatus.active;
    const limit =
      typeof query.limit === 'number' && Number.isInteger(query.limit)
        ? Math.min(Math.max(query.limit, 1), 500)
        : 100;

    const where: Prisma.StudentInfoWhereInput = { status };

    const [total, rows] = await Promise.all([
      this.prisma.studentInfo.count({ where }),
      this.prisma.studentInfo.findMany({
        where,
        take: limit,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          fullName: true,
          school: true,
          province: true,
        },
      }),
    ]);

    return {
      data: rows.map((student) => ({
        id: student.id,
        name: student.fullName,
        school: student.school,
        province: student.province,
      })),
      total,
    };
  }

  private async getRecentTopUpTotalsByStudentId(
    studentIds: string[],
  ): Promise<Map<string, number>> {
    if (studentIds.length === 0) {
      return new Map();
    }

    const since = new Date();
    since.setDate(since.getDate() - RECENT_TOP_UP_DAYS);

    const rows = await this.prisma.walletTransactionsHistory.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: studentIds },
        type: WalletTransactionType.topup,
        createdAt: { gte: since },
      },
      _sum: { amount: true },
    });

    return new Map(rows.map((row) => [row.studentId, row._sum.amount ?? 0]));
  }

  async getStudentById(id: string, access?: StudentDetailAccess) {
    await this.assertCanAccessStudentDetail(id, access);

    const student = await this.prisma.studentInfo.findUnique({
      where: { id },
      include: studentDetailInclude,
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return this.serializeStudentDetail(student);
  }

  async getStudentSelfDetail(id: string) {
    const student = await this.prisma.studentInfo.findUnique({
      where: { id },
      include: studentDetailInclude,
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return this.serializeStudentSelfDetail(student);
  }

  /**
   * Nội dung chuyển khoản/hiển thị cho phụ huynh (đồng bộ cách diễn đạt gói học phí với frontend).
   */
  async getTuitionExtensionTransferNoteForSelf(
    studentId: string,
    referenceDate: Date = new Date(),
  ): Promise<string> {
    const student = await this.prisma.studentInfo.findUnique({
      where: { id: studentId },
      include: studentDetailInclude,
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const pkg = this.formatTuitionPackageSummaryForTransferNote(student);
    const dateStr = new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(referenceDate);

    return `Phụ huynh gia hạn tiền học phí gói ${pkg} ngày ${dateStr}`;
  }

  private async resolveWalletTopUpCreator(
    studentId: string,
    actor?: ActionHistoryActor,
  ) {
    if (!actor) {
      return { staffRoles: [] as StaffRole[] };
    }

    if (
      actor.roleType === UserRole.admin ||
      actor.roleType === UserRole.student
    ) {
      return { staffRoles: [] as StaffRole[] };
    }

    if (actor.roleType !== UserRole.staff) {
      throw new ForbiddenException(
        'Only authorized roles can access this resource',
      );
    }

    if (!actor.userId) {
      throw new ForbiddenException(
        'Only authorized roles can access this resource',
      );
    }

    const staff = await this.prisma.staffInfo.findUnique({
      where: { userId: actor.userId },
      select: {
        id: true,
        roles: true,
      },
    });

    if (!staff) {
      throw new ForbiddenException(
        'Only authorized roles can access this resource',
      );
    }

    if (staff.roles.includes(StaffRole.assistant)) {
      return { staffRoles: staff.roles };
    }

    if (!staff.roles.includes(StaffRole.customer_care)) {
      throw new ForbiddenException(
        'Only authorized roles can access this resource',
      );
    }

    const customerCareAssignment =
      await this.prisma.customerCareService.findUnique({
        where: { studentId },
        select: { staffId: true },
      });

    if (
      !customerCareAssignment ||
      customerCareAssignment.staffId !== staff.id
    ) {
      throw new NotFoundException('Student not found');
    }

    return { staffRoles: staff.roles };
  }

  private normalizeOrderCreatorRoleType(actor?: ActionHistoryActor) {
    return Object.values(UserRole).includes(actor?.roleType as UserRole)
      ? (actor?.roleType as UserRole)
      : null;
  }

  async createStudentSePayTopUpOrder(
    studentId: string,
    dto: CreateStudentSePayTopUpOrderDto,
    actor?: ActionHistoryActor,
  ): Promise<StudentSePayTopUpOrderResponseDto> {
    const { staffRoles } = await this.resolveWalletTopUpCreator(
      studentId,
      actor,
    );

    if (!this.sePayService.isWalletTopUpConfigured()) {
      throw new ServiceUnavailableException(
        'Thanh toán SePay chưa được bật trên hệ thống.',
      );
    }

    const amount = Math.round(dto.amount);
    const now = new Date();
    const baseTransferNote = await this.getTuitionExtensionTransferNoteForSelf(
      studentId,
      now,
    );
    const student = await this.prisma.studentInfo.findUnique({
      where: { id: studentId },
      select: { id: true, parentEmail: true },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    let lastDuplicateError: SePayDuplicateOrderCodeException | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const orderCode =
        this.sePayService.buildStudentWalletOrderCode(studentId);

      try {
        const sePay = await this.sePayService.createStudentWalletTopUpPayment({
          amountVnd: amount,
          orderCode,
          baseTransferNote,
        });
        const transferNote = sePay.transferNote;

        const persisted = await this.prisma.studentWalletSepayOrder.create({
          data: {
            studentId,
            orderCode,
            amountRequested: amount,
            transferNote,
            parentEmail: student.parentEmail,
            sepayOrderId: sePay.orderId ?? null,
            sepayOrderStatus: sePay.sepayStatus ?? null,
            sepayVaNumber: sePay.vaNumber ?? null,
            sepayVaHolderName: sePay.vaHolderName ?? null,
            sepayBankName: sePay.bankName ?? null,
            sepayAccountNumber: sePay.accountNumber ?? null,
            sepayAccountHolderName: sePay.accountHolderName ?? null,
            sepayQrCode: sePay.qrCode ?? null,
            sepayQrCodeUrl: sePay.qrCodeUrl ?? null,
            sepayExpiredAt: this.parseSePayTimestamp(sePay.expiredAt),
            createdByUserId: actor?.userId ?? null,
            createdByUserEmail: actor?.userEmail ?? null,
            createdByRoleType: this.normalizeOrderCreatorRoleType(actor),
            createdByStaffRoles: staffRoles,
          },
        });

        return this.serializeStudentWalletSepayOrder(persisted);
      } catch (error) {
        if (error instanceof SePayDuplicateOrderCodeException) {
          lastDuplicateError = error;
          continue;
        }
        throw error;
      }
    }

    throw (
      lastDuplicateError ??
      new BadRequestException('Không tạo được mã đơn SePay duy nhất.')
    );
  }

  async getStudentSePayStaticQr(
    studentId: string,
    actor?: ActionHistoryActor,
  ): Promise<StudentSePayStaticQrResponseDto> {
    await this.resolveWalletTopUpCreator(studentId, actor);

    if (!this.sePayService.isStudentWalletStaticQrConfigured()) {
      throw new ServiceUnavailableException(
        'Thanh toán SePay QR tĩnh chưa được bật trên hệ thống.',
      );
    }

    const student = await this.prisma.studentInfo.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        studentClasses: {
          where: { status: StudentClassStatus.active },
          select: {
            status: true,
            class: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const activeStudentClasses = student.studentClasses.filter(
      (studentClass) => studentClass.status === StudentClassStatus.active,
    );

    return this.sePayService.createStudentWalletStaticQr({
      studentId: student.id,
      classIds: activeStudentClasses.map(
        (studentClass) => studentClass.class.id,
      ),
      classNames: activeStudentClasses.map(
        (studentClass) => studentClass.class.name,
      ),
    });
  }

  async createStudentWalletDirectTopUpRequest(
    studentId: string,
    dto: CreateStudentWalletDirectTopUpRequestDto,
    actor?: ActionHistoryActor,
  ): Promise<StudentWalletDirectTopUpRequestResponseDto> {
    const { staffRoles } = await this.resolveWalletTopUpCreator(
      studentId,
      actor,
    );
    const amount = Math.round(dto.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive integer.');
    }

    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Reason is required.');
    }

    const adminEmail = this.getAdminEmailForDirectTopUpApproval();
    const student = await this.prisma.studentInfo.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        fullName: true,
        accountBalance: true,
      },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const token = this.generateDirectTopUpApprovalToken();
    const tokenHash = this.hashDirectTopUpApprovalToken(token);
    const expiresAt = this.getDirectTopUpApprovalExpiry();
    const request = await this.prisma.studentWalletDirectTopUpRequest.create({
      data: {
        studentId,
        amount,
        reason,
        tokenHash,
        expiresAt,
        requestedByUserId: actor?.userId ?? null,
        requestedByUserEmail: actor?.userEmail ?? null,
        requestedByRoleType: this.normalizeOrderCreatorRoleType(actor),
        requestedByStaffRoles: staffRoles,
      },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            accountBalance: true,
          },
        },
      },
    });

    try {
      await this.mailService.sendStudentWalletDirectTopUpApprovalEmail({
        to: adminEmail,
        token,
        studentName: student.fullName,
        studentId: student.id,
        amount,
        reason,
        requestedByEmail: actor?.userEmail ?? null,
        expiresAt,
      });
    } catch (error) {
      this.logger.warn(
        `Direct top-up approval email failed: requestId=${request.id} studentId=${studentId} adminEmailDomain=${this.getEmailDomain(adminEmail) ?? 'unknown'} error=${this.formatErrorForLog(error)}`,
      );
      try {
        await this.prisma.studentWalletDirectTopUpRequest.delete({
          where: { id: request.id },
        });
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to clean up direct top-up request ${request.id} after email failure: ${String(cleanupError)}`,
        );
      }
      throw error;
    }

    await this.sendDirectTopUpRequestAdminNotification({
      requestId: request.id,
      studentName: student.fullName,
      amount,
      reason,
      requestedByEmail: actor?.userEmail ?? null,
      actor,
    });

    return this.serializeStudentWalletDirectTopUpRequest(request);
  }

  async listStudentWalletDirectTopUpRequests(
    query: StudentWalletDirectTopUpRequestListQueryDto,
  ): Promise<StudentWalletDirectTopUpRequestListResponseDto> {
    const now = new Date();
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 20)));
    const status =
      query.status ?? StudentWalletDirectTopUpRequestStatus.pending;
    const where = this.buildDirectTopUpRequestStatusWhere(status, now);

    const [total, requests] = await Promise.all([
      this.prisma.studentWalletDirectTopUpRequest.count({ where }),
      this.prisma.studentWalletDirectTopUpRequest.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              accountBalance: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: requests.map((request) =>
        this.serializeStudentWalletDirectTopUpRequest(request, now),
      ),
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  async getStudentWalletDirectTopUpRequestById(
    requestId: string,
  ): Promise<StudentWalletDirectTopUpRequestResponseDto> {
    const request =
      await this.prisma.studentWalletDirectTopUpRequest.findUnique({
        where: { id: requestId },
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              accountBalance: true,
            },
          },
        },
      });

    if (!request) {
      throw new NotFoundException('Direct top-up request not found.');
    }

    return this.serializeStudentWalletDirectTopUpRequest(request);
  }

  async getStudentWalletDirectTopUpApprovalByToken(
    token: string,
  ): Promise<StudentWalletDirectTopUpRequestResponseDto> {
    const normalizedToken = token?.trim();
    if (!normalizedToken || normalizedToken.length < 20) {
      throw new BadRequestException('Link xác nhận không hợp lệ.');
    }

    const request =
      await this.prisma.studentWalletDirectTopUpRequest.findUnique({
        where: {
          tokenHash: this.hashDirectTopUpApprovalToken(normalizedToken),
        },
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              accountBalance: true,
            },
          },
        },
      });

    if (!request) {
      throw new BadRequestException('Link xác nhận không hợp lệ.');
    }

    return this.serializeStudentWalletDirectTopUpRequest(request);
  }

  async approveStudentWalletDirectTopUpRequest(
    token: string,
  ): Promise<StudentWalletDirectTopUpApprovalResultDto> {
    const normalizedToken = token?.trim();
    if (!normalizedToken || normalizedToken.length < 20) {
      throw new BadRequestException('Link xác nhận không hợp lệ.');
    }

    const adminEmail = this.getAdminEmailForDirectTopUpApproval();
    const tokenHash = this.hashDirectTopUpApprovalToken(normalizedToken);

    return this.approveStudentWalletDirectTopUpRequestRecord({
      where: { tokenHash },
      invalidMessage: 'Link xác nhận không hợp lệ.',
      actor: {
        userId: null,
        userEmail: adminEmail,
        roleType: UserRole.admin,
      },
    });
  }

  async approveStudentWalletDirectTopUpRequestById(
    requestId: string,
    actor?: ActionHistoryActor,
  ): Promise<StudentWalletDirectTopUpApprovalResultDto> {
    return this.approveStudentWalletDirectTopUpRequestRecord({
      where: { id: requestId },
      invalidMessage: 'Yêu cầu nạp thẳng không tồn tại.',
      actor: actor ?? null,
    });
  }

  private approveStudentWalletDirectTopUpRequestRecord(params: {
    where: Prisma.StudentWalletDirectTopUpRequestWhereUniqueInput;
    invalidMessage: string;
    actor?: ActionHistoryActor | null;
  }): Promise<StudentWalletDirectTopUpApprovalResultDto> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.studentWalletDirectTopUpRequest.findUnique({
        where: params.where,
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              accountBalance: true,
            },
          },
        },
      });

      if (!request) {
        throw new BadRequestException(params.invalidMessage);
      }

      if (request.status === StudentWalletDirectTopUpRequestStatus.approved) {
        return {
          message: 'Yêu cầu nạp thẳng này đã được duyệt trước đó.',
          status: StudentWalletDirectTopUpRequestStatus.approved,
          balanceAfter: request.student.accountBalance ?? null,
        };
      }

      if (
        request.status === StudentWalletDirectTopUpRequestStatus.expired ||
        request.expiresAt.getTime() <= now.getTime()
      ) {
        await tx.studentWalletDirectTopUpRequest.update({
          where: { id: request.id },
          data: {
            status: StudentWalletDirectTopUpRequestStatus.expired,
          },
        });
        return {
          message: 'Link xác nhận đã hết hạn.',
          status: StudentWalletDirectTopUpRequestStatus.expired,
          balanceAfter: request.student.accountBalance ?? null,
        };
      }

      const claimed = await tx.studentWalletDirectTopUpRequest.updateMany({
        where: {
          id: request.id,
          status: StudentWalletDirectTopUpRequestStatus.pending,
          walletTransactionId: null,
          expiresAt: { gt: now },
        },
        data: {
          status: StudentWalletDirectTopUpRequestStatus.approved,
          approvedAt: now,
        },
      });

      if (claimed.count !== 1) {
        throw new BadRequestException(
          'Yêu cầu này không còn ở trạng thái chờ duyệt.',
        );
      }

      const beforeValue = await this.getStudentAuditSnapshot(
        tx,
        request.studentId,
      );
      const balanceBefore = request.student.accountBalance ?? 0;
      const balanceAfter = balanceBefore + request.amount;
      const walletTransaction = await tx.walletTransactionsHistory.create({
        data: {
          studentId: request.studentId,
          type: WalletTransactionType.topup,
          amount: request.amount,
          note: `Nạp thẳng đã được admin xác nhận. Lý do: ${request.reason}. Người yêu cầu: ${request.requestedByUserEmail ?? 'không có email'} | Số dư: ${this.formatVND(balanceBefore)} + ${this.formatVND(request.amount)} = ${this.formatVND(balanceAfter)}`,
          date: now,
        },
      });

      const nextStudent = await tx.studentInfo.update({
        where: { id: request.studentId },
        data: { accountBalance: { increment: request.amount } },
        include: studentDetailInclude,
      });

      await tx.studentWalletDirectTopUpRequest.update({
        where: { id: request.id },
        data: {
          walletTransactionId: walletTransaction.id,
        },
      });

      if (beforeValue) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: params.actor ?? {
            userId: null,
            userEmail: null,
            roleType: UserRole.admin,
          },
          entityType: 'student',
          entityId: request.studentId,
          description: `Duyệt yêu cầu nạp thẳng ví học sinh từ ${request.requestedByUserEmail ?? 'nhân sự'}`,
          beforeValue,
          afterValue: this.serializeStudentDetail(nextStudent),
        });
      }

      return {
        message: 'Đã xác nhận nạp thẳng vào ví học sinh.',
        status: StudentWalletDirectTopUpRequestStatus.approved,
        balanceAfter,
      };
    });
  }

  private formatTuitionPackageSummaryForTransferNote(
    student: StudentDetailEntity,
  ): string {
    const classes = student.studentClasses;
    if (!classes.length) {
      return 'chưa gán lớp';
    }

    const running = classes.filter(
      (sc) => sc.class.status === ClassStatus.running,
    );
    const source = running.length > 0 ? running : classes;

    return source
      .map((sc) => {
        const row = this.serializeStudentClass(sc);
        const name = row.class.name?.trim() || 'Lớp';
        const sess = row.effectiveTuitionPackageSession;
        const total = row.effectiveTuitionPackageTotal;
        const perSession = row.effectiveTuitionPerSession;

        if (total != null && sess != null && sess > 0) {
          return `${name} (${this.formatVND(total)}/${sess} buổi)`;
        }
        if (sess != null && sess > 0) {
          return `${name} (${sess} buổi)`;
        }
        if (perSession != null && perSession > 0) {
          return `${name} (${this.formatVND(perSession)}/buổi)`;
        }
        return name;
      })
      .join('; ');
  }

  async getStudentWalletHistory(
    id: string,
    query: StudentWalletHistoryQueryDto,
    access?: StudentDetailAccess,
  ) {
    await this.assertCanAccessStudentDetail(id, access);

    const student = await this.prisma.studentInfo.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const limit =
      typeof query.limit === 'number' && Number.isInteger(query.limit)
        ? Math.min(Math.max(query.limit, 1), 200)
        : 50;

    const transactions = await this.prisma.walletTransactionsHistory.findMany({
      where: {
        studentId: id,
        ...(query.type === WalletTransactionType.topup
          ? { type: WalletTransactionType.topup }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        type: true,
        amount: true,
        note: true,
        date: true,
        createdAt: true,
      },
    });

    return transactions.map((transaction) =>
      this.serializeWalletTransaction(transaction),
    );
  }

  async getStudentSelfWalletHistory(
    id: string,
    query: StudentWalletHistoryQueryDto,
  ) {
    return this.getStudentWalletHistory(id, query);
  }

  async getStudentExamSchedules(id: string, access?: StudentDetailAccess) {
    await this.assertCanAccessStudentDetail(id, access);

    const student = await this.prisma.studentInfo.findUnique({
      where: { id },
      include: studentDetailInclude,
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return this.serializeStudentExamScheduleList(student);
  }

  async getStudentSelfExamSchedules(id: string) {
    return this.getStudentExamSchedules(id);
  }

  async updateStudentExamSchedules(
    id: string,
    items: Array<{
      id?: string;
      examDate: string;
      note?: string | null;
    }>,
    auditActor?: ActionHistoryActor,
  ) {
    const student = await this.prisma.studentInfo.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const normalizedItems = items.map((item) => {
      const examDate = toDateOrNull(item.examDate);
      if (!(examDate instanceof Date) || Number.isNaN(examDate.getTime())) {
        throw new BadRequestException('examDate không hợp lệ.');
      }

      return {
        id: item.id,
        examDate,
        note: item.note?.trim() || null,
      };
    });

    const afterStudent = await this.prisma.$transaction(async (tx) => {
      const beforeValue = auditActor
        ? await this.getStudentAuditSnapshot(tx, id)
        : null;

      await tx.studentExamSchedule.deleteMany({
        where: { studentId: id },
      });

      if (normalizedItems.length > 0) {
        await tx.studentExamSchedule.createMany({
          data: normalizedItems.map((item) => ({
            ...(item.id ? { id: item.id } : {}),
            studentId: id,
            examDate: item.examDate,
            note: item.note,
          })),
        });
      }

      const afterStudent = await tx.studentInfo.findUnique({
        where: { id },
        include: studentDetailInclude,
      });

      if (!afterStudent) {
        throw new NotFoundException('Student not found');
      }

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'student',
          entityId: id,
          description: 'Cập nhật lịch thi học sinh',
          beforeValue,
          afterValue: {
            ...this.serializeStudentDetail(afterStudent),
            examSchedules: this.serializeStudentExamScheduleList(afterStudent),
          },
        });
      }

      return afterStudent;
    });

    try {
      await this.syncStudentExamSchedulesWithCalendar(afterStudent);
    } catch (error) {
      this.logger.warn(
        `Failed to sync student exam schedules to Google Calendar for student ${id}: ${String(error)}`,
      );
    }

    return this.serializeStudentExamScheduleList(afterStudent);
  }

  private async applyStudentAccountBalanceChange(
    studentId: string,
    amount: number,
    options: StudentAccountBalanceChangeOptions,
    auditActor?: ActionHistoryActor,
  ) {
    const normalizedAmount = Math.round(amount);

    if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) {
      throw new BadRequestException('Amount must be a non-zero number.');
    }

    const beforeValue = auditActor
      ? await this.getStudentAuditSnapshot(this.prisma, studentId)
      : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const student = await tx.studentInfo.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          accountBalance: true,
        },
      });

      if (!student) {
        throw new NotFoundException('Student not found');
      }

      const balanceBefore = student.accountBalance ?? 0;
      const balanceAfter = balanceBefore + normalizedAmount;

      if (!options.allowNegativeBalance && balanceAfter < 0) {
        throw new BadRequestException(
          'Insufficient balance for this withdrawal.',
        );
      }

      const transactionType =
        normalizedAmount > 0
          ? WalletTransactionType.topup
          : WalletTransactionType.loan;
      const transactionAmount = Math.abs(normalizedAmount);
      const notePrefix =
        normalizedAmount > 0
          ? options.topupNotePrefix
          : options.withdrawNotePrefix;
      const reasonText = options.reason?.trim();
      const operator = normalizedAmount > 0 ? '+' : '-';

      await tx.walletTransactionsHistory.create({
        data: {
          studentId: student.id,
          type: transactionType,
          amount: transactionAmount,
          note: `${notePrefix}${reasonText ? ` Lý do: ${reasonText}.` : ''} | Số dư: ${this.formatVND(balanceBefore)} ${operator} ${this.formatVND(transactionAmount)} = ${this.formatVND(balanceAfter)}`,
          date: new Date(),
        },
      });

      const nextStudent = await tx.studentInfo.update({
        where: { id: studentId },
        data: { accountBalance: { increment: normalizedAmount } },
        include: studentDetailInclude,
      });

      if (auditActor && beforeValue) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'student',
          entityId: studentId,
          description: options.auditDescription,
          beforeValue,
          afterValue: this.serializeStudentDetail(nextStudent),
        });
      }

      return nextStudent;
    });

    return updated;
  }

  async updateStudentById(
    id: string,
    dto: UpdateStudentBodyDto,
    auditActor?: ActionHistoryActor,
  ) {
    const student = await this.prisma.studentInfo.findUnique({
      where: { id },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const updateData = this.buildUpdateData(dto);
    const shouldSyncCustomerCare =
      dto.customer_care_staff_id !== undefined ||
      dto.customer_care_profit_percent !== undefined;

    if (Object.keys(updateData).length === 0 && !shouldSyncCustomerCare) {
      return this.getStudentById(id);
    }

    const beforeValue = auditActor
      ? await this.getStudentAuditSnapshot(this.prisma, id)
      : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.studentInfo.update({
          where: { id },
          data: updateData,
        });
      }

      if (dto.status !== undefined) {
        await this.applyStudentStatusSideEffects(tx, id, dto.status);
      }

      await this.syncCustomerCareAssignment(tx, id, dto);

      const nextStudent = await tx.studentInfo.findUnique({
        where: { id },
        include: studentDetailInclude,
      });

      if (!nextStudent) {
        throw new NotFoundException('Student not found');
      }

      if (auditActor && beforeValue) {
        const afterValue = this.serializeStudentDetail(nextStudent);
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'student',
          entityId: id,
          description: 'Cập nhật học sinh',
          beforeValue,
          afterValue,
        });
      }

      return nextStudent;
    });

    if (dto.status !== undefined) {
      this.invalidateStudentAuthIdentity(student.userId);
    }

    return this.serializeStudentDetail(updated);
  }

  async updateStudentStatus(
    id: string,
    dto: UpdateStudentStatusDto,
    auditActor?: ActionHistoryActor,
  ) {
    const student = await this.prisma.studentInfo.findUnique({
      where: { id },
      select: { id: true, status: true, userId: true },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const beforeValue = auditActor
      ? await this.getStudentAuditSnapshot(this.prisma, id)
      : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.studentInfo.update({
        where: { id },
        data: { status: dto.status },
      });

      await this.applyStudentStatusSideEffects(tx, id, dto.status);

      const nextStudent = await tx.studentInfo.findUnique({
        where: { id },
        include: studentDetailInclude,
      });

      if (!nextStudent) {
        throw new NotFoundException('Student not found');
      }

      if (auditActor && beforeValue) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'student',
          entityId: id,
          description:
            dto.status === StudentStatus.inactive
              ? withOptionalReason('Chuyển học sinh sang nghỉ học', dto.reason)
              : withOptionalReason('Chuyển học sinh sang đang học', dto.reason),
          beforeValue,
          afterValue: this.serializeStudentDetail(nextStudent),
        });
      }

      return nextStudent;
    });

    this.invalidateStudentAuthIdentity(student.userId);
    return this.serializeStudentDetail(updated);
  }

  async updateStudent(data: UpdateStudentDto, auditActor?: ActionHistoryActor) {
    return this.updateStudentById(data.id, data, auditActor);
  }

  async updateStudentAccountBalance(
    data: UpdateStudentAccountBalanceCreateDto,
    auditActor?: ActionHistoryActor,
  ) {
    const reason = data.reason?.trim();
    if (!reason) {
      throw new BadRequestException(
        'Reason is required for manual balance changes.',
      );
    }

    const updated = await this.applyStudentAccountBalanceChange(
      data.student_id,
      data.amount,
      {
        allowNegativeBalance: true,
        topupNotePrefix: 'Nạp tiền thủ công từ trang chi tiết học sinh.',
        withdrawNotePrefix:
          'Điều chỉnh giảm số dư thủ công từ trang chi tiết học sinh.',
        auditDescription: 'Điều chỉnh số dư học sinh',
        reason,
      },
      auditActor,
    );

    return this.serializeStudentDetail(updated);
  }

  updateMyStudentAccountBalance(
    studentId: string,
    data: UpdateMyStudentAccountBalanceDto,
    _auditActor?: ActionHistoryActor,
  ): Promise<never> {
    void studentId;
    void data;
    void _auditActor;
    return Promise.reject(
      new BadRequestException(
        'Use SePay top-up order endpoint for self-service wallet top-ups.',
      ),
    );
  }

  async updateStudentClasses(
    id: string,
    dto: UpdateStudentClassesDto,
    auditActor?: ActionHistoryActor,
  ) {
    const student = await this.prisma.studentInfo.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const classIds = Array.from(new Set(dto.class_ids));
    if (classIds.length > 0) {
      const classes = await this.prisma.class.findMany({
        where: {
          id: {
            in: classIds,
          },
        },
        select: { id: true },
      });

      if (classes.length !== classIds.length) {
        throw new NotFoundException('One or more classes not found');
      }
    }

    const existingMemberships = await this.prisma.studentClass.findMany({
      where: { studentId: id },
      select: { classId: true, status: true },
    });
    const existingClassIds = new Set(
      existingMemberships.map((membership) => membership.classId),
    );
    const classIdsToRemove = existingMemberships
      .map((membership) => membership.classId)
      .filter((classId) => !classIds.includes(classId));
    const classIdsToActivate = classIds.filter((classId) =>
      existingClassIds.has(classId),
    );
    const classIdsToAdd = classIds.filter(
      (classId) => !existingClassIds.has(classId),
    );

    const beforeValue = auditActor
      ? await this.getStudentAuditSnapshot(this.prisma, id)
      : null;

    const updatedStudent = await this.prisma.$transaction(async (tx) => {
      if (classIdsToRemove.length > 0) {
        await tx.studentClass.updateMany({
          where: {
            studentId: id,
            classId: {
              in: classIdsToRemove,
            },
          },
          data: {
            status: StudentClassStatus.inactive,
          },
        });
      }

      if (classIds.length === 0) {
        const nextStudent = await tx.studentInfo.findUnique({
          where: { id },
          include: studentDetailInclude,
        });

        if (!nextStudent) {
          throw new NotFoundException('Student not found');
        }

        if (auditActor && beforeValue) {
          await this.actionHistoryService.recordUpdate(tx, {
            actor: auditActor,
            entityType: 'student',
            entityId: id,
            description: 'Cập nhật danh sách lớp của học sinh',
            beforeValue,
            afterValue: this.serializeStudentDetail(nextStudent),
          });
        }

        return nextStudent;
      }

      if (classIdsToActivate.length > 0) {
        await tx.studentClass.updateMany({
          where: {
            studentId: id,
            classId: {
              in: classIdsToActivate,
            },
          },
          data: {
            status: StudentClassStatus.active,
            customStudentTuitionPerSession: null,
            customTuitionPackageTotal: null,
            customTuitionPackageSession: null,
          },
        });
      }

      if (classIdsToAdd.length > 0) {
        await tx.studentClass.createMany({
          data: classIdsToAdd.map((classId) => ({
            classId,
            studentId: id,
            status: StudentClassStatus.active,
          })),
        });
      }

      const nextStudent = await tx.studentInfo.findUnique({
        where: { id },
        include: studentDetailInclude,
      });

      if (!nextStudent) {
        throw new NotFoundException('Student not found');
      }

      if (auditActor && beforeValue) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'student',
          entityId: id,
          description: 'Cập nhật danh sách lớp của học sinh',
          beforeValue,
          afterValue: this.serializeStudentDetail(nextStudent),
        });
      }

      return nextStudent;
    });

    return this.serializeStudentDetail(updatedStudent);
  }

  async deleteStudent(id: string, auditActor?: ActionHistoryActor) {
    const beforeValue = await this.getStudentAuditSnapshot(this.prisma, id);

    if (!beforeValue) {
      throw new NotFoundException('Student not found');
    }

    const attendanceCount = await this.prisma.attendance.count({
      where: {
        studentId: id,
      },
    });
    if (attendanceCount > 0) {
      throw new BadRequestException(
        'Không thể xóa học sinh vì đã có điểm danh/buổi học liên kết. Vui lòng cân nhắc chuyển trạng thái hoặc lưu trữ thay vì xóa.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const deletedStudent = await tx.studentInfo.delete({
        where: {
          id,
        },
      });

      if (auditActor) {
        await this.actionHistoryService.recordDelete(tx, {
          actor: auditActor,
          entityType: 'student',
          entityId: id,
          description: 'Xóa học sinh',
          beforeValue,
        });
      }

      return deletedStudent;
    });
  }

  async createStudent(data: CreateStudentDto, auditActor?: ActionHistoryActor) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: data.user_id,
      },
      select: {
        id: true,
        email: true,
        province: true,
        roleType: true,
        studentInfo: {
          select: {
            id: true,
          },
        },
        staffInfo: {
          select: {
            id: true,
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const eligibility = this.getUserEligibilityForStudentAssignment(user);
    if (!eligibility.isEligible) {
      throw new BadRequestException(eligibility.ineligibleReason);
    }

    const trimmedFullName = data.full_name.trim();
    if (!trimmedFullName) {
      throw new BadRequestException('Student full name is required.');
    }

    return this.withEntityIdRetry(() =>
      this.createStudentOnce(data, auditActor, user, trimmedFullName),
    );
  }

  private async createStudentOnce(
    data: CreateStudentDto,
    auditActor: ActionHistoryActor | undefined,
    user: {
      id: string;
      email: string;
      province: string | null;
      roleType: UserRole;
    },
    trimmedFullName: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const createdStudent = await tx.studentInfo.create({
        data: {
          id: generateStudentId(),
          fullName: trimmedFullName,
          email: normalizeOptionalText(data.email) ?? user.email,
          school: normalizeOptionalText(data.school),
          province:
            normalizeOptionalText(data.province) ??
            normalizeOptionalText(user.province),
          birthYear: data.birth_year,
          parentName: normalizeOptionalText(data.parent_name),
          parentPhone: normalizeOptionalText(data.parent_phone),
          parentEmail: normalizeOptionalText(data.parent_email),
          parentReceiptEmailEnabled: data.parent_receipt_email_enabled ?? true,
          status: data.status ?? StudentStatus.active,
          gender: data.gender ?? Gender.male,
          goal: normalizeOptionalText(data.goal),
          dropOutDate: toDateOrNull(data.drop_out_date) ?? undefined,
          userId: data.user_id,
        },
      });

      if (user.roleType !== UserRole.student) {
        await tx.user.update({
          where: {
            id: data.user_id,
          },
          data: {
            roleType: UserRole.student,
          },
        });
      }

      if (auditActor) {
        const afterValue = await this.getStudentAuditSnapshot(
          tx,
          createdStudent.id,
        );
        if (afterValue) {
          await this.actionHistoryService.recordCreate(tx, {
            actor: auditActor,
            entityType: 'student',
            entityId: createdStudent.id,
            description: 'Tạo học sinh',
            afterValue,
          });
        }
      }

      return createdStudent;
    });
  }

  private async withEntityIdRetry<T>(operation: () => Promise<T>): Promise<T> {
    const maxAttempts = 5;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isEntityIdUniqueConstraintError(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    throw new BadRequestException(
      'Could not generate a unique student id. Please retry.',
      { cause: lastError },
    );
  }
}

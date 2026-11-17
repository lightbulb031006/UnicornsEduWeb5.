import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/client';
import {
  ClassStatus,
  StaffRole,
  StaffStatus,
  UserRole,
  UserStatus,
} from 'generated/enums';
import { hasTrainingAccess } from 'src/common/training-access';
import { PRIVILEGED_STAFF_ROLES } from 'src/common/staff-role-policy';
import {
  AchievementService,
  type StaffAchievementEditor,
} from 'src/achievements/achievement.service';
import {
  type ActionHistoryActor,
  ActionHistoryService,
} from 'src/action-history/action-history.service';
import { AuthIdentityCacheService } from 'src/auth/auth-identity-cache.service';
import type { JwtPayload } from 'src/auth/decorators/current-user.decorator';
import { getPreferredUserFullName } from 'src/common/user-name.util';
import type { PaginationQueryDto } from 'src/dtos/pagination.dto';
import type {
  TrainingHeadTutorManagementDto,
  TrainingRoleCandidateDto,
  TrainingRoleCandidateQueryDto,
  TrainingTutorAccountStatusResultDto,
  TrainingTutorBonusDto,
  TrainingTutorClassDto,
  TrainingTutorDetailDto,
  TrainingTutorListQueryDto,
  TrainingTutorMonthQueryDto,
  TrainingTutorPageDto,
  TrainingTutorListItemDto,
  TrainingTutorSessionDto,
  TrainingTutorStatusResultDto,
  TrainingTutorSummaryDto,
  UpdateTrainingTutorAccountStatusDto,
  UpdateTrainingTutorProfileDto,
  UpdateTrainingTutorStatusDto,
} from 'src/dtos/training-tutor.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  AccountHandleResultDto,
  SetAccountHandleDto,
} from 'src/dtos/user.dto';
import { changeAccountHandleInTx } from 'src/user/account-handle';
import { buildNameSearchWhere } from 'src/staff/staff-name-search';
import { StaffService } from 'src/staff/staff.service';
import {
  TRAINING_HEAD_MANAGEABLE_ROLES,
  type TrainingHeadTarget,
  assertTrainingHeadCanChangeAccountHandle,
  assertTrainingHeadCanChangeStatus,
  assertTrainingHeadCanLockAccount,
  assertTrainingHeadSubordinate,
  canTrainingHeadChangeAccountHandle,
  canTrainingHeadChangeStatus,
  canTrainingHeadEditRoles,
  canTrainingHeadLockAccount,
  isTrainingHeadSubordinate,
  pickTrainingTeamRoles,
} from 'src/staff/training-head-role-policy';
import { AVATAR_STORAGE_BUCKET } from 'src/storage/media-buckets';
import {
  createSignedStorageUrl,
  type UploadableFile,
} from 'src/storage/supabase-storage';
import { uploadUserAvatarFiles } from 'src/storage/user-avatar-upload';

const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Allowlist field gia sư cho Ban Đào Tạo. Select tường minh để field nhạy cảm
 * (CCCD, dân tộc, giới tính, ngày sinh, địa chỉ, ngân hàng, QR, Meet link, tiền)
 * không bao giờ rời DB, kể cả khi schema thêm cột mới.
 */
const TUTOR_SUMMARY_SELECT = {
  id: true,
  status: true,
  roles: true,
  university: true,
  highSchool: true,
  user: {
    select: {
      first_name: true,
      last_name: true,
      accountHandle: true,
      avatarPath: true,
      // Chỉ dùng tính quyền của Trưởng ban (#278), không trả ra response.
      roleType: true,
      status: true,
    },
  },
  _count: { select: { achievements: true } },
} satisfies Prisma.StaffInfoSelect;

type TutorSummaryRow = Prisma.StaffInfoGetPayload<{
  select: typeof TUTOR_SUMMARY_SELECT;
}>;

/** Phân công lớp của gia sư, mới nhất trước; dùng chia Lớp đang dạy / Lớp đã nghỉ. */
const TUTOR_CLASS_ASSIGNMENTS_SELECT = {
  select: {
    status: true,
    class: { select: { id: true, name: true, status: true } },
  },
  orderBy: { createdAt: 'desc' },
} satisfies Prisma.StaffInfo$classTeachersArgs;

type TutorClassAssignment = {
  status: string | null;
  class: { id: string; name: string; status: ClassStatus };
};

/**
 * Đang dạy: phân công còn active (null coi như active) trên lớp đang chạy.
 * Đã nghỉ: mọi lớp còn lại gia sư từng được phân công, không phân biệt lý do.
 */
export function splitTutorClasses(assignments: TutorClassAssignment[]) {
  const currentClasses: TrainingTutorClassDto[] = [];
  const pastClasses: TrainingTutorClassDto[] = [];
  for (const assignment of assignments) {
    const target = { id: assignment.class.id, name: assignment.class.name };
    const isCurrent =
      (assignment.status === null || assignment.status === 'active') &&
      assignment.class.status === ClassStatus.running;
    (isCurrent ? currentClasses : pastClasses).push(target);
  }
  return { currentClasses, pastClasses };
}

const TUTOR_WHERE = {
  roles: { has: StaffRole.teacher },
} satisfies Prisma.StaffInfoWhereInput;

/** Nhân sự ba nhóm Trưởng ban Đào tạo quản lý: Gia sư, Ban Chuyên môn, Đào tạo (#278). */
const TRAINING_TEAM_WHERE = {
  roles: { hasSome: [...TRAINING_HEAD_MANAGEABLE_ROLES] },
} satisfies Prisma.StaffInfoWhereInput;

/**
 * Ứng viên để Trưởng ban bật role ba nhóm (follow-up 13/11 mục 2.2, CONTEXT.md
 * «Chỉnh role nhân sự (Trưởng ban Đào tạo)»): nhân sự thường ngoài ba nhóm —
 * không Admin, không role trưởng, không tài khoản admin hệ thống, đang active.
 * Loại chính người gọi ở query (`id not`).
 */
const ROLE_CANDIDATE_WHERE = {
  status: StaffStatus.active,
  NOT: [
    { roles: { hasSome: [...TRAINING_HEAD_MANAGEABLE_ROLES] } },
    { roles: { hasSome: [...PRIVILEGED_STAFF_ROLES] } },
    { user: { is: { roleType: UserRole.admin } } },
  ],
} satisfies Prisma.StaffInfoWhereInput;

/** Allowlist ứng viên: họ tên + role hiện có, không thông tin cá nhân. */
const ROLE_CANDIDATE_SELECT = {
  id: true,
  roles: true,
  user: {
    select: { first_name: true, last_name: true, accountHandle: true },
  },
} satisfies Prisma.StaffInfoSelect;

/** Target của thao tác ghi: role, tài khoản, tên — đủ cho policy + audit. */
const TARGET_SELECT = {
  id: true,
  roles: true,
  userId: true,
  university: true,
  highSchool: true,
  user: {
    select: {
      first_name: true,
      last_name: true,
      roleType: true,
      status: true,
      avatarPath: true,
      avatarWatermarkedPath: true,
    },
  },
} satisfies Prisma.StaffInfoSelect;

type TargetRow = Prisma.StaffInfoGetPayload<{ select: typeof TARGET_SELECT }>;

/** Người xem lấy thẳng từ JWT (`id`, `roleType`). */
export type TrainingTutorViewer = Pick<JwtPayload, 'id' | 'roleType'>;
export type TrainingHeadActor = Pick<JwtPayload, 'id' | 'email' | 'roleType'>;

interface TrainingViewerContext {
  isAdmin: boolean;
  /** Trưởng ban Đào tạo (và admin) xem nhân sự ba nhóm; Ban Đào Tạo thường chỉ gia sư. */
  canViewAllStaff: boolean;
  /** Staff id nếu người xem là Trưởng ban Đào tạo đang hoạt động. */
  headStaffId: string | null;
}

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function toAuditActor(viewer: TrainingHeadActor): ActionHistoryActor {
  return {
    userId: viewer.id,
    userEmail: viewer.email,
    roleType: viewer.roleType,
  };
}

function toPolicyTarget(
  headStaffId: string,
  row: {
    id: string;
    roles: StaffRole[];
    user?: { roleType?: UserRole | null } | null;
  },
): TrainingHeadTarget {
  return {
    actorStaffId: headStaffId,
    targetStaffId: row.id,
    targetRoles: row.roles,
    targetIsAdminAccount: row.user?.roleType === UserRole.admin,
  };
}

/** Quyền + trạng thái tài khoản Trưởng ban thấy trên một nhân sự (#278). */
export function buildTrainingHeadManagement(
  headStaffId: string,
  row: {
    id: string;
    roles: StaffRole[];
    user?: { roleType?: UserRole | null; status?: UserStatus | null } | null;
  },
): TrainingHeadTutorManagementDto {
  const target = toPolicyTarget(headStaffId, row);
  const isSubordinate = isTrainingHeadSubordinate(target);
  const hasAccount = row.user != null;
  return {
    isSubordinate,
    hasOtherRoles: row.roles.some(
      (role) => !TRAINING_HEAD_MANAGEABLE_ROLES.includes(role),
    ),
    accountLocked:
      isSubordinate && row.user?.status
        ? row.user.status === UserStatus.inactive
        : null,
    permissions: {
      canEditRoles: canTrainingHeadEditRoles(target),
      canEditProfile: isSubordinate,
      canChangeStatus: canTrainingHeadChangeStatus(target),
      canLockAccount: hasAccount && canTrainingHeadLockAccount(target),
      canManageMeetLink: isSubordinate,
      canViewBonuses: isSubordinate,
      canEditAccountHandle:
        hasAccount && canTrainingHeadChangeAccountHandle(target),
    },
  };
}

function clampPaging(query: PaginationQueryDto) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

@Injectable()
export class TrainingTutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly achievementService: AchievementService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly authIdentityCacheService: AuthIdentityCacheService,
    private readonly staffService: StaffService,
  ) {}

  /** Admin, hoặc staff có role `training`/`training_head` đang active (Ban Đào Tạo). */
  async assertTrainingViewer(viewer: TrainingTutorViewer): Promise<void> {
    await this.resolveTrainingViewer(viewer);
  }

  /**
   * Như `assertTrainingViewer`, kèm phạm vi: Trưởng ban Đào tạo (và admin) xem
   * nhân sự ba nhóm Gia sư / Ban Chuyên môn / Đào tạo (#278) ở cùng mức dữ liệu
   * hồ sơ gia sư; Ban Đào Tạo thường chỉ xem staff có role `teacher`.
   */
  private async resolveTrainingViewer(
    viewer: TrainingTutorViewer,
  ): Promise<TrainingViewerContext> {
    if (viewer.roleType === UserRole.admin) {
      return { isAdmin: true, canViewAllStaff: true, headStaffId: null };
    }

    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId: viewer.id },
      select: { id: true, roles: true, status: true },
    });

    if (
      !staff ||
      staff.status !== StaffStatus.active ||
      !hasTrainingAccess(staff.roles)
    ) {
      throw new ForbiddenException(
        'Chỉ Ban Đào Tạo mới được xem hồ sơ gia sư.',
      );
    }
    const isHead = staff.roles.includes(StaffRole.training_head);
    return {
      isAdmin: staff.roles.includes(StaffRole.admin),
      canViewAllStaff: isHead,
      headStaffId: isHead ? (staff.id ?? null) : null,
    };
  }

  private profileWhere(canViewAllStaff: boolean): Prisma.StaffInfoWhereInput {
    return canViewAllStaff ? TRAINING_TEAM_WHERE : TUTOR_WHERE;
  }

  async listTutors(
    viewer: TrainingTutorViewer,
    query: TrainingTutorListQueryDto,
  ): Promise<TrainingTutorPageDto<TrainingTutorListItemDto>> {
    const context = await this.resolveTrainingViewer(viewer);
    const { canViewAllStaff } = context;
    const isAllScope = query.scope === 'all';
    if (isAllScope && !canViewAllStaff) {
      throw new ForbiddenException(
        'Chỉ Trưởng ban Đào tạo mới xem được tất cả nhân sự.',
      );
    }
    const { page, limit, skip } = clampPaging(query);
    // Lọc role chỉ trong ba nhóm (`scope=all`); `tutors` vốn chỉ gia sư. Gộp
    // vào `AND` vì tìm theo tên cũng trả `AND`.
    const andFilters: Prisma.StaffInfoWhereInput[] = [
      buildNameSearchWhere(query.search),
      ...(isAllScope && query.role ? [{ roles: { has: query.role } }] : []),
    ];
    const where: Prisma.StaffInfoWhereInput = {
      ...(isAllScope ? TRAINING_TEAM_WHERE : TUTOR_WHERE),
      ...(query.status ? { status: query.status } : {}),
      AND: andFilters,
    };

    const [total, rows] = await Promise.all([
      this.prisma.staffInfo.count({ where }),
      this.prisma.staffInfo.findMany({
        where,
        select: {
          ...TUTOR_SUMMARY_SELECT,
          classTeachers: TUTOR_CLASS_ASSIGNMENTS_SELECT,
        },
        orderBy: [{ status: 'asc' }, { user: { first_name: 'asc' } }],
        skip,
        take: limit,
      }),
    ]);

    return {
      data: await Promise.all(
        rows.map(async (row) => ({
          ...(await this.toSummary(row, context)),
          currentClasses: splitTutorClasses(row.classTeachers ?? [])
            .currentClasses,
        })),
      ),
      meta: { total, page, limit },
    };
  }

  async getTutor(
    viewer: TrainingTutorViewer,
    staffId: string,
  ): Promise<TrainingTutorDetailDto> {
    const context = await this.resolveTrainingViewer(viewer);

    const row = await this.prisma.staffInfo.findFirst({
      where: { ...this.profileWhere(context.canViewAllStaff), id: staffId },
      select: {
        ...TUTOR_SUMMARY_SELECT,
        classTeachers: TUTOR_CLASS_ASSIGNMENTS_SELECT,
        _count: { select: { achievements: true, sessions: true } },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy gia sư.');

    const { currentClasses, pastClasses } = splitTutorClasses(
      row.classTeachers,
    );

    const { management, ...summary } = await this.toSummary(row, context);
    return {
      ...summary,
      currentClasses,
      pastClasses,
      taughtSessionCount: row._count.sessions,
      ...(management
        ? {
            management: {
              ...management,
              ...(await this.loadSubordinateWorkInfo(row, management)),
            },
          }
        : {}),
    };
  }

  /**
   * Họ / tên (điền form hồ sơ) và link Meet chỉ cho cấp dưới. Link Meet đọc
   * bằng query riêng để allowlist hồ sơ chung không bao giờ chứa cột này.
   */
  private async loadSubordinateWorkInfo(
    row: TutorSummaryRow,
    management: TrainingHeadTutorManagementDto,
  ) {
    if (!management.isSubordinate) {
      return {
        lastName: null,
        firstName: null,
        googleMeetLink: null,
        accountHandle: null,
      };
    }
    const extra = await this.prisma.staffInfo.findUnique({
      where: { id: row.id },
      select: {
        googleMeetLink: true,
        user: { select: { accountHandle: true } },
      },
    });
    return {
      lastName: row.user?.last_name ?? null,
      firstName: row.user?.first_name ?? null,
      googleMeetLink: extra?.googleMeetLink ?? null,
      accountHandle: extra?.user?.accountHandle ?? null,
    };
  }

  async listTutorSessions(
    viewer: TrainingTutorViewer,
    staffId: string,
    query: PaginationQueryDto,
  ): Promise<TrainingTutorPageDto<TrainingTutorSessionDto>> {
    const { canViewAllStaff } = await this.resolveTrainingViewer(viewer);
    await this.assertProfileExists(staffId, canViewAllStaff);
    const { page, limit, skip } = clampPaging(query);
    const where = { teacherId: staffId } satisfies Prisma.SessionWhereInput;

    const [total, data] = await Promise.all([
      this.prisma.session.count({ where }),
      // Không select cột tiền / trạng thái thanh toán / Meet link của buổi.
      this.prisma.session.findMany({
        where,
        select: {
          id: true,
          date: true,
          startTime: true,
          endTime: true,
          class: { select: { id: true, name: true } },
        },
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async listTutorAchievements(viewer: TrainingTutorViewer, staffId: string) {
    const { canViewAllStaff } = await this.resolveTrainingViewer(viewer);
    await this.assertProfileExists(staffId, canViewAllStaff);
    return this.achievementService.listStaffAchievements(staffId);
  }

  /**
   * Ban Đào Tạo sửa thành tích của người mình xem được (gia sư; Trưởng ban:
   * mọi nhân sự), không bị ràng buộc minh chứng như admin. Hồ sơ của chính
   * mình → 403 (sửa ở trang hồ sơ cá nhân).
   */
  async resolveAchievementEditor(
    viewer: Pick<JwtPayload, 'id' | 'email' | 'roleType'>,
    staffId: string,
  ): Promise<StaffAchievementEditor> {
    const { canViewAllStaff } = await this.resolveTrainingViewer(viewer);
    await this.assertProfileExists(staffId, canViewAllStaff);
    return this.achievementService.resolveOtherStaffAchievementEditor(
      viewer,
      staffId,
    );
  }

  private async assertProfileExists(staffId: string, canViewAllStaff: boolean) {
    const tutor = await this.prisma.staffInfo.findFirst({
      where: { ...this.profileWhere(canViewAllStaff), id: staffId },
      select: { id: true },
    });
    if (!tutor) throw new NotFoundException('Không tìm thấy gia sư.');
  }

  private async toSummary(
    row: TutorSummaryRow,
    context: TrainingViewerContext,
  ): Promise<TrainingTutorSummaryDto> {
    const { user } = row;
    return {
      id: row.id,
      fullName: getPreferredUserFullName(user) ?? '',
      status: row.status,
      // #278: ngoài Admin, người xem chỉ thấy phần role thuộc ba nhóm.
      roles: context.isAdmin ? row.roles : pickTrainingTeamRoles(row.roles),
      avatarUrl: await createSignedStorageUrl({
        bucket: AVATAR_STORAGE_BUCKET,
        path: user?.avatarPath,
        expiresIn: AVATAR_SIGNED_URL_TTL_SECONDS,
      }),
      university: row.university,
      highSchool: row.highSchool,
      achievementCount: row._count.achievements,
      ...(context.headStaffId
        ? { management: buildTrainingHeadManagement(context.headStaffId, row) }
        : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Trưởng ban Đào tạo quản lý cấp dưới (#278)
  // ---------------------------------------------------------------------------

  /** Staff active mang role Trưởng ban Đào tạo; trả staff id của actor. */
  async resolveHead(viewer: TrainingTutorViewer): Promise<string> {
    const actor = await this.prisma.staffInfo.findFirst({
      where: { userId: viewer.id },
      select: { id: true, roles: true, status: true },
    });
    if (
      !actor ||
      actor.status !== StaffStatus.active ||
      !actor.roles.includes(StaffRole.training_head)
    ) {
      throw new ForbiddenException(
        'Chỉ Trưởng ban Đào tạo được dùng chức năng này.',
      );
    }
    return actor.id;
  }

  /**
   * Ứng viên bật role Gia sư / Ban Chuyên môn / Đào tạo (follow-up 13/11 mục
   * 2.2). Người trong ba nhóm đã có ở `scope=all`, nên chỉ trả người ngoài
   * nhóm. Chỉ họ tên + role hiện có (role không phải PII) — bật role đi qua
   * `PATCH /staff/:id/training-roles` (policy chặn lại lần nữa).
   */
  async listRoleCandidates(
    viewer: TrainingTutorViewer,
    query: TrainingRoleCandidateQueryDto,
  ): Promise<TrainingTutorPageDto<TrainingRoleCandidateDto>> {
    const headStaffId = await this.resolveHead(viewer);
    const { page, limit, skip } = clampPaging(query);
    const where: Prisma.StaffInfoWhereInput = {
      AND: [
        ROLE_CANDIDATE_WHERE,
        { id: { not: headStaffId } },
        buildNameSearchWhere(query.search),
      ],
    };

    const [total, rows] = await Promise.all([
      this.prisma.staffInfo.count({ where }),
      this.prisma.staffInfo.findMany({
        where,
        select: ROLE_CANDIDATE_SELECT,
        orderBy: [{ user: { first_name: 'asc' } }, { id: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        fullName: getPreferredUserFullName(row.user) ?? '',
        roles: row.roles,
      })),
      meta: { total, page, limit },
    };
  }

  private async findTarget(staffId: string): Promise<TargetRow> {
    const target = await this.prisma.staffInfo.findUnique({
      where: { id: staffId },
      select: TARGET_SELECT,
    });
    if (!target) throw new NotFoundException('Không tìm thấy nhân sự.');
    return target;
  }

  private invalidateAuth(userId: string | null | undefined) {
    if (userId) this.authIdentityCacheService.invalidateUser(userId);
  }

  /** Thưởng của cấp dưới, có số tiền — chỉ đọc (thưởng không phải thu nhập cá nhân). */
  async listBonuses(
    viewer: TrainingTutorViewer,
    staffId: string,
    query: TrainingTutorMonthQueryDto,
  ): Promise<TrainingTutorBonusDto[]> {
    const headStaffId = await this.resolveHead(viewer);
    const target = await this.findTarget(staffId);
    assertTrainingHeadSubordinate(
      toPolicyTarget(headStaffId, target),
      'xem thưởng',
    );
    const month = query.month?.trim() || undefined;

    const rows = await this.prisma.bonus.findMany({
      where: { staffId, ...(month ? { month } : {}) },
      select: {
        id: true,
        workType: true,
        amount: true,
        status: true,
        note: true,
        month: true,
        date: true,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map((row) => ({
      ...row,
      date: row.date.toISOString().slice(0, 10),
    }));
  }

  /** Hồ sơ chuyên môn: họ tên, trường đại học, trường THPT. */
  async updateProfessionalProfile(
    viewer: TrainingHeadActor,
    staffId: string,
    data: UpdateTrainingTutorProfileDto,
  ): Promise<TrainingTutorDetailDto> {
    const headStaffId = await this.resolveHead(viewer);
    const target = await this.findTarget(staffId);
    assertTrainingHeadSubordinate(
      toPolicyTarget(headStaffId, target),
      'sửa hồ sơ',
    );

    const firstName = normalizeOptionalText(data.firstName);
    const lastName = normalizeOptionalText(data.lastName);
    if (firstName === null) {
      throw new BadRequestException('Tên không được để trống.');
    }
    const staffData: Prisma.StaffInfoUpdateInput = {};
    const university = normalizeOptionalText(data.university);
    const highSchool = normalizeOptionalText(data.highSchool);
    if (university !== undefined) staffData.university = university;
    if (highSchool !== undefined) staffData.highSchool = highSchool;
    const userData: Prisma.UserUpdateInput = {};
    if (firstName !== undefined) userData.first_name = firstName;
    if (lastName !== undefined) userData.last_name = lastName;

    const touchesUser = Object.keys(userData).length > 0;
    if (touchesUser && !target.userId) {
      throw new BadRequestException('Nhân sự chưa có tài khoản để đổi họ tên.');
    }
    if (touchesUser || Object.keys(staffData).length > 0) {
      await this.prisma.$transaction(async (tx) => {
        if (Object.keys(staffData).length > 0) {
          await tx.staffInfo.update({
            where: { id: target.id },
            data: staffData,
            select: { id: true },
          });
        }
        if (touchesUser && target.userId) {
          await tx.user.update({
            where: { id: target.userId },
            data: userData,
            select: { id: true },
          });
        }
        await this.actionHistoryService.recordUpdate(tx, {
          actor: toAuditActor(viewer),
          entityType: 'staff',
          entityId: target.id,
          description: 'Trưởng ban Đào tạo sửa hồ sơ chuyên môn',
          beforeValue: {
            firstName: target.user?.first_name ?? null,
            lastName: target.user?.last_name ?? null,
            university: target.university,
            highSchool: target.highSchool,
          },
          afterValue: {
            firstName: firstName ?? target.user?.first_name ?? null,
            lastName:
              lastName !== undefined
                ? lastName
                : (target.user?.last_name ?? null),
            university:
              university !== undefined ? university : target.university,
            highSchool:
              highSchool !== undefined ? highSchool : target.highSchool,
          },
        });
      });
      this.invalidateAuth(target.userId);
    }
    return this.getTutor(viewer, target.id);
  }

  /** Ảnh đại diện của cấp dưới: thay bản gốc (private) + bản watermark (public). */
  async uploadAvatar(
    viewer: TrainingHeadActor,
    staffId: string,
    file: UploadableFile | undefined,
  ): Promise<TrainingTutorDetailDto> {
    const headStaffId = await this.resolveHead(viewer);
    const target = await this.findTarget(staffId);
    assertTrainingHeadSubordinate(
      toPolicyTarget(headStaffId, target),
      'đổi ảnh đại diện',
    );
    if (!target.userId) {
      throw new BadRequestException(
        'Nhân sự chưa có tài khoản nên không đổi được ảnh đại diện.',
      );
    }
    if (!file) {
      throw new BadRequestException('Vui lòng chọn ảnh đại diện để tải lên.');
    }
    const userId = target.userId;
    const { avatarPath, avatarWatermarkedPath } = await uploadUserAvatarFiles(
      userId,
      file,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { avatarPath, avatarWatermarkedPath },
        select: { id: true },
      });
      await this.actionHistoryService.recordUpdate(tx, {
        actor: toAuditActor(viewer),
        entityType: 'staff',
        entityId: target.id,
        description: 'Trưởng ban Đào tạo đổi ảnh đại diện nhân sự',
        beforeValue: {
          avatarPath: target.user?.avatarPath ?? null,
          avatarWatermarkedPath: target.user?.avatarWatermarkedPath ?? null,
        },
        afterValue: { avatarPath, avatarWatermarkedPath },
      });
    });

    this.invalidateAuth(userId);
    return this.getTutor(viewer, target.id);
  }

  /**
   * Trạng thái đang làm / đã nghỉ (`staff_info.status`). Dùng chung luồng của
   * Admin (`StaffService.updateStaffStatus`: chuyển nghỉ thì đóng lịch dạy
   * tương lai, ghi lịch sử) nhưng chỉ trả id + status (không PII, không tiền).
   */
  async updateStatus(
    viewer: TrainingHeadActor,
    staffId: string,
    data: UpdateTrainingTutorStatusDto,
  ): Promise<TrainingTutorStatusResultDto> {
    const headStaffId = await this.resolveHead(viewer);
    const target = await this.findTarget(staffId);
    assertTrainingHeadCanChangeStatus(toPolicyTarget(headStaffId, target));

    await this.staffService.updateStaffStatus(
      target.id,
      { status: data.status, reason: data.reason },
      toAuditActor(viewer),
    );
    return { id: target.id, status: data.status };
  }

  /** Khoá / mở khoá tài khoản đăng nhập (`users.status`). */
  async updateAccountStatus(
    viewer: TrainingHeadActor,
    staffId: string,
    data: UpdateTrainingTutorAccountStatusDto,
  ): Promise<TrainingTutorAccountStatusResultDto> {
    const headStaffId = await this.resolveHead(viewer);
    const target = await this.findTarget(staffId);
    assertTrainingHeadCanLockAccount(toPolicyTarget(headStaffId, target));
    if (!target.userId || !target.user) {
      throw new BadRequestException('Nhân sự chưa có tài khoản đăng nhập.');
    }

    const currentlyLocked = target.user.status === UserStatus.inactive;
    if (currentlyLocked === data.locked) {
      return { id: target.id, accountLocked: currentlyLocked };
    }

    const nextStatus = data.locked ? UserStatus.inactive : UserStatus.active;
    const userId = target.userId;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: nextStatus },
        select: { id: true },
      });
      await this.actionHistoryService.recordUpdate(tx, {
        actor: toAuditActor(viewer),
        entityType: 'staff',
        entityId: target.id,
        description: data.locked
          ? 'Trưởng ban Đào tạo khoá tài khoản nhân sự'
          : 'Trưởng ban Đào tạo mở khoá tài khoản nhân sự',
        beforeValue: { accountStatus: target.user?.status },
        afterValue: { accountStatus: nextStatus },
      });
    });

    this.invalidateAuth(userId);
    return { id: target.id, accountLocked: data.locked };
  }

  /**
   * Đổi tên đăng nhập của cấp dưới (16/11) — cùng điều kiện khoá tài khoản:
   * người đích CHỈ mang role Gia sư / Ban Chuyên môn / Đào tạo.
   */
  async updateAccountHandle(
    viewer: TrainingHeadActor,
    staffId: string,
    data: SetAccountHandleDto,
  ): Promise<AccountHandleResultDto> {
    const headStaffId = await this.resolveHead(viewer);
    const target = await this.findTarget(staffId);
    assertTrainingHeadCanChangeAccountHandle(
      toPolicyTarget(headStaffId, target),
    );
    if (!target.userId) {
      throw new BadRequestException('Nhân sự chưa có tài khoản đăng nhập.');
    }

    const userId = target.userId;
    const change = await this.prisma.$transaction(async (tx) => {
      const result = await changeAccountHandleInTx(tx, {
        userId,
        accountHandle: data.accountHandle,
      });
      if (result.changed) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: toAuditActor(viewer),
          entityType: 'staff',
          entityId: target.id,
          description: 'Trưởng ban Đào tạo đổi tên đăng nhập nhân sự',
          beforeValue: { accountHandle: result.previous },
          afterValue: { accountHandle: result.next },
        });
      }
      return result;
    });

    if (change.changed) this.invalidateAuth(userId);
    return { id: target.id, accountHandle: change.next };
  }
}

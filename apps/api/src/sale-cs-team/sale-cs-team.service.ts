import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/client';
import { StaffRole, StaffStatus, UserRole, UserStatus } from 'generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from 'src/action-history/action-history.service';
import {
  AchievementService,
  type StaffAchievementEditor,
} from 'src/achievements/achievement.service';
import { AuthIdentityCacheService } from 'src/auth/auth-identity-cache.service';
import type { JwtPayload } from 'src/auth/decorators/current-user.decorator';
import { SALE_CS_HEAD_ROLE } from 'src/common/sale-cs-head-access';
import { PRIVILEGED_STAFF_ROLES } from 'src/common/staff-role-policy';
import { getPreferredUserFullName } from 'src/common/user-name.util';
import type {
  SaleCsTeamAccountStatusResultDto,
  SaleCsTeamBonusDto,
  SaleCsTeamListQueryDto,
  SaleCsTeamMemberDetailDto,
  SaleCsTeamMemberDto,
  SaleCsTeamMonthQueryDto,
  SaleCsTeamPageDto,
  SaleCsTeamRolesResultDto,
  SaleCsTeamSaleAllowanceDto,
  UpdateSaleCsTeamAccountStatusDto,
  UpdateSaleCsTeamProfileDto,
  UpdateSaleCsTeamRolesDto,
} from 'src/dtos/sale-cs-team.dto';
import { FixedSalarySettingsService } from 'src/fixed-salary-settings/fixed-salary-settings.service';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  AccountHandleResultDto,
  SetAccountHandleDto,
} from 'src/dtos/user.dto';
import { changeAccountHandleInTx } from 'src/user/account-handle';
import { releaseCustomerCareAssignmentsOnRoleRemovalInTx } from 'src/customer-care/customer-care-role-release';
import {
  SALE_CS_HEAD_MANAGEABLE_ROLES,
  assertSaleCsHeadCanChangeAccountHandle,
  assertSaleCsHeadCanEditAchievements,
  assertSaleCsHeadCanEditProfile,
  assertSaleCsHeadCanLockAccount,
  canSaleCsHeadChangeAccountHandle,
  canSaleCsHeadEditAchievements,
  canSaleCsHeadEditProfile,
  canSaleCsHeadEditRoles,
  canSaleCsHeadLockAccount,
  planSaleCsHeadRoleChange,
} from 'src/staff/sale-cs-head-role-policy';
import { buildNameSearchWhere } from 'src/staff/staff-name-search';
import { AVATAR_STORAGE_BUCKET } from 'src/storage/media-buckets';
import {
  createSignedStorageUrl,
  type UploadableFile,
} from 'src/storage/supabase-storage';
import { uploadUserAvatarFiles } from 'src/storage/user-avatar-upload';

const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Nhân sự thuộc đội Sale & CSKH. */
const TEAM_MEMBER_WHERE = {
  roles: { hasSome: [...SALE_CS_HEAD_MANAGEABLE_ROLES] },
} satisfies Prisma.StaffInfoWhereInput;

/**
 * Ứng viên để bật role Sale/CSKH: chưa thuộc đội, không phải Admin / trưởng,
 * không phải tài khoản admin hệ thống.
 */
const TEAM_CANDIDATE_WHERE = {
  // Đối xứng ứng viên của Trưởng ban Đào tạo: chỉ nhân sự đang hoạt động.
  status: StaffStatus.active,
  NOT: [
    { roles: { hasSome: [...SALE_CS_HEAD_MANAGEABLE_ROLES] } },
    { roles: { hasSome: [...PRIVILEGED_STAFF_ROLES] } },
    { user: { is: { roleType: UserRole.admin } } },
  ],
} satisfies Prisma.StaffInfoWhereInput;

/**
 * Allowlist field Trưởng phòng được xem. Select tường minh để field nhạy cảm
 * (email, SĐT, CCCD, dân tộc, giới tính, ngày sinh, địa chỉ, ngân hàng, QR,
 * lương) không bao giờ rời DB, kể cả khi schema thêm cột mới.
 */
const MEMBER_SELECT = {
  id: true,
  status: true,
  roles: true,
  university: true,
  highSchool: true,
  customerCareDefaultProfitPercent: true,
  user: {
    select: {
      first_name: true,
      last_name: true,
      accountHandle: true,
      avatarPath: true,
      roleType: true,
      status: true,
      province: true,
    },
  },
  customerCareManagedBy: {
    select: {
      id: true,
      user: {
        select: { first_name: true, last_name: true, accountHandle: true },
      },
    },
  },
  _count: { select: { customerCareServices: true, achievements: true } },
} satisfies Prisma.StaffInfoSelect;

type MemberRow = Prisma.StaffInfoGetPayload<{ select: typeof MEMBER_SELECT }>;

/**
 * Trang chi tiết thành viên (`/staff/staffs/:id`, bố cục `/admin/staffs/:id`)
 * thêm link Google Meet (link lớp, không phải dữ liệu cá nhân — #270).
 */
const MEMBER_DETAIL_SELECT = {
  ...MEMBER_SELECT,
  googleMeetLink: true,
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
      accountHandle: true,
      email: true,
      roleType: true,
      status: true,
      avatarPath: true,
      avatarWatermarkedPath: true,
    },
  },
  _count: { select: { customerCareServices: true } },
} satisfies Prisma.StaffInfoSelect;

type TargetRow = Prisma.StaffInfoGetPayload<{ select: typeof TARGET_SELECT }>;

export type SaleCsTeamViewer = Pick<JwtPayload, 'id' | 'email' | 'roleType'>;

function clampPaging(query: { page?: number; limit?: number }) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

function normalizeMonth(month?: string): string | undefined {
  const value = month?.trim();
  if (!value) return undefined;
  if (!MONTH_PATTERN.test(value)) {
    throw new BadRequestException('Tháng phải có dạng YYYY-MM.');
  }
  return value;
}

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function toAuditActor(viewer: SaleCsTeamViewer): ActionHistoryActor {
  return {
    userId: viewer.id,
    userEmail: viewer.email,
    roleType: viewer.roleType,
  };
}

/**
 * Trưởng phòng Sale & CSKH quản lý đội Sale & CSKH (#271; CONTEXT.md «Quản lý
 * đội Sale & CSKH»). Khu staff, không mở route admin nào.
 */
@Injectable()
export class SaleCsTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly authIdentityCacheService: AuthIdentityCacheService,
    private readonly fixedSalarySettingsService: FixedSalarySettingsService,
    private readonly achievementService: AchievementService,
  ) {}

  /** Staff active mang role Trưởng phòng Sale & CSKH; trả staff id của actor. */
  async resolveHead(viewer: SaleCsTeamViewer): Promise<string> {
    const actor = await this.prisma.staffInfo.findFirst({
      where: { userId: viewer.id },
      select: { id: true, roles: true, status: true },
    });
    if (
      !actor ||
      actor.status !== StaffStatus.active ||
      !actor.roles.includes(SALE_CS_HEAD_ROLE)
    ) {
      throw new ForbiddenException(
        'Chỉ Trưởng phòng Sale & CSKH được dùng chức năng này.',
      );
    }
    return actor.id;
  }

  async listMembers(
    viewer: SaleCsTeamViewer,
    query: SaleCsTeamListQueryDto,
  ): Promise<SaleCsTeamPageDto<SaleCsTeamMemberDto>> {
    const headStaffId = await this.resolveHead(viewer);
    const { page, limit, skip } = clampPaging(query);
    const isCandidates = query.scope === 'candidates';
    const where: Prisma.StaffInfoWhereInput = {
      AND: [
        isCandidates ? TEAM_CANDIDATE_WHERE : TEAM_MEMBER_WHERE,
        !isCandidates && query.role ? { roles: { has: query.role } } : {},
        !isCandidates && query.status ? { status: query.status } : {},
        buildNameSearchWhere(query.search),
      ],
    };

    const [total, rows] = await Promise.all([
      this.prisma.staffInfo.count({ where }),
      this.prisma.staffInfo.findMany({
        where,
        select: MEMBER_SELECT,
        orderBy: [{ status: 'asc' }, { user: { first_name: 'asc' } }],
        skip,
        take: limit,
      }),
    ]);

    return {
      data: await Promise.all(
        rows.map((row) => this.toMember(row, headStaffId)),
      ),
      meta: { total, page, limit },
    };
  }

  async getMember(
    viewer: SaleCsTeamViewer,
    staffId: string,
  ): Promise<SaleCsTeamMemberDetailDto> {
    const headStaffId = await this.resolveHead(viewer);
    const row = await this.prisma.staffInfo.findFirst({
      where: { ...TEAM_MEMBER_WHERE, id: staffId },
      select: MEMBER_DETAIL_SELECT,
    });
    if (!row) {
      throw new NotFoundException('Không tìm thấy thành viên đội Sale & CSKH.');
    }
    return {
      ...(await this.toMember(row, headStaffId)),
      accountHandle: row.user?.accountHandle ?? null,
      googleMeetLink: row.googleMeetLink,
    };
  }

  /** Thành tích của thành viên đội (xem được cả hồ sơ Admin / trưởng trong đội). */
  async listAchievements(viewer: SaleCsTeamViewer, staffId: string) {
    await this.resolveHead(viewer);
    await this.assertTeamMember(staffId);
    return this.achievementService.listStaffAchievements(staffId);
  }

  /**
   * Người sửa thành tích của nhân sự dưới cấp: như admin (không ràng buộc minh
   * chứng, ghi lịch sử thao tác). Hồ sơ của mình / Admin / trưởng → 403.
   */
  async resolveAchievementEditor(
    viewer: SaleCsTeamViewer,
    staffId: string,
  ): Promise<StaffAchievementEditor> {
    const headStaffId = await this.resolveHead(viewer);
    const target = await this.findTarget(staffId);
    assertSaleCsHeadCanEditAchievements({
      actorStaffId: headStaffId,
      targetStaffId: target.id,
      targetRoles: target.roles,
      targetIsAdminAccount: target.user?.roleType === UserRole.admin,
    });
    return this.achievementService.resolveOtherStaffAchievementEditor(
      viewer,
      target.id,
    );
  }

  /** Trợ cấp sale của thành viên: học sinh, ghi chú, ngày — không select số tiền. */
  async listSaleAllowances(
    viewer: SaleCsTeamViewer,
    staffId: string,
    query: SaleCsTeamMonthQueryDto,
  ): Promise<SaleCsTeamSaleAllowanceDto[]> {
    await this.resolveHead(viewer);
    await this.assertTeamMember(staffId);
    const month = normalizeMonth(query.month);

    const rows = await this.prisma.extraAllowance.findMany({
      where: {
        staffId,
        roleType: StaffRole.sale,
        ...(month ? { month } : {}),
      },
      select: {
        id: true,
        month: true,
        note: true,
        createdAt: true,
        student: { select: { id: true, fullName: true } },
      },
      orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      month: row.month,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      student: row.student,
    }));
  }

  /** Thưởng của thành viên, có số tiền (biên bản mục 9) — chỉ đọc. */
  async listBonuses(
    viewer: SaleCsTeamViewer,
    staffId: string,
    query: SaleCsTeamMonthQueryDto,
  ): Promise<SaleCsTeamBonusDto[]> {
    await this.resolveHead(viewer);
    await this.assertTeamMember(staffId);
    const month = normalizeMonth(query.month);

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
        createdAt: true,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map((row) => ({
      ...row,
      date: row.date.toISOString().slice(0, 10),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * Bật/tắt role sale / customer_care. Role bị tắt mất mức đè lương cứng / %
   * vận hành (như Trưởng ban Đào tạo). Tắt CSKH → gỡ gán mọi học sinh người đó
   * đang chăm sóc trong cùng transaction (follow-up 13/11 mục 2.1).
   */
  async updateRoles(
    viewer: SaleCsTeamViewer,
    targetStaffId: string,
    data: UpdateSaleCsTeamRolesDto,
  ): Promise<SaleCsTeamRolesResultDto> {
    const headStaffId = await this.resolveHead(viewer);
    const target = await this.findTarget(targetStaffId);

    const plan = planSaleCsHeadRoleChange({
      actorStaffId: headStaffId,
      targetStaffId: target.id,
      targetRoles: target.roles,
      targetIsAdminAccount: target.user?.roleType === UserRole.admin,
      requestedRoles: data.roles,
    });
    if (plan.added.length === 0 && plan.removed.length === 0) {
      return {
        id: target.id,
        roles: target.roles,
        releasedCustomerCareStudentCount: 0,
      };
    }

    const actor = toAuditActor(viewer);
    const releasedCustomerCareStudentCount = await this.prisma.$transaction(
      async (tx) => {
        await tx.staffInfo.update({
          where: { id: target.id },
          data: { roles: plan.nextRoles },
          select: { id: true },
        });

        // Follow-up 13/11 mục 2.1: tắt CSKH → học sinh mất Người chăm sóc ngay.
        const releasedCount =
          await releaseCustomerCareAssignmentsOnRoleRemovalInTx(tx, {
            staffId: target.id,
            previousRoles: target.roles,
            nextRoles: plan.nextRoles,
          });

        await this.actionHistoryService.recordUpdate(tx, {
          actor,
          entityType: 'staff',
          entityId: target.id,
          description: 'Trưởng phòng Sale & CSKH chỉnh role nhân sự',
          beforeValue: {
            roles: target.roles,
            customerCareStudentCount: target._count.customerCareServices,
          },
          afterValue: {
            roles: plan.nextRoles,
            customerCareStudentCount:
              target._count.customerCareServices - releasedCount,
          },
        });

        if (plan.removed.length > 0) {
          await this.fixedSalarySettingsService.syncStaffRoleOverridesInTx(tx, {
            staffId: target.id,
            nextRoles: plan.nextRoles,
            items: [],
            staff: target,
            actor,
          });
        }

        return releasedCount;
      },
    );

    this.invalidateAuth(target.userId);
    return {
      id: target.id,
      roles: plan.nextRoles,
      releasedCustomerCareStudentCount,
    };
  }

  /** Khoá / mở khoá tài khoản đăng nhập (`users.status`). */
  async updateAccountStatus(
    viewer: SaleCsTeamViewer,
    targetStaffId: string,
    data: UpdateSaleCsTeamAccountStatusDto,
  ): Promise<SaleCsTeamAccountStatusResultDto> {
    const headStaffId = await this.resolveHead(viewer);
    const target = await this.findTarget(targetStaffId);
    assertSaleCsHeadCanLockAccount({
      actorStaffId: headStaffId,
      targetStaffId: target.id,
      targetRoles: target.roles,
      targetIsAdminAccount: target.user?.roleType === UserRole.admin,
    });
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
          ? 'Trưởng phòng Sale & CSKH khoá tài khoản nhân sự'
          : 'Trưởng phòng Sale & CSKH mở khoá tài khoản nhân sự',
        beforeValue: { accountStatus: target.user?.status },
        afterValue: { accountStatus: nextStatus },
      });
    });

    this.invalidateAuth(userId);
    return { id: target.id, accountLocked: data.locked };
  }

  /**
   * Đổi tên đăng nhập (16/11) — cùng phạm vi khoá tài khoản: target CHỈ mang
   * role sale / customer_care, không phải mình / Admin / trưởng.
   */
  async updateAccountHandle(
    viewer: SaleCsTeamViewer,
    targetStaffId: string,
    data: SetAccountHandleDto,
  ): Promise<AccountHandleResultDto> {
    const headStaffId = await this.resolveHead(viewer);
    const target = await this.findTarget(targetStaffId);
    assertSaleCsHeadCanChangeAccountHandle({
      actorStaffId: headStaffId,
      targetStaffId: target.id,
      targetRoles: target.roles,
      targetIsAdminAccount: target.user?.roleType === UserRole.admin,
    });
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
          description: 'Trưởng phòng Sale & CSKH đổi tên đăng nhập nhân sự',
          beforeValue: { accountHandle: result.previous },
          afterValue: { accountHandle: result.next },
        });
      }
      return result;
    });

    if (change.changed) this.invalidateAuth(userId);
    return { id: target.id, accountHandle: change.next };
  }

  /** Hồ sơ chuyên môn: họ tên, trường đại học, trường THPT. */
  async updateProfessionalProfile(
    viewer: SaleCsTeamViewer,
    targetStaffId: string,
    data: UpdateSaleCsTeamProfileDto,
  ): Promise<SaleCsTeamMemberDto> {
    const headStaffId = await this.resolveHead(viewer);
    const target = await this.findTarget(targetStaffId);
    assertSaleCsHeadCanEditProfile({
      actorStaffId: headStaffId,
      targetStaffId: target.id,
      targetRoles: target.roles,
      targetIsAdminAccount: target.user?.roleType === UserRole.admin,
    });

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
    if (!touchesUser && Object.keys(staffData).length === 0) {
      return this.getMember(viewer, target.id);
    }

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
        description: 'Trưởng phòng Sale & CSKH sửa hồ sơ chuyên môn',
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
          university: university !== undefined ? university : target.university,
          highSchool: highSchool !== undefined ? highSchool : target.highSchool,
        },
      });
    });

    this.invalidateAuth(target.userId);
    return this.getMember(viewer, target.id);
  }

  /**
   * Đổi ảnh đại diện của nhân sự dưới cấp — cùng phạm vi sửa hồ sơ chuyên môn
   * (thành viên đội, không phải mình / Admin / trưởng). Lưu bản gốc + bản
   * watermark như Trưởng ban Đào tạo, ghi lịch sử thao tác.
   */
  async uploadAvatar(
    viewer: SaleCsTeamViewer,
    targetStaffId: string,
    file: UploadableFile | undefined,
  ): Promise<SaleCsTeamMemberDetailDto> {
    const headStaffId = await this.resolveHead(viewer);
    const target = await this.findTarget(targetStaffId);
    assertSaleCsHeadCanEditProfile({
      actorStaffId: headStaffId,
      targetStaffId: target.id,
      targetRoles: target.roles,
      targetIsAdminAccount: target.user?.roleType === UserRole.admin,
    });
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
        description: 'Trưởng phòng Sale & CSKH đổi ảnh đại diện nhân sự',
        beforeValue: {
          avatarPath: target.user?.avatarPath ?? null,
          avatarWatermarkedPath: target.user?.avatarWatermarkedPath ?? null,
        },
        afterValue: { avatarPath, avatarWatermarkedPath },
      });
    });

    this.invalidateAuth(userId);
    return this.getMember(viewer, target.id);
  }

  private async assertTeamMember(staffId: string) {
    const member = await this.prisma.staffInfo.findFirst({
      where: { ...TEAM_MEMBER_WHERE, id: staffId },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('Không tìm thấy thành viên đội Sale & CSKH.');
    }
  }

  private async findTarget(staffId: string): Promise<TargetRow> {
    const target = await this.prisma.staffInfo.findUnique({
      where: { id: staffId },
      select: TARGET_SELECT,
    });
    if (!target) {
      throw new NotFoundException('Không tìm thấy nhân sự.');
    }
    return target;
  }

  private invalidateAuth(userId: string | null | undefined) {
    if (userId) {
      this.authIdentityCacheService.invalidateUser(userId);
    }
  }

  private async toMember(
    row: MemberRow,
    headStaffId: string,
  ): Promise<SaleCsTeamMemberDto> {
    const { user } = row;
    const policyTarget = {
      actorStaffId: headStaffId,
      targetStaffId: row.id,
      targetRoles: row.roles,
      targetIsAdminAccount: user?.roleType === UserRole.admin,
    };
    const isCustomerCare = row.roles.includes(StaffRole.customer_care);
    return {
      id: row.id,
      fullName: getPreferredUserFullName(user) ?? '',
      lastName: user?.last_name ?? null,
      firstName: user?.first_name ?? null,
      avatarUrl: await createSignedStorageUrl({
        bucket: AVATAR_STORAGE_BUCKET,
        path: user?.avatarPath,
        expiresIn: AVATAR_SIGNED_URL_TTL_SECONDS,
      }),
      roles: row.roles,
      status: row.status,
      accountLocked: user ? user.status === UserStatus.inactive : null,
      university: row.university,
      highSchool: row.highSchool,
      customerCareDefaultProfitPercent: isCustomerCare
        ? Number(row.customerCareDefaultProfitPercent)
        : null,
      managedBy: row.customerCareManagedBy
        ? {
            id: row.customerCareManagedBy.id,
            fullName:
              getPreferredUserFullName(row.customerCareManagedBy.user) ?? '',
          }
        : null,
      customerCareStudentCount: row._count.customerCareServices,
      province: user?.province ?? null,
      achievementCount: row._count.achievements ?? 0,
      permissions: {
        canEditRoles: canSaleCsHeadEditRoles(policyTarget),
        canLockAccount: user != null && canSaleCsHeadLockAccount(policyTarget),
        canEditProfile: canSaleCsHeadEditProfile(policyTarget),
        canEditAchievements: canSaleCsHeadEditAchievements(policyTarget),
        canEditAccountHandle:
          user != null && canSaleCsHeadChangeAccountHandle(policyTarget),
      },
    };
  }
}

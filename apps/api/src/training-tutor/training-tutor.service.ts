import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/client';
import { ClassStatus, StaffRole, StaffStatus, UserRole } from 'generated/enums';
import { AchievementService } from 'src/achievements/achievement.service';
import type { JwtPayload } from 'src/auth/decorators/current-user.decorator';
import { getPreferredUserFullName } from 'src/common/user-name.util';
import type { PaginationQueryDto } from 'src/dtos/pagination.dto';
import type {
  TrainingTutorClassDto,
  TrainingTutorDetailDto,
  TrainingTutorListQueryDto,
  TrainingTutorPageDto,
  TrainingTutorSessionDto,
  TrainingTutorSummaryDto,
} from 'src/dtos/training-tutor.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { buildNameSearchWhere } from 'src/staff/staff-name-search';
import { AVATAR_STORAGE_BUCKET } from 'src/storage/media-buckets';
import { createSignedStorageUrl } from 'src/storage/supabase-storage';

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
  university: true,
  highSchool: true,
  user: {
    select: {
      first_name: true,
      last_name: true,
      accountHandle: true,
      email: true,
      phone: true,
      avatarPath: true,
    },
  },
  _count: { select: { achievements: true } },
} satisfies Prisma.StaffInfoSelect;

type TutorSummaryRow = Prisma.StaffInfoGetPayload<{
  select: typeof TUTOR_SUMMARY_SELECT;
}>;

const TUTOR_WHERE = {
  roles: { has: StaffRole.teacher },
} satisfies Prisma.StaffInfoWhereInput;

/** Người xem lấy thẳng từ JWT (`id`, `roleType`). */
export type TrainingTutorViewer = Pick<JwtPayload, 'id' | 'roleType'>;

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
  ) {}

  /** Admin, hoặc staff có role `training` đang active (Ban Đào Tạo). */
  async assertTrainingViewer(viewer: TrainingTutorViewer) {
    if (viewer.roleType === UserRole.admin) return;

    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId: viewer.id },
      select: { roles: true, status: true },
    });

    if (
      !staff ||
      staff.status !== StaffStatus.active ||
      !staff.roles.includes(StaffRole.training)
    ) {
      throw new ForbiddenException(
        'Chỉ Ban Đào Tạo mới được xem hồ sơ gia sư.',
      );
    }
  }

  async listTutors(
    viewer: TrainingTutorViewer,
    query: TrainingTutorListQueryDto,
  ): Promise<TrainingTutorPageDto<TrainingTutorSummaryDto>> {
    await this.assertTrainingViewer(viewer);
    const { page, limit, skip } = clampPaging(query);
    const where: Prisma.StaffInfoWhereInput = {
      ...TUTOR_WHERE,
      ...(query.status ? { status: query.status } : {}),
      ...buildNameSearchWhere(query.search),
    };

    const [total, rows] = await Promise.all([
      this.prisma.staffInfo.count({ where }),
      this.prisma.staffInfo.findMany({
        where,
        select: TUTOR_SUMMARY_SELECT,
        orderBy: [{ status: 'asc' }, { user: { first_name: 'asc' } }],
        skip,
        take: limit,
      }),
    ]);

    return {
      data: await Promise.all(rows.map((row) => this.toSummary(row))),
      meta: { total, page, limit },
    };
  }

  async getTutor(
    viewer: TrainingTutorViewer,
    staffId: string,
  ): Promise<TrainingTutorDetailDto> {
    await this.assertTrainingViewer(viewer);

    const row = await this.prisma.staffInfo.findFirst({
      where: { ...TUTOR_WHERE, id: staffId },
      select: {
        ...TUTOR_SUMMARY_SELECT,
        classTeachers: {
          select: {
            status: true,
            class: { select: { id: true, name: true, status: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { achievements: true, sessions: true } },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy gia sư.');

    const currentClasses: TrainingTutorClassDto[] = [];
    const pastClasses: TrainingTutorClassDto[] = [];
    for (const assignment of row.classTeachers) {
      const target = { id: assignment.class.id, name: assignment.class.name };
      // Đang dạy: phân công còn active (null coi như active) trên lớp đang chạy.
      const isCurrent =
        (assignment.status === null || assignment.status === 'active') &&
        assignment.class.status === ClassStatus.running;
      (isCurrent ? currentClasses : pastClasses).push(target);
    }

    return {
      ...(await this.toSummary(row)),
      currentClasses,
      pastClasses,
      taughtSessionCount: row._count.sessions,
    };
  }

  async listTutorSessions(
    viewer: TrainingTutorViewer,
    staffId: string,
    query: PaginationQueryDto,
  ): Promise<TrainingTutorPageDto<TrainingTutorSessionDto>> {
    await this.assertTrainingViewer(viewer);
    await this.assertTutorExists(staffId);
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
    await this.assertTrainingViewer(viewer);
    await this.assertTutorExists(staffId);
    return this.achievementService.listStaffAchievements(staffId);
  }

  private async assertTutorExists(staffId: string) {
    const tutor = await this.prisma.staffInfo.findFirst({
      where: { ...TUTOR_WHERE, id: staffId },
      select: { id: true },
    });
    if (!tutor) throw new NotFoundException('Không tìm thấy gia sư.');
  }

  private async toSummary(
    row: TutorSummaryRow,
  ): Promise<TrainingTutorSummaryDto> {
    const { user } = row;
    return {
      id: row.id,
      fullName: getPreferredUserFullName(user) ?? '',
      status: row.status,
      email: user?.email ?? null,
      phone: user?.phone ?? null,
      avatarUrl: await createSignedStorageUrl({
        bucket: AVATAR_STORAGE_BUCKET,
        path: user?.avatarPath,
        expiresIn: AVATAR_SIGNED_URL_TTL_SECONDS,
      }),
      university: row.university,
      highSchool: row.highSchool,
      achievementCount: row._count.achievements,
    };
  }
}

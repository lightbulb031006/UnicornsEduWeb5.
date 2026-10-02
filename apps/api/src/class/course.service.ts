import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { getPreferredUserFullName } from 'src/common/user-name.util';
import {
  AssignCourseLessonPlanMembersDto,
  CreateCourseDifficultyLevelDto,
  CreateCourseDto,
  ReorderCourseDifficultyLevelsDto,
  UpdateCourseDifficultyLevelDto,
  UpdateCourseDto,
} from 'src/dtos/course.dto';
import { CourseAccessService, type CourseActor } from './course-access.service';

const lessonPlanMemberInclude = {
  staff: {
    select: {
      id: true,
      roles: true,
      status: true,
      user: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          accountHandle: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.CourseLessonPlanMemberInclude;

type LessonPlanMemberRow = Prisma.CourseLessonPlanMemberGetPayload<{
  include: typeof lessonPlanMemberInclude;
}>;

function toLessonPlanMember(member: LessonPlanMemberRow) {
  return {
    id: member.id,
    courseId: member.courseId,
    staff: {
      id: member.staff.id,
      fullName: getPreferredUserFullName(member.staff.user) ?? '',
      roles: member.staff.roles,
      status: member.staff.status,
    },
  };
}

@Injectable()
export class CourseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessService,
  ) {}

  async list(
    includeInactive = false,
    listableCourseIds: string[] | null = null,
  ) {
    if (listableCourseIds && listableCourseIds.length === 0) {
      return [];
    }
    return this.prisma.course.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(listableCourseIds ? { id: { in: listableCourseIds } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            classes: true,
            lessonPlanMembers: true,
            difficultyLevels: { where: { isActive: true } },
          },
        },
      },
    });
  }

  async getDetail(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        _count: { select: { classes: true } },
        difficultyLevels: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
        lessonPlanMembers: {
          orderBy: { createdAt: 'asc' },
          include: lessonPlanMemberInclude,
        },
      },
    });
    if (!course) {
      throw new NotFoundException('Không tìm thấy khoá học.');
    }
    return {
      ...course,
      lessonPlanMembers: course.lessonPlanMembers.map(toLessonPlanMember),
    };
  }

  async create(dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: {
        name: dto.name,
        defaultDurationDays: dto.default_duration_days ?? null,
        sortOrder: dto.sort_order ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdateCourseDto) {
    const existing = await this.prisma.course.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy khoá học.');
    }

    return this.prisma.course.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.default_duration_days !== undefined
          ? { defaultDurationDays: dto.default_duration_days }
          : {}),
        ...(dto.sort_order !== undefined ? { sortOrder: dto.sort_order } : {}),
        ...(dto.is_active !== undefined ? { isActive: dto.is_active } : {}),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.course.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy khoá học.');
    }

    const classCount = await this.prisma.class.count({
      where: { courseId: id },
    });
    if (classCount > 0) {
      throw new BadRequestException(
        `Không thể xoá: còn ${classCount} lớp đang dùng khoá học này. Hãy chuyển lớp sang khoá khác hoặc chỉ ẩn (is_active=false) khoá học này.`,
      );
    }

    await this.prisma.course.delete({ where: { id } });
    return { success: true };
  }

  // ── Difficulty levels ──

  async listDifficultyLevels(courseId: string, includeInactive = false) {
    await this.courseAccess.assertCourseExists(courseId);
    return this.prisma.courseDifficultyLevel.findMany({
      where: { courseId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createDifficultyLevel(
    actor: CourseActor,
    courseId: string,
    dto: CreateCourseDifficultyLevelDto,
  ) {
    await this.courseAccess.assertCourseExists(courseId);
    await this.courseAccess.assertCanManageCourse(actor, courseId);

    const name = dto.name.trim();
    const existing = await this.prisma.courseDifficultyLevel.findUnique({
      where: { courseId_name: { courseId, name } },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(`Khoá học đã có mức độ khó "${name}".`);
    }

    return this.prisma.courseDifficultyLevel.create({
      data: {
        courseId,
        name,
        sortOrder: dto.sort_order ?? 0,
      },
    });
  }

  async updateDifficultyLevel(
    actor: CourseActor,
    courseId: string,
    levelId: string,
    dto: UpdateCourseDifficultyLevelDto,
  ) {
    await this.courseAccess.assertCourseExists(courseId);
    await this.courseAccess.assertCanManageCourse(actor, courseId);
    const level = await this.findDifficultyLevelOrThrow(courseId, levelId);

    const nextName = dto.name !== undefined ? dto.name.trim() : level.name;
    if (nextName !== level.name) {
      const existing = await this.prisma.courseDifficultyLevel.findUnique({
        where: { courseId_name: { courseId, name: nextName } },
        select: { id: true },
      });
      if (existing && existing.id !== levelId) {
        throw new BadRequestException(
          `Khoá học đã có mức độ khó "${nextName}".`,
        );
      }
    }

    return this.prisma.courseDifficultyLevel.update({
      where: { id: levelId },
      data: {
        ...(dto.name !== undefined ? { name: nextName } : {}),
        ...(dto.sort_order !== undefined ? { sortOrder: dto.sort_order } : {}),
        ...(dto.is_active !== undefined ? { isActive: dto.is_active } : {}),
      },
    });
  }

  async removeDifficultyLevel(
    actor: CourseActor,
    courseId: string,
    levelId: string,
  ) {
    await this.courseAccess.assertCourseExists(courseId);
    await this.courseAccess.assertCanManageCourse(actor, courseId);
    await this.findDifficultyLevelOrThrow(courseId, levelId);
    await this.prisma.courseDifficultyLevel.delete({ where: { id: levelId } });
    return { success: true };
  }

  async reorderDifficultyLevels(
    actor: CourseActor,
    courseId: string,
    dto: ReorderCourseDifficultyLevelsDto,
  ) {
    await this.courseAccess.assertCourseExists(courseId);
    await this.courseAccess.assertCanManageCourse(actor, courseId);

    await this.prisma.$transaction(
      dto.levels.map((item, index) =>
        this.prisma.courseDifficultyLevel.updateMany({
          where: { id: item.id, courseId },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.prisma.courseDifficultyLevel.findMany({
      where: { courseId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  // ── Lesson plan members ──

  async listLessonPlanMembers(courseId: string) {
    await this.courseAccess.assertCourseExists(courseId);
    const members = await this.prisma.courseLessonPlanMember.findMany({
      where: { courseId },
      orderBy: { createdAt: 'asc' },
      include: lessonPlanMemberInclude,
    });
    return members.map(toLessonPlanMember);
  }

  async assignLessonPlanMembers(
    actor: CourseActor,
    courseId: string,
    dto: AssignCourseLessonPlanMembersDto,
  ) {
    await this.courseAccess.assertCourseExists(courseId);
    await this.courseAccess.assertCanManageCourse(actor, courseId);

    const staffIds = [...new Set(dto.staff_ids)];

    // Chỉ gán được nhân sự active có vai trò thuộc đội giáo án.
    const validStaff = await this.prisma.staffInfo.findMany({
      where: {
        id: { in: staffIds },
        status: 'active',
        roles: { hasSome: ['lesson_plan', 'lesson_plan_head'] },
      },
      select: { id: true },
    });
    const validIdSet = new Set(validStaff.map((s) => s.id));
    const invalidIds = staffIds.filter((id) => !validIdSet.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Không thể gán: ${invalidIds.length} nhân sự không tồn tại, đang ngừng hoạt động, hoặc không có vai trò đội giáo án (lesson_plan/lesson_plan_head).`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.courseLessonPlanMember.deleteMany({ where: { courseId } }),
      ...(validIdSet.size > 0
        ? validStaff.map((s) =>
            this.prisma.courseLessonPlanMember.create({
              data: { courseId, staffId: s.id },
            }),
          )
        : []),
    ]);

    return this.listLessonPlanMembers(courseId);
  }

  // ── helpers ──

  /** Tìm nhân sự active có vai trò lesson_plan/lesson_plan_head — dùng cho picker gán đội giáo án. */
  async searchLessonPlanStaff(search?: string, limit = 100) {
    const trimmed = search?.trim();
    const safeLimit =
      Number.isInteger(limit) && limit >= 1 ? Math.min(limit, 200) : 100;

    const rows = await this.prisma.staffInfo.findMany({
      where: {
        status: 'active',
        roles: { hasSome: ['lesson_plan', 'lesson_plan_head'] },
        ...(trimmed
          ? {
              user: {
                OR: [
                  { first_name: { contains: trimmed, mode: 'insensitive' } },
                  { last_name: { contains: trimmed, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      select: {
        id: true,
        roles: true,
        user: {
          select: {
            first_name: true,
            last_name: true,
            accountHandle: true,
            email: true,
          },
        },
      },
      orderBy: [
        { user: { first_name: 'asc' } },
        { user: { last_name: 'asc' } },
      ],
      take: safeLimit,
    });

    return rows.map(({ user, ...staff }) => ({
      ...staff,
      fullName: getPreferredUserFullName(user) ?? '',
    }));
  }

  private async findDifficultyLevelOrThrow(courseId: string, levelId: string) {
    const level = await this.prisma.courseDifficultyLevel.findFirst({
      where: { id: levelId, courseId },
    });
    if (!level) {
      throw new NotFoundException('Không tìm thấy mức độ khó.');
    }
    return level;
  }
}

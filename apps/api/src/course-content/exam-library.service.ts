import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';

import { ActionHistoryService } from 'src/action-history/action-history.service';

import { CourseAccessService } from 'src/class/course-access.service';

import {
  LessonCreateDto,
  LessonUpdateDto,
  LessonResponseDto,
  ExamLibraryItemDto,
} from 'src/dtos/course-content.dto';

import { LessonKind } from 'generated/enums';

import {
  ActionHistoryActor,
  CourseContentSupportService,
} from './course-content-support.service';

import { CourseLessonService } from './course-lesson.service';

@Injectable()
export class ExamLibraryService extends CourseContentSupportService {
  protected readonly logger = new Logger(ExamLibraryService.name);

  constructor(
    prisma: PrismaService,
    actionHistory: ActionHistoryService,
    courseAccess: CourseAccessService,
    private readonly lessons: CourseLessonService,
  ) {
    super(prisma, actionHistory, courseAccess);
  }

  // ─── Exam Library (practice lessons của khoá, nằm trong chuyên đề) ───
  //
  // Đề thi là `Lesson(kind = practice)` thuộc một chuyên đề của khoá — CHECK
  // constraint `lessons_owner_check` không cho tiết cấp khoá đứng ngoài chuyên đề.
  // Thư viện gom đề của mọi chương lại một chỗ để quản lý tập trung.

  async getExamLibrary(
    courseId: string,
    params: {
      search?: string;
      moduleId?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{
    data: ExamLibraryItemDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    await this.validateCourseExists(courseId);
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const where = {
      courseId,
      kind: LessonKind.practice,
      ...(params.moduleId ? { moduleId: params.moduleId } : {}),
      ...(params.search
        ? { title: { contains: params.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.lesson.findMany({
        where,
        include: {
          module: { select: { id: true, title: true, sortOrder: true } },
          _count: { select: { questionLinks: true } },
        },
        orderBy: [
          { module: { sortOrder: 'asc' } },
          { order: 'asc' },
          { title: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lesson.count({ where }),
    ]);

    const data: ExamLibraryItemDto[] = rows.map(
      ({ _count, module, ...lesson }) => ({
        ...lesson,
        module,
        questionCount: _count.questionLinks,
      }),
    );

    return { data, total, page, limit };
  }

  async createExamLesson(
    courseId: string,
    dto: LessonCreateDto,
    actor: ActionHistoryActor,
  ): Promise<LessonResponseDto> {
    // Kiểm quyền trước khi soi payload: người không thuộc đội giáo án phải nhận
    // 403, không phải 400 tiết lộ hình dạng dữ liệu hợp lệ.
    await this.validateCourseExists(courseId);
    await this.assertCanManageCourseContent(actor, courseId);

    if (!dto.moduleId) {
      throw new BadRequestException(
        'Đề thi phải thuộc một chuyên đề của khoá học.',
      );
    }
    const courseModule = await this.validateModuleExists(dto.moduleId);
    if (courseModule.courseId !== courseId) {
      throw new BadRequestException('Chuyên đề không thuộc khoá học này.');
    }

    return this.lessons.createLesson(
      {
        kind: LessonKind.practice,
        courseId,
        moduleId: dto.moduleId,
        classId: null,
        title: dto.title,
      },
      actor,
    );
  }

  async updateExamLesson(
    courseId: string,
    lessonId: string,
    dto: LessonUpdateDto,
    actor: ActionHistoryActor,
  ): Promise<LessonResponseDto> {
    await this.assertIsExamLesson(courseId, lessonId, 'chỉnh sửa');
    return this.lessons.updateLesson(lessonId, dto, actor);
  }

  async deleteExamLesson(
    courseId: string,
    lessonId: string,
    actor: ActionHistoryActor,
  ): Promise<void> {
    await this.assertIsExamLesson(courseId, lessonId, 'xóa');
    return this.lessons.deleteLesson(lessonId, actor);
  }

  private async assertIsExamLesson(
    courseId: string,
    lessonId: string,
    action: string,
  ): Promise<void> {
    const existing = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!existing) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }
    if (
      existing.kind !== LessonKind.practice ||
      existing.courseId !== courseId
    ) {
      throw new BadRequestException(
        `Chỉ đề thi trong thư viện mới ${action} được`,
      );
    }
  }

  async reorderExamLessons(
    courseId: string,
    lessonIds: string[],
    actor: ActionHistoryActor,
  ): Promise<void> {
    await this.validateCourseExists(courseId);
    await this.assertCanManageCourseContent(actor, courseId);

    const updates = lessonIds.map((id, index) =>
      this.prisma.lesson.update({
        where: { id, courseId, kind: LessonKind.practice },
        data: { order: index },
      }),
    );

    await this.prisma.$transaction(updates);
  }
}

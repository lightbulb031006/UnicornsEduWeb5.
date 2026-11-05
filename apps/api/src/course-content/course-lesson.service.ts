import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LessonKind } from 'generated/enums';
import { redactLessonVideo } from 'src/protected-video/redact-video-url';
import {
  LessonCreateDto,
  LessonUpdateDto,
  LessonResponseDto,
} from 'src/dtos/course-content.dto';
import {
  ActionHistoryActor,
  ARCHIVED_LESSON_READ_ONLY_MESSAGE,
  CourseContentSupportService,
} from './course-content-support.service';

@Injectable()
export class CourseLessonService extends CourseContentSupportService {
  protected readonly logger = new Logger(CourseLessonService.name);

  async createLesson(
    dto: LessonCreateDto,
    actor: ActionHistoryActor,
  ): Promise<LessonResponseDto> {
    await this.validateLessonOwnership(dto);
    const durationMinutes = this.resolveCreateDurationMinutes(dto);

    if (dto.courseId) {
      await this.validateCourseExists(dto.courseId);
      await this.assertCanManageCourseContent(actor, dto.courseId);
      if (dto.moduleId) {
        await this.validateModuleExists(dto.moduleId);
      }
    }

    if (dto.classId) {
      await this.validateClassExists(dto.classId);
      await this.validateStaffClassAccess(dto.classId, actor);
    }

    // Tiết mới không tự hiện trên lớp nào: nội dung lớp là tập tiết gia sư đã thêm
    // (ADR 2026-10-18-class-content-as-lesson-set).
    const lesson = await this.prisma.lesson.create({
      data: {
        kind: dto.kind,
        courseId: dto.courseId ?? null,
        moduleId: dto.moduleId ?? null,
        classId: dto.classId ?? null,
        title: dto.title,
        videoUrl: dto.videoUrl ?? null,
        content: dto.content ?? null,
        durationMinutes,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    this.logger.log(
      `Lesson created: ${lesson.id} (${dto.kind}) by ${actor.userEmail}`,
    );
    this.protectedVideos?.track(lesson.videoUrl);

    return lesson;
  }

  /** Tiết thực hành bắt buộc có thời lượng; tiết lý thuyết không lưu thời lượng. */
  private resolveCreateDurationMinutes(dto: LessonCreateDto): number | null {
    if (dto.kind !== LessonKind.practice) return null;
    if (dto.durationMinutes == null) {
      throw new BadRequestException(
        'Tiết thực hành phải đặt thời lượng làm bài (phút).',
      );
    }
    return dto.durationMinutes;
  }

  async updateLesson(
    lessonId: string,
    dto: LessonUpdateDto,
    actor: ActionHistoryActor,
  ): Promise<LessonResponseDto> {
    const existing = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!existing) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }
    if (existing.archivedAt) {
      throw new BadRequestException(ARCHIVED_LESSON_READ_ONLY_MESSAGE);
    }

    if (existing.classId) {
      await this.validateStaffClassAccess(existing.classId, actor);
    } else if (existing.courseId) {
      await this.assertCanManageCourseContent(actor, existing.courseId);
    }

    const nextVideo =
      dto.videoUrl !== undefined ? dto.videoUrl : existing.videoUrl;
    const nextContent =
      dto.content !== undefined ? dto.content : existing.content;
    this.assertPracticeHasNoMedia(existing.kind, nextVideo, nextContent);
    if (
      dto.durationMinutes !== undefined &&
      existing.kind !== LessonKind.practice
    ) {
      throw new BadRequestException(
        'Chỉ tiết thực hành có thời lượng làm bài.',
      );
    }

    const lesson = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.videoUrl !== undefined && { videoUrl: dto.videoUrl }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.elective1Name !== undefined && {
          elective1Name: dto.elective1Name?.trim() || null,
        }),
        ...(dto.elective2Name !== undefined && {
          elective2Name: dto.elective2Name?.trim() || null,
        }),
        // Lượt đang làm giữ snapshot `attempts.duration_minutes`; lượt mới đọc giá trị này.
        ...(dto.durationMinutes !== undefined && {
          durationMinutes: dto.durationMinutes,
        }),
        updatedBy: actor.userId,
      },
    });

    this.logger.log(`Lesson updated: ${lessonId} by ${actor.userEmail}`);
    if (dto.videoUrl !== undefined && dto.videoUrl !== existing.videoUrl) {
      this.protectedVideos?.track(lesson.videoUrl);
    }
    return lesson;
  }

  async deleteLesson(
    lessonId: string,
    actor: ActionHistoryActor,
  ): Promise<void> {
    const existing = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!existing) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }
    if (existing.archivedAt) {
      throw new BadRequestException(ARCHIVED_LESSON_READ_ONLY_MESSAGE);
    }

    if (existing.classId) {
      await this.validateStaffClassAccess(existing.classId, actor);
    } else if (existing.courseId) {
      await this.assertCanManageCourseContent(actor, existing.courseId);
    }

    // Tiết thực hành còn lần giao (kể cả đang ẩn) → 409 để không mất bài làm.
    // Tiết lý thuyết gỡ khỏi chuyên đề thì mất khỏi mọi lớp: xoá item lớp (lượt xem + timeline cascade).
    if (existing.kind === LessonKind.practice) {
      await this.assertLessonsNotUsedByClasses([lessonId], 'Tiết học');
    }

    await this.prisma.$transaction([
      this.prisma.classContentItem.deleteMany({ where: { lessonId } }),
      this.prisma.lesson.delete({ where: { id: lessonId } }),
    ]);
    this.logger.log(`Lesson deleted: ${lessonId} by ${actor.userEmail}`);
  }

  async getLessonsByCourseId(
    courseId: string,
    moduleId?: string,
  ): Promise<LessonResponseDto[]> {
    await this.validateCourseExists(courseId);

    const lessons = await this.prisma.lesson.findMany({
      where: {
        courseId,
        ...(moduleId ? { moduleId } : { moduleId: null }),
      },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { quizzes: true, questionLinks: true } },
      },
    });
    return lessons.map(({ _count, ...lesson }) => ({
      ...lesson,
      quizCount: _count.quizzes,
      questionCount: _count.questionLinks,
    }));
  }

  async getLessonsByClassId(
    classId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    data: LessonResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    await this.validateClassExists(classId);

    const [data, total] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { classId },
        orderBy: { order: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lesson.count({ where: { classId } }),
    ]);

    return { data, total, page, limit };
  }

  async getLessonById(lessonId: string): Promise<LessonResponseDto> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }
    return lesson;
  }

  async getCourseLesson(
    courseId: string,
    moduleId: string,
    lessonId: string,
  ): Promise<LessonResponseDto> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, courseId, moduleId },
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }
    return lesson;
  }

  async getLessonsForStudent(
    classId: string,
    studentId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    data: LessonResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    await this.validateClassExists(classId);
    await this.validateStudentClassAccess(classId, studentId);

    const [data, total] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { classId },
        orderBy: { order: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lesson.count({ where: { classId } }),
    ]);

    return { data: data.map(redactLessonVideo), total, page, limit };
  }

  async reorderLessons(
    lessonIds: string[],
    opts: { moduleId?: string; classId?: string },
    actor: ActionHistoryActor,
  ): Promise<void> {
    if (opts.moduleId) {
      const courseModule = await this.validateModuleExists(opts.moduleId);
      await this.assertCanManageCourseContent(actor, courseModule.courseId);
    }
    if (opts.classId) {
      await this.validateClassExists(opts.classId);
      await this.validateStaffClassAccess(opts.classId, actor);
    }

    const updates = lessonIds.map((id, index) =>
      this.prisma.lesson.update({
        where: {
          id,
          ...(opts.moduleId ? { moduleId: opts.moduleId } : {}),
          ...(opts.classId ? { classId: opts.classId } : {}),
        },
        data: { order: index },
      }),
    );

    await this.prisma.$transaction(updates);
  }
}

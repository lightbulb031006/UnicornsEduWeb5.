import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LessonKind } from 'generated/enums';
import {
  ModuleCreateDto,
  ModuleUpdateDto,
  ModuleResponseDto,
} from 'src/dtos/course-content.dto';
import {
  ActionHistoryActor,
  CourseContentSupportService,
} from './course-content-support.service';

@Injectable()
export class CourseModuleService extends CourseContentSupportService {
  protected readonly logger = new Logger(CourseModuleService.name);

  async createModule(
    dto: ModuleCreateDto & { courseId: string },
    actor: ActionHistoryActor,
  ): Promise<ModuleResponseDto> {
    await this.validateCourseExists(dto.courseId);
    await this.assertCanManageCourseContent(actor, dto.courseId);

    const courseModule = await this.prisma.module.create({
      data: {
        courseId: dto.courseId,
        title: dto.title,
      },
    });

    this.logger.log(
      `Module created: ${courseModule.id} for course ${dto.courseId} by ${actor.userEmail}`,
    );

    return courseModule;
  }

  async updateModule(
    moduleId: string,
    dto: ModuleUpdateDto,
    actor: ActionHistoryActor,
  ): Promise<ModuleResponseDto> {
    const existing = await this.prisma.module.findUnique({
      where: { id: moduleId },
    });
    if (!existing) {
      throw new NotFoundException(`Module ${moduleId} not found`);
    }
    await this.assertCanManageCourseContent(actor, existing.courseId);

    const courseModule = await this.prisma.module.update({
      where: { id: moduleId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
      },
    });

    this.logger.log(`Module updated: ${moduleId} by ${actor.userEmail}`);
    return courseModule;
  }

  async deleteModule(
    moduleId: string,
    actor: ActionHistoryActor,
  ): Promise<void> {
    const existing = await this.prisma.module.findUnique({
      where: { id: moduleId },
    });
    if (!existing) {
      throw new NotFoundException(`Module ${moduleId} not found`);
    }
    await this.assertCanManageCourseContent(actor, existing.courseId);

    const moduleLessons = await this.prisma.lesson.findMany({
      where: { moduleId },
      select: { id: true, kind: true },
    });
    // Chặn khi còn lần giao tiết thực hành; tiết lý thuyết trên lớp mất theo chuyên đề.
    await this.assertLessonsNotUsedByClasses(
      moduleLessons
        .filter((lesson) => lesson.kind === LessonKind.practice)
        .map((lesson) => lesson.id),
      'Chuyên đề',
    );

    await this.prisma.$transaction([
      this.prisma.classContentItem.deleteMany({
        where: { lessonId: { in: moduleLessons.map((lesson) => lesson.id) } },
      }),
      this.prisma.module.delete({ where: { id: moduleId } }),
    ]);
    this.logger.log(`Module deleted: ${moduleId} by ${actor.userEmail}`);
  }

  async getModulesByCourseId(courseId: string): Promise<ModuleResponseDto[]> {
    await this.validateCourseExists(courseId);

    const modules = await this.prisma.module.findMany({
      where: { courseId },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { lessons: true } } },
    });
    return modules.map(({ _count, ...courseModule }) => ({
      ...courseModule,
      lessonCount: _count.lessons,
    }));
  }

  async getModuleById(moduleId: string): Promise<ModuleResponseDto> {
    const courseModule = await this.prisma.module.findUnique({
      where: { id: moduleId },
    });
    if (!courseModule) {
      throw new NotFoundException(`Module ${moduleId} not found`);
    }
    return courseModule;
  }

  async reorderModules(
    courseId: string,
    moduleIds: string[],
    actor: ActionHistoryActor,
  ): Promise<void> {
    await this.validateCourseExists(courseId);
    await this.assertCanManageCourseContent(actor, courseId);

    const updates = moduleIds.map((id, index) =>
      this.prisma.module.update({
        where: { id, courseId },
        data: { sortOrder: index },
      }),
    );

    await this.prisma.$transaction(updates);
  }
}

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LessonKind } from 'generated/enums';
import {
  ClassModuleRemovalImpactDto,
  ClassModuleResponseDto,
} from 'src/dtos/course-content.dto';
import {
  ensureClassModuleGroupOnTop,
  removeClassModuleItems,
  restoreClassModuleItems,
  syncClassModuleLessons,
} from './class-course-module-sync';
import {
  ActionHistoryActor,
  CourseContentSupportService,
} from './course-content-support.service';

const CLASS_MODULE_TRANSACTION_TIMEOUT_MS = 30_000;

/**
 * Thêm/gỡ cả chuyên đề của khoá vào lớp. Thêm chuyên đề chép một lần mọi tiết đang có
 * (lý thuyết + lần giao thực hành); tiết khoá thêm về sau không tự vào lớp.
 * Thứ tự nhóm chuyên đề là của riêng lớp (`class_modules.sort_order`).
 * ADR: docs/adr/2026-10-18-class-content-as-lesson-set.md,
 * docs/adr/2026-10-05-class-module-order-and-removal.md.
 */
@Injectable()
export class ClassCourseModuleService extends CourseContentSupportService {
  protected readonly logger = new Logger(ClassCourseModuleService.name);

  async listClassModules(
    classId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassModuleResponseDto[]> {
    await this.validateStaffClassAccess(classId, actor);
    const courseId = await this.findClassCourseId(classId);

    const [modules, added, inClass] = await Promise.all([
      this.prisma.module.findMany({
        where: { courseId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          sortOrder: true,
          lessons: {
            where: { archivedAt: null },
            select: { id: true, kind: true },
          },
        },
      }),
      this.prisma.classModule.findMany({
        where: { classId },
        select: { moduleId: true, createdAt: true, sortOrder: true },
      }),
      // Tiết lớp đang có (kể cả Ẩn tay), không tính tiết đã gỡ.
      this.prisma.classContentItem.findMany({
        where: { classId, removedAt: null },
        select: { lessonId: true },
      }),
    ]);
    const addedByModule = new Map(added.map((row) => [row.moduleId, row]));
    const inClassLessonIds = new Set(inClass.map((item) => item.lessonId));

    return modules.map((courseModule) => {
      const classModule = addedByModule.get(courseModule.id);
      const addedAt = classModule?.createdAt ?? null;
      return {
        moduleId: courseModule.id,
        title: courseModule.title,
        sortOrder: courseModule.sortOrder,
        classSortOrder: classModule?.sortOrder ?? null,
        theoryLessonCount: courseModule.lessons.filter(
          (lesson) => lesson.kind === LessonKind.theory,
        ).length,
        practiceLessonCount: courseModule.lessons.filter(
          (lesson) => lesson.kind === LessonKind.practice,
        ).length,
        inClassLessonCount: courseModule.lessons.filter((lesson) =>
          inClassLessonIds.has(lesson.id),
        ).length,
        added: addedAt != null,
        addedAt,
      };
    });
  }

  async addClassModule(
    classId: string,
    moduleId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassModuleResponseDto[]> {
    await this.validateStaffClassAccess(classId, actor);
    const courseId = await this.findClassCourseId(classId);
    const courseModule = await this.validateModuleExists(moduleId);
    if (courseModule.courseId !== courseId) {
      throw new BadRequestException('Chuyên đề không thuộc khoá của lớp này.');
    }

    const classInfo = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { contentAccessExpiresAt: true },
    });
    const openAt = new Date();

    const result = await this.prisma.$transaction(
      async (tx) => {
        // Lớp đã có nhóm (thêm lẻ tiết trước đó) → giữ vị trí, chỉ bổ sung tiết còn thiếu.
        // Chuyên đề mới vào lớp (kể cả thêm lại sau khi gỡ) lên đầu nhóm.
        await ensureClassModuleGroupOnTop(tx, classId, moduleId);
        // Lần giao thực hành: mở bài lúc thêm, hạn = hạn xem nội dung của lớp.
        const createdItemIds = await syncClassModuleLessons(tx, {
          classId,
          moduleId,
          openAt,
          closeAt: classInfo?.contentAccessExpiresAt ?? null,
        });
        const restoredItemIds = await restoreClassModuleItems(tx, {
          classId,
          moduleId,
        });
        return { createdItemIds, restoredItemIds };
      },
      { timeout: CLASS_MODULE_TRANSACTION_TIMEOUT_MS },
    );

    this.logger.log(
      `Class module added: ${moduleId} to class ${classId} (+${result.createdItemIds.length} lessons, ${result.restoredItemIds.length} restored) by ${actor.userEmail}`,
    );
    return this.listClassModules(classId, actor);
  }

  /**
   * Gỡ chuyên đề = gỡ khỏi lớp mọi tiết của chuyên đề (lý thuyết lẫn lần giao, kể cả tiết
   * đang Ẩn): nhóm và các tiết biến mất ở mọi phía. Bài làm, điểm, lượt xem giữ nguyên.
   */
  async removeClassModule(
    classId: string,
    moduleId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassModuleResponseDto[]> {
    await this.validateStaffClassAccess(classId, actor);
    const hiddenByStaffId = await this.resolveHiddenByStaffId(actor);
    const removedAt = new Date();

    const removedItemIds = await this.prisma.$transaction(
      async (tx) => {
        // deleteMany + count trong transaction: hai lần gỡ đồng thời → lần sau 404, không P2025.
        const { count } = await tx.classModule.deleteMany({
          where: { classId, moduleId },
        });
        if (count === 0) {
          throw new NotFoundException('Lớp chưa thêm chuyên đề này.');
        }
        return removeClassModuleItems(tx, {
          classId,
          moduleId,
          removedAt,
          hiddenByStaffId,
        });
      },
      { timeout: CLASS_MODULE_TRANSACTION_TIMEOUT_MS },
    );

    this.logger.log(
      `Class module removed: ${moduleId} from class ${classId} (${removedItemIds.length} items removed) by ${actor.userEmail}`,
    );
    return this.listClassModules(classId, actor);
  }

  /**
   * Sắp lại nhóm chuyên đề của lớp. `moduleIds` phải gồm đúng mọi chuyên đề lớp đã thêm,
   * mỗi cái một lần. Không đụng `modules.sort_order` (thứ tự cấp khoá).
   */
  async reorderClassModules(
    classId: string,
    moduleIds: string[],
    actor: ActionHistoryActor,
  ): Promise<ClassModuleResponseDto[]> {
    await this.validateStaffClassAccess(classId, actor);
    if (new Set(moduleIds).size !== moduleIds.length) {
      throw new BadRequestException('Danh sách chuyên đề bị trùng.');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const added = await tx.classModule.findMany({
          where: { classId },
          select: { moduleId: true },
        });
        const addedIds = new Set(added.map((row) => row.moduleId));
        if (
          added.length !== moduleIds.length ||
          moduleIds.some((moduleId) => !addedIds.has(moduleId))
        ) {
          throw new BadRequestException(
            'Danh sách chuyên đề không khớp chuyên đề lớp đang có. Tải lại trang rồi thử lại.',
          );
        }
        // Tuần tự trên tx tương tác: Promise.all không an toàn với Prisma interactive transaction.
        for (const [sortOrder, moduleId] of moduleIds.entries()) {
          await tx.classModule.update({
            where: { classId_moduleId: { classId, moduleId } },
            data: { sortOrder },
          });
        }
      },
      { timeout: CLASS_MODULE_TRANSACTION_TIMEOUT_MS },
    );

    this.logger.log(
      `Class modules reordered for class ${classId} (${moduleIds.length}) by ${actor.userEmail}`,
    );
    return this.listClassModules(classId, actor);
  }

  /** Ảnh hưởng nếu gỡ chuyên đề (mọi lần giao còn trong lớp, kể cả đang Ẩn). */
  async getClassModuleRemovalImpact(
    classId: string,
    moduleId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassModuleRemovalImpactDto> {
    await this.validateStaffClassAccess(classId, actor);
    const impact = await this.computeRemovalImpact({
      classId,
      lesson: { is: { moduleId } },
    });
    return { moduleId, ...impact };
  }

  private async findClassCourseId(classId: string): Promise<string> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { courseId: true },
    });
    if (!cls) throw new NotFoundException(`Class ${classId} not found`);
    return cls.courseId;
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AttemptStatus, LessonKind, QuestionType } from 'generated/enums';
import {
  ClassModuleRemovalImpactDto,
  ClassModuleResponseDto,
} from 'src/dtos/course-content.dto';
import {
  hideClassModuleItems,
  restoreClassModuleItems,
  syncClassModuleTheoryLessons,
} from './class-course-module-sync';
import {
  ActionHistoryActor,
  CourseContentSupportService,
} from './course-content-support.service';

const CLASS_MODULE_TRANSACTION_TIMEOUT_MS = 30_000;

/**
 * Nội dung lớp theo Chuyên đề: lớp thêm/gỡ nguyên chuyên đề của khoá. Thêm chuyên đề
 * đưa mọi tiết lý thuyết vào lớp; tiết thực hành giao từng tiết (không đi theo).
 * Thứ tự nhóm chuyên đề là của riêng lớp (`class_modules.sort_order`).
 * ADR: docs/adr/2026-10-02-class-content-by-module.md,
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

    const [modules, added] = await Promise.all([
      this.prisma.module.findMany({
        where: { courseId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          sortOrder: true,
          lessons: {
            where: { archivedAt: null },
            select: { kind: true },
          },
        },
      }),
      this.prisma.classModule.findMany({
        where: { classId },
        select: { moduleId: true, createdAt: true, sortOrder: true },
      }),
    ]);
    const addedByModule = new Map(added.map((row) => [row.moduleId, row]));

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

    const result = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.classModule.findUnique({
          where: { classId_moduleId: { classId, moduleId } },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictException('Lớp đã có chuyên đề này.');
        }
        // Chuyên đề vừa thêm (kể cả thêm lại) lên đầu nhóm của lớp.
        const top = await tx.classModule.aggregate({
          where: { classId },
          _min: { sortOrder: true },
        });
        const sortOrder = (top._min.sortOrder ?? 1) - 1;
        await tx.classModule.create({ data: { classId, moduleId, sortOrder } });
        const createdItemIds = await syncClassModuleTheoryLessons(tx, {
          classId,
          moduleId,
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
      `Class module added: ${moduleId} to class ${classId} (+${result.createdItemIds.length} theory, ${result.restoredItemIds.length} restored) by ${actor.userEmail}`,
    );
    return this.listClassModules(classId, actor);
  }

  /**
   * Gỡ chuyên đề = coi như chưa từng thêm: nhóm biến mất, ẩn mềm tiết lý thuyết lẫn lần giao
   * thực hành của chuyên đề (lý do `module_removed`). Bài làm, điểm, lượt xem giữ nguyên.
   */
  async removeClassModule(
    classId: string,
    moduleId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassModuleResponseDto[]> {
    await this.validateStaffClassAccess(classId, actor);
    const hiddenByStaffId = await this.resolveHiddenByStaffId(actor);
    const hiddenAt = new Date();

    const hiddenItemIds = await this.prisma.$transaction(
      async (tx) => {
        // deleteMany + count trong transaction: hai lần gỡ đồng thời → lần sau 404, không P2025.
        const { count } = await tx.classModule.deleteMany({
          where: { classId, moduleId },
        });
        if (count === 0) {
          throw new NotFoundException('Lớp chưa thêm chuyên đề này.');
        }
        return hideClassModuleItems(tx, {
          classId,
          moduleId,
          hiddenAt,
          hiddenByStaffId,
        });
      },
      { timeout: CLASS_MODULE_TRANSACTION_TIMEOUT_MS },
    );

    this.logger.log(
      `Class module removed: ${moduleId} from class ${classId} (${hiddenItemIds.length} items hidden) by ${actor.userEmail}`,
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

  /**
   * Ảnh hưởng nếu gỡ chuyên đề, tính trên lượt làm mới nhất mỗi học sinh mỗi lần giao đang
   * hiện (giống hàng đợi chấm). Chỉ để cảnh báo; gỡ không bị chặn.
   */
  async getClassModuleRemovalImpact(
    classId: string,
    moduleId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassModuleRemovalImpactDto> {
    await this.validateStaffClassAccess(classId, actor);
    const latestAttempts = await this.prisma.attempt.findMany({
      where: {
        assignment: { classId, hiddenAt: null, lesson: { moduleId } },
      },
      orderBy: [
        { assignmentId: 'asc' },
        { studentId: 'asc' },
        { startedAt: 'desc' },
      ],
      distinct: ['assignmentId', 'studentId'],
      select: {
        studentId: true,
        status: true,
        hasUngradedEssay: true,
        _count: {
          select: {
            answers: {
              where: { type: QuestionType.essay, pointsAwarded: null },
            },
          },
        },
      },
    });

    let ungradedEssayCount = 0;
    const inProgressStudentIds = new Set<string>();
    for (const attempt of latestAttempts) {
      if (attempt.status === AttemptStatus.in_progress) {
        inProgressStudentIds.add(attempt.studentId);
      } else if (attempt.hasUngradedEssay) {
        ungradedEssayCount += attempt._count.answers;
      }
    }

    return {
      moduleId,
      ungradedEssayCount,
      inProgressStudentCount: inProgressStudentIds.size,
    };
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

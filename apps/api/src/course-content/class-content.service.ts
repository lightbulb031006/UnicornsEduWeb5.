import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { redactLessonVideo } from 'src/protected-video/redact-video-url';
import type { ProtectedVideoPlaybackDto } from 'src/dtos/protected-video.dto';
import {
  LessonResponseDto,
  ClassContentCreateDto,
  ClassContentScheduleUpdateDto,
  ClassContentItemRemovalImpactDto,
  ClassContentItemResponseDto,
  ClassContentModuleGroupDto,
  ClassTheoryProgressDto,
  CourseLessonForClassDto,
  TheoryLessonViewResponseDto,
} from 'src/dtos/course-content.dto';
import {
  ClassContentHiddenReason,
  LessonKind,
  ClassTimelineItemKind,
  QuestionType,
  StudentClassStatus,
} from 'generated/enums';
import {
  appendClassTimelineItem,
  syncClassTimelineSortByTime,
} from 'src/class-timeline/append-timeline-item';
import {
  ActionHistoryActor,
  CLASS_OWNED_LESSON_DISABLED_MESSAGE,
  LESSON_NOT_IN_CLASS_COURSE_MESSAGE,
  CourseContentSupportService,
} from './course-content-support.service';
import { isAnswered } from '../attempt/grading';
import { assignmentDurationMinutes } from '../attempt/assignment-window';
import { PRESENT_CONTENT_ITEM } from './archived-lesson-filter';
import { groupClassContentByModule } from './class-content-groups';
import {
  ensureClassModuleGroupOnTop,
  removeClassContentItems,
  restoreRemovedClassContentItems,
} from './class-course-module-sync';

const CLASS_CONTENT_CREATE_TRANSACTION_TIMEOUT_MS = 15_000;

type OrderableClassContentItem = {
  id: string;
  sortOrder: number;
  lesson?: {
    kind: string;
    order: number;
    module?: { id: string; sortOrder: number } | null;
  } | null;
};

/**
 * Thứ tự nội dung lớp: theo chuyên đề (`modules.sort_order`); trong một chuyên đề, tiết lý
 * thuyết theo thứ tự tiết của khoá rồi tới lần giao thực hành theo `sort_order` của lớp.
 * Item không thuộc chuyên đề (tiết riêng lớp đã lưu trữ) xếp cuối.
 */
export function compareClassContentItems(
  a: OrderableClassContentItem,
  b: OrderableClassContentItem,
): number {
  const aModule = a.lesson?.module ?? null;
  const bModule = b.lesson?.module ?? null;
  if (!aModule || !bModule) {
    if (aModule !== bModule) return aModule ? -1 : 1;
    return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
  }
  const byModule =
    aModule.sortOrder - bModule.sortOrder ||
    aModule.id.localeCompare(bModule.id);
  if (byModule !== 0) return byModule;

  const aTheory = a.lesson?.kind === LessonKind.theory;
  const bTheory = b.lesson?.kind === LessonKind.theory;
  if (aTheory !== bTheory) return aTheory ? -1 : 1;
  const byLessonOrder = aTheory ? a.lesson!.order - b.lesson!.order : 0;
  return byLessonOrder || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

@Injectable()
export class ClassContentService extends CourseContentSupportService {
  protected readonly logger = new Logger(ClassContentService.name);

  async getLessonForStudent(
    lessonId: string,
    studentId: string,
    classId?: string,
  ): Promise<LessonResponseDto> {
    if (classId) {
      return this.getAssignedLessonForStudent(classId, lessonId, studentId);
    }

    const topic = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!topic) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }

    if (topic.classId) {
      await this.validateStudentClassAccess(topic.classId, studentId);
    }

    return redactLessonVideo(topic);
  }

  /**
   * Student may open a lesson only through a lần giao on this class.
   * Practice assignments stay closed until `openAt`. Link video bị thay bằng `hasVideo`.
   */
  async getAssignedLessonForStudent(
    classId: string,
    lessonId: string,
    studentId: string,
  ): Promise<LessonResponseDto> {
    return redactLessonVideo(
      await this.loadAssignedLessonForStudent(classId, lessonId, studentId),
    );
  }

  /**
   * Link phát video tiết lý thuyết (Video bảo vệ). Cùng điều kiện mở tiết với
   * `getAssignedLessonForStudent`; không bao giờ trả link YouTube.
   */
  async getLessonVideoPlaybackForStudent(
    classId: string,
    lessonId: string,
    studentId: string,
  ): Promise<ProtectedVideoPlaybackDto> {
    const lesson = await this.loadAssignedLessonForStudent(
      classId,
      lessonId,
      studentId,
    );
    if (!this.protectedVideos) return { state: 'unavailable' };
    return this.protectedVideos.issuePlayback(lesson.videoUrl);
  }

  private async loadAssignedLessonForStudent(
    classId: string,
    lessonId: string,
    studentId: string,
  ) {
    await this.validateStudentClassAccess(classId, studentId);

    const item = await this.prisma.classContentItem.findUnique({
      where: { classId_lessonId: { classId, lessonId } },
      include: { lesson: true },
    });
    if (!item?.lesson || item.lesson.archivedAt) {
      throw new NotFoundException('Tiết học không tồn tại');
    }
    this.assertClassContentVisibleToStudent(item.hiddenAt);

    this.assertPracticeAssignmentOpen(item.lesson.kind, item.openAt);
    return item.lesson;
  }

  async recordTheoryLessonViewForStudent(
    classId: string,
    lessonId: string,
    studentId: string,
  ): Promise<TheoryLessonViewResponseDto> {
    await this.validateStudentClassAccess(classId, studentId);

    const item = await this.prisma.classContentItem.findUnique({
      where: { classId_lessonId: { classId, lessonId } },
      include: { lesson: true },
    });
    if (!item?.lesson || item.lesson.archivedAt) {
      throw new NotFoundException('Tiết học không tồn tại');
    }
    this.assertClassContentVisibleToStudent(item.hiddenAt);
    if (item.lesson.kind !== LessonKind.theory) {
      throw new BadRequestException('Chỉ tiết lý thuyết mới ghi nhận lượt xem');
    }

    const lastViewedAt = new Date();
    const view = await this.prisma.classTheoryLessonView.upsert({
      where: {
        classContentItemId_studentId: {
          classContentItemId: item.id,
          studentId,
        },
      },
      create: {
        classContentItemId: item.id,
        studentId,
        lastViewedAt,
      },
      update: {
        lastViewedAt,
      },
    });

    return {
      classContentItemId: item.id,
      lessonId,
      studentId,
      lastViewedAt: view.lastViewedAt,
    };
  }

  /**
   * Practice lần giao the student may start/resume. Reuses enrollment expiry (#49)
   * and openAt (#59) — callers must not re-implement those checks.
   */

  /**
   * Practice lần giao the student may start/resume. Reuses enrollment expiry (#49)
   * and openAt (#59) — callers must not re-implement those checks.
   */
  async getPracticeAssignmentForStudent(
    classId: string,
    assignmentId: string,
    studentId: string,
  ) {
    await this.validateStudentClassAccess(classId, studentId);

    const item = await this.prisma.classContentItem.findFirst({
      where: { id: assignmentId, classId },
      include: { lesson: true },
    });
    if (!item?.lesson || item.lesson.archivedAt) {
      throw new NotFoundException('Assignment not found');
    }
    this.assertClassContentVisibleToStudent(item.hiddenAt);
    if (item.lesson.kind !== LessonKind.practice) {
      throw new BadRequestException(
        'Attempts are only for practice assignments',
      );
    }
    this.assertPracticeAssignmentOpen(item.lesson.kind, item.openAt);
    const durationMinutes = assignmentDurationMinutes(item);
    if (durationMinutes == null || durationMinutes < 1) {
      throw new BadRequestException('Assignment has no duration');
    }
    return item;
  }

  private assertClassContentVisibleToStudent(hiddenAt: Date | null): void {
    if (hiddenAt) {
      throw new NotFoundException('Tiết học không tồn tại');
    }
  }

  /**
   * Block course-level Module/Lesson deletes while any class still
   * references the lesson via ClassContentItem (including hidden items).
   */

  // ---------- Class Content ----------
  //
  // Dual source of truth:
  // `Lesson.classId` (scalar FK on `lessons`) and `class_content_items.class_id`
  // serve different purposes. Lesson.classId marks a legacy class-owned lesson —
  // no longer created and archived by the 2026-10-02 migration (`lessons.archived_at`).
  // class_content_items is the ordered list of course lessons shown in the class:
  // the class content is the set of course lessons the class added (ADR
  // 2026-10-18-class-content-as-lesson-set); `class_modules` only orders the groups.

  /**
   * Map a raw Prisma ClassContentItem (with included lesson/module) to the
   * frontend DTO shape expected by ClassContentManager.
   */
  private mapClassContentItem(item: {
    id: string;
    lessonId: string | null;
    kind: string;
    sortOrder: number;
    classId: string;
    openAt?: Date | null;
    closeAt?: Date | null;
    durationMinutes?: number | null;
    shuffleQuestions?: boolean;
    hiddenAt?: Date | null;
    hiddenByStaffId?: string | null;
    hiddenReason?: 'manual' | 'module_removed' | null;
    lesson?: {
      title: string;
      kind: string;
      classId: string | null;
      durationMinutes?: number | null;
      module?: { id: string; title: string } | null;
    } | null;
  }): ClassContentItemResponseDto {
    const lesson = item.lesson;
    const lessonKind: 'theory' | 'practice' =
      lesson?.kind === 'practice' ? 'practice' : 'theory';
    const kindLabel =
      lessonKind === 'practice' ? 'Tiết thực hành' : 'Tiết lý thuyết';
    const source: 'course' | 'class' =
      item.kind === 'lesson' && lesson?.classId === item.classId
        ? 'class'
        : 'course';
    const openAt = item.openAt ?? null;
    const durationMinutes =
      item.durationMinutes ?? lesson?.durationMinutes ?? null;
    return {
      id: item.id,
      lessonId: item.lessonId ?? '',
      kind: item.kind as 'lesson',
      lessonKind,
      sortOrder: item.sortOrder,
      title: lesson?.title ?? '(Tiết học đã xoá)',
      kindLabel,
      source,
      moduleId: lesson?.module?.id,
      moduleTitle: lesson?.module?.title,
      openAt,
      closeAt: item.closeAt ?? null,
      durationMinutes,
      shuffleQuestions: item.shuffleQuestions ?? true,
      isOpen: this.isPracticeAssignmentOpen(lessonKind, openAt),
      hiddenAt: item.hiddenAt ?? null,
      hiddenByStaffId: item.hiddenByStaffId ?? null,
      hiddenReason: item.hiddenReason ?? null,
    };
  }

  private isPracticeAssignmentOpen(
    lessonKind: string,
    openAt: Date | string | null,
  ): boolean {
    if (lessonKind !== 'practice') return true;
    if (!openAt) return false;
    return new Date(openAt).getTime() <= Date.now();
  }

  private assertPracticeAssignmentOpen(
    lessonKind: string,
    openAt: Date | string | null,
  ): void {
    if (!this.isPracticeAssignmentOpen(lessonKind, openAt)) {
      throw new ForbiddenException('Chưa tới thời điểm mở bài');
    }
  }

  private parsePracticeOpenAt(
    lessonKind: string,
    dto: { openAt?: string },
    required: boolean,
  ): Date | null {
    if (lessonKind !== 'practice') return null;

    const rawOpenAt = dto.openAt?.trim() ? dto.openAt.trim() : undefined;
    if (rawOpenAt == null) {
      if (required) {
        throw new BadRequestException('Practice assignments require openAt');
      }
      return new Date();
    }
    const openAt = new Date(rawOpenAt);
    if (Number.isNaN(openAt.getTime())) {
      throw new BadRequestException('openAt is not a valid date');
    }
    return openAt;
  }

  /**
   * Hạn làm bài: `undefined` → `fallback`; `null`/rỗng → không hạn. Hạn phải sau
   * thời điểm mở bài.
   */
  private parseAssignmentCloseAt(
    raw: string | null | undefined,
    openAt: Date | null,
    fallback: Date | null,
  ): Date | null {
    let closeAt: Date | null;
    if (raw === undefined) {
      closeAt = fallback;
    } else if (raw === null || !raw.trim()) {
      closeAt = null;
    } else {
      closeAt = new Date(raw.trim());
      if (Number.isNaN(closeAt.getTime())) {
        throw new BadRequestException('closeAt is not a valid date');
      }
    }
    if (closeAt && openAt && closeAt.getTime() <= openAt.getTime()) {
      throw new BadRequestException('Hạn làm bài phải sau thời điểm mở bài.');
    }
    return closeAt;
  }

  async createClassContentItem(
    classId: string,
    dto: ClassContentCreateDto,
    actor: ActionHistoryActor,
  ): Promise<ClassContentItemResponseDto> {
    await this.validateStaffClassAccess(classId, actor);

    // Lớp không tạo tiết riêng nữa (ADR 2026-10-02): chỉ thêm tiết có sẵn của khoá.
    if (!dto.lessonId) {
      throw new BadRequestException(CLASS_OWNED_LESSON_DISABLED_MESSAGE);
    }
    const topic = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
    });
    if (!topic || topic.archivedAt) {
      throw new NotFoundException(`Lesson ${dto.lessonId} not found`);
    }
    const lessonId = dto.lessonId;
    const lessonKind: string = topic.kind;
    const moduleId = topic.moduleId;

    const classInfo = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { courseId: true, contentAccessExpiresAt: true },
    });
    // Nội dung lớp là tập tiết của khoá (ADR 2026-10-18): tiết khoá khác / tiết riêng lớp khác → chặn.
    if (topic.classId || !classInfo || topic.courseId !== classInfo.courseId) {
      throw new BadRequestException(LESSON_NOT_IN_CLASS_COURSE_MESSAGE);
    }

    // Tiết lý thuyết không có lịch; tiết thực hành thành lần giao.
    const isPractice = lessonKind === LessonKind.practice;
    const openAt = this.parsePracticeOpenAt(lessonKind, dto, false);
    // Mặc định hạn làm bài = hạn xem nội dung của lớp (khoá vô hạn → không hạn).
    const closeAt = isPractice
      ? this.parseAssignmentCloseAt(
          dto.closeAt,
          openAt,
          classInfo.contentAccessExpiresAt ?? null,
        )
      : null;

    const item = await this.prisma.$transaction(
      async (tx) => {
        // Tiết đầu của chuyên đề mới → nhóm chuyên đề hiện ở đầu danh sách nhóm.
        if (moduleId) {
          await ensureClassModuleGroupOnTop(tx, classId, moduleId);
        }

        const existing = await tx.classContentItem.findUnique({
          where: { classId_lessonId: { classId, lessonId } },
        });
        if (existing?.removedAt) {
          // Tiết từng gỡ khỏi lớp → thêm lại = đưa về item cũ (giữ attempt/điểm/lượt xem),
          // tiết từng Ẩn tay vẫn ẩn; lần giao lấy lịch theo lần thêm này.
          await restoreRemovedClassContentItems(tx, {
            classId,
            where: { id: existing.id },
          });
          return tx.classContentItem.update({
            where: { id: existing.id },
            data: isPractice ? { openAt, closeAt } : {},
            include: { lesson: { include: { module: true } } },
          });
        }
        if (existing) {
          if (existing.hiddenAt) {
            throw new BadRequestException(
              'Tiết học đang bị ẩn trong lớp này. Hãy khôi phục thay vì thêm lại.',
            );
          }
          throw new BadRequestException(
            'Lesson is already in this class content list',
          );
        }

        const maxSort = await tx.classContentItem.aggregate({
          where: { classId },
          _max: { sortOrder: true },
        });
        const nextSort = (maxSort._max.sortOrder ?? -1) + 1;

        const createdItem = await tx.classContentItem.create({
          data: {
            classId,
            lessonId,
            kind: 'lesson',
            sortOrder: nextSort,
            openAt,
            closeAt,
            // Lần giao mới không chốt thời lượng — lượt làm đọc từ tiết thực hành.
            ...(isPractice
              ? { shuffleQuestions: dto.shuffleQuestions ?? true }
              : {}),
          },
          include: {
            lesson: { include: { module: true } },
          },
        });

        await appendClassTimelineItem(tx, {
          classId,
          kind: ClassTimelineItemKind.content_item,
          classContentItemId: createdItem.id,
        });

        return createdItem;
      },
      { timeout: CLASS_CONTENT_CREATE_TRANSACTION_TIMEOUT_MS },
    );

    this.logger.log(
      `Class content item created: ${item.id} for class ${classId} by ${actor.userEmail}`,
    );

    return this.mapClassContentItem(item);
  }

  async listClassContentItems(
    classId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassContentItemResponseDto[]> {
    await this.validateStaffClassAccess(classId, actor);
    const items = await this.prisma.classContentItem.findMany({
      where: { classId, ...PRESENT_CONTENT_ITEM },
      orderBy: { sortOrder: 'asc' },
      include: {
        lesson: { include: { module: true } },
      },
    });
    return items
      .toSorted(compareClassContentItems)
      .map((item) => this.mapClassContentItem(item));
  }

  async listClassContentGroups(
    classId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassContentModuleGroupDto[]> {
    const items = await this.listClassContentItems(classId, actor);
    return this.groupByClassModules(classId, items);
  }

  /**
   * Trang lớp học sinh, tab Chuyên đề: cùng cách gom và thứ tự nhóm như staff nhưng chỉ
   * item học sinh thấy (bỏ item ẩn, tiết lưu trữ).
   */
  async listClassContentGroupsForStudent(
    classId: string,
    studentId: string,
  ): Promise<ClassContentModuleGroupDto[]> {
    const items = await this.listClassContentForStudent(classId, studentId);
    return this.groupByClassModules(classId, items);
  }

  private async groupByClassModules(
    classId: string,
    items: ClassContentItemResponseDto[],
  ): Promise<ClassContentModuleGroupDto[]> {
    // Nhóm lấy từ tập tiết của lớp; `class_modules` chỉ giữ thứ tự nhóm của lớp.
    const classModules = await this.prisma.classModule.findMany({
      where: { classId },
      select: { moduleId: true, sortOrder: true },
    });
    return groupClassContentByModule(
      items,
      new Map(classModules.map((row) => [row.moduleId, row.sortOrder])),
    );
  }

  async getClassTheoryProgress(
    classId: string,
    itemId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassTheoryProgressDto> {
    await this.validateStaffClassAccess(classId, actor);

    const item = await this.prisma.classContentItem.findFirst({
      where: { id: itemId, classId },
      include: {
        lesson: {
          select: { id: true, title: true, kind: true, archivedAt: true },
        },
      },
    });
    if (!item?.lesson || !item.lessonId || item.lesson.archivedAt) {
      throw new NotFoundException('Class content item not found');
    }
    if (item.lesson.kind !== LessonKind.theory) {
      throw new BadRequestException('Progress is only for theory lessons');
    }

    const roster = await this.prisma.studentClass.findMany({
      where: { classId, status: StudentClassStatus.active },
      select: {
        studentId: true,
        student: { select: { id: true, fullName: true } },
      },
    });
    const sortedRoster = roster.toSorted((a, b) => {
      const byName = a.student.fullName.localeCompare(b.student.fullName, 'vi');
      return byName || a.studentId.localeCompare(b.studentId);
    });
    const studentIds = sortedRoster.map((row) => row.studentId);

    const quizzes = await this.prisma.lessonQuiz.findMany({
      where: { lessonId: item.lessonId },
      select: { questionId: true },
    });
    const requiredQuizPairs = new Set(
      quizzes.map((quiz) => `${item.lessonId}:${quiz.questionId}`),
    );
    const quizQuestionCount = requiredQuizPairs.size;

    const viewsPromise: Promise<{ studentId: string; lastViewedAt: Date }[]> =
      studentIds.length === 0
        ? Promise.resolve([])
        : this.prisma.classTheoryLessonView.findMany({
            where: {
              classContentItemId: item.id,
              studentId: { in: studentIds },
            },
            select: { studentId: true, lastViewedAt: true },
          });
    const answersPromise: Promise<
      {
        studentId: string;
        lessonId: string;
        questionId: string;
        choiceIndex: number | null;
        essayAnswer: string | null;
        tfChoices: unknown;
        blankAnswers: unknown;
        orderAnswer: string[];
        question: {
          type: QuestionType;
          blankAnswerKey: unknown;
          options: unknown;
        };
      }[]
    > =
      studentIds.length === 0 || quizQuestionCount === 0
        ? Promise.resolve([])
        : this.prisma.lessonQuizAnswer.findMany({
            where: {
              studentId: { in: studentIds },
              lessonId: item.lessonId,
            },
            select: {
              studentId: true,
              lessonId: true,
              questionId: true,
              choiceIndex: true,
              essayAnswer: true,
              tfChoices: true,
              blankAnswers: true,
              orderAnswer: true,
              question: {
                select: { type: true, blankAnswerKey: true, options: true },
              },
            },
          });

    const [views, answers] = await Promise.all([viewsPromise, answersPromise]);

    const viewsByStudent = new Map<string, Date>(
      views.map((view): [string, Date] => [view.studentId, view.lastViewedAt]),
    );
    const answersByStudent = new Map<string, Set<string>>();
    for (const answer of answers) {
      if (
        !isAnswered({
          ...answer,
          type: answer.question.type,
          blankAnswerKey: answer.question.blankAnswerKey,
          options: answer.question.options,
        })
      ) {
        continue;
      }
      const pairKey = `${answer.lessonId}:${answer.questionId}`;
      if (!requiredQuizPairs.has(pairKey)) continue;
      const studentAnswers =
        answersByStudent.get(answer.studentId) ?? new Set<string>();
      studentAnswers.add(pairKey);
      answersByStudent.set(answer.studentId, studentAnswers);
    }

    const students = sortedRoster.map((row) => {
      const lastViewedAt = viewsByStudent.get(row.studentId) ?? null;
      const answeredQuizQuestionCount =
        answersByStudent.get(row.studentId)?.size ?? 0;
      const completedQuiz =
        quizQuestionCount > 0 && answeredQuizQuestionCount >= quizQuestionCount;
      return {
        studentId: row.student.id,
        studentName: row.student.fullName,
        viewed: Boolean(lastViewedAt),
        lastViewedAt,
        completedQuiz,
        answeredQuizQuestionCount,
        quizQuestionCount,
      };
    });

    return {
      classId,
      classContentItemId: item.id,
      lessonId: item.lessonId,
      title: item.lesson.title,
      rosterCount: students.length,
      viewedCount: students.filter((student) => student.viewed).length,
      completedQuizCount: students.filter((student) => student.completedQuiz)
        .length,
      quizQuestionCount,
      students,
    };
  }

  async reorderClassContentItems(
    classId: string,
    orderedIds: string[],
    actor: ActionHistoryActor,
  ): Promise<ClassContentItemResponseDto[]> {
    await this.validateStaffClassAccess(classId, actor);

    // Finding #4: verify ALL IDs belong to this class before updating
    const owned = await this.prisma.classContentItem.findMany({
      where: { id: { in: orderedIds }, classId, ...PRESENT_CONTENT_ITEM },
      select: { id: true },
    });
    if (owned.length !== orderedIds.length) {
      throw new BadRequestException(
        'Some IDs do not belong to this class or do not exist',
      );
    }

    await this.prisma.$transaction(
      orderedIds.map((id, idx) =>
        this.prisma.classContentItem.update({
          where: { id },
          data: { sortOrder: idx },
        }),
      ),
    );
    return this.listClassContentItems(classId, actor);
  }

  async deleteClassContentItem(
    classId: string,
    itemId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassContentItemResponseDto[]> {
    await this.validateStaffClassAccess(classId, actor);
    const item = await this.prisma.classContentItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.classId !== classId || item.removedAt) {
      throw new NotFoundException('Class content item not found');
    }
    const hiddenAt = item.hiddenAt ?? new Date();
    const hiddenByStaffId = await this.resolveHiddenByStaffId(actor);
    const hiddenReason = item.hiddenReason ?? ClassContentHiddenReason.manual;
    await this.prisma.$transaction([
      this.prisma.classContentItem.update({
        where: { id: itemId },
        data: { hiddenAt, hiddenByStaffId, hiddenReason },
      }),
      this.prisma.classTimelineItem.updateMany({
        where: { classContentItemId: itemId },
        data: { hiddenAt, hiddenByStaffId },
      }),
    ]);
    this.logger.log(
      `Class content item hidden: ${itemId} for class ${classId} by ${actor.userEmail}`,
    );
    return this.listClassContentItems(classId, actor);
  }

  async restoreClassContentItem(
    classId: string,
    itemId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassContentItemResponseDto[]> {
    await this.validateStaffClassAccess(classId, actor);
    const item = await this.prisma.classContentItem.findUnique({
      where: { id: itemId },
      include: {
        lesson: { select: { archivedAt: true } },
      },
    });
    if (!item || item.classId !== classId) {
      throw new NotFoundException('Class content item not found');
    }
    if (item.removedAt) {
      throw new BadRequestException(
        'Tiết đã gỡ khỏi lớp. Hãy thêm lại tiết thay vì khôi phục.',
      );
    }
    if (item.lesson?.archivedAt) {
      throw new BadRequestException(
        'Tiết học đã được lưu trữ, không khôi phục vào lớp được.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.classContentItem.update({
        where: { id: itemId },
        data: { hiddenAt: null, hiddenByStaffId: null, hiddenReason: null },
      }),
      this.prisma.classTimelineItem.updateMany({
        where: { classContentItemId: itemId },
        data: { hiddenAt: null, hiddenByStaffId: null },
      }),
    ]);
    this.logger.log(
      `Class content item restored: ${itemId} for class ${classId} by ${actor.userEmail}`,
    );
    return this.listClassContentItems(classId, actor);
  }

  /**
   * Gỡ một tiết khỏi lớp (khác Ẩn): tiết và lần giao biến mất ở mọi phía, kể cả gia sư.
   * Bài làm, điểm, lượt xem giữ nguyên; thêm lại tiết thì hiện lại (tiết từng Ẩn vẫn ẩn).
   * Gỡ tiết cuối của chuyên đề → nhóm chuyên đề biến mất (xoá dòng thứ tự nhóm).
   */
  async removeClassContentItem(
    classId: string,
    itemId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassContentItemResponseDto[]> {
    await this.validateStaffClassAccess(classId, actor);
    const hiddenByStaffId = await this.resolveHiddenByStaffId(actor);
    const removedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.classContentItem.findUnique({
        where: { id: itemId },
        select: {
          classId: true,
          removedAt: true,
          lesson: { select: { moduleId: true } },
        },
      });
      if (!item || item.classId !== classId || item.removedAt) {
        throw new NotFoundException('Class content item not found');
      }
      await removeClassContentItems(tx, {
        classId,
        where: { id: itemId },
        removedAt,
        hiddenByStaffId,
      });
      const moduleId = item.lesson?.moduleId;
      if (!moduleId) return;
      const remaining = await tx.classContentItem.count({
        where: { classId, removedAt: null, lesson: { is: { moduleId } } },
      });
      if (remaining === 0) {
        await tx.classModule.deleteMany({ where: { classId, moduleId } });
      }
    });
    this.logger.log(
      `Class content item removed: ${itemId} from class ${classId} by ${actor.userEmail}`,
    );
    return this.listClassContentItems(classId, actor);
  }

  /** Ảnh hưởng nếu gỡ một tiết (chỉ lần giao thực hành có bài làm). */
  async getClassContentItemRemovalImpact(
    classId: string,
    itemId: string,
    actor: ActionHistoryActor,
  ): Promise<ClassContentItemRemovalImpactDto> {
    await this.validateStaffClassAccess(classId, actor);
    const item = await this.prisma.classContentItem.findUnique({
      where: { id: itemId },
      select: { classId: true, removedAt: true },
    });
    if (!item || item.classId !== classId || item.removedAt) {
      throw new NotFoundException('Class content item not found');
    }
    const impact = await this.computeRemovalImpact({ id: itemId, classId });
    return { itemId, ...impact };
  }

  async updateClassContentSchedule(
    classId: string,
    itemId: string,
    dto: ClassContentScheduleUpdateDto,
    actor: ActionHistoryActor,
  ): Promise<ClassContentItemResponseDto> {
    await this.validateStaffClassAccess(classId, actor);
    const item = await this.prisma.classContentItem.findUnique({
      where: { id: itemId },
      include: { lesson: { include: { module: true } } },
    });
    if (!item || item.classId !== classId) {
      throw new NotFoundException('Class content item not found');
    }
    const lessonKind = item.lesson?.kind ?? 'theory';
    if (lessonKind !== 'practice') {
      throw new BadRequestException('Only practice assignments have openAt');
    }
    const openAt = this.parsePracticeOpenAt(lessonKind, dto, true);
    const closeAt = this.parseAssignmentCloseAt(
      dto.closeAt,
      openAt,
      item.closeAt,
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.classContentItem.update({
        where: { id: itemId },
        data: {
          openAt,
          closeAt,
          ...(dto.shuffleQuestions !== undefined
            ? { shuffleQuestions: dto.shuffleQuestions }
            : {}),
        },
        include: {
          lesson: { include: { module: true } },
        },
      });
      await syncClassTimelineSortByTime(tx, classId);
      return next;
    });
    this.logger.log(
      `Assignment schedule updated: ${itemId} for class ${classId} by ${actor.userEmail}`,
    );
    return this.mapClassContentItem(updated);
  }

  async listClassContentForStudent(
    classId: string,
    studentId: string,
  ): Promise<ClassContentItemResponseDto[]> {
    const classInfo = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!classInfo) {
      throw new NotFoundException('Class not found');
    }
    const enrollment = await this.prisma.studentClass.findFirst({
      where: { classId, studentId },
    });
    if (!enrollment) {
      throw new ForbiddenException('Student not a member of the class');
    }
    if (
      classInfo.contentAccessExpiresAt &&
      classInfo.contentAccessExpiresAt < new Date()
    ) {
      throw new ForbiddenException('Content access period has expired');
    }
    const items = await this.prisma.classContentItem.findMany({
      where: { classId, hiddenAt: null, ...PRESENT_CONTENT_ITEM },
      orderBy: { sortOrder: 'asc' },
      include: {
        lesson: { include: { module: true } },
      },
    });
    return items
      .toSorted(compareClassContentItems)
      .map((item) => this.mapClassContentItem(item));
  }

  async listCourseLessonsForClass(
    classId: string,
    actor: ActionHistoryActor,
  ): Promise<CourseLessonForClassDto[]> {
    await this.validateStaffClassAccess(classId, actor);

    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { courseId: true },
    });
    if (!cls) throw new NotFoundException(`Class ${classId} not found`);

    const [courseTopics, existingItemTopicIds] = await Promise.all([
      this.prisma.lesson.findMany({
        // Mọi tiết (lý thuyết + thực hành) chưa lưu trữ của khoá; picker nhóm theo chuyên đề.
        where: {
          courseId: cls.courseId,
          classId: null,
          archivedAt: null,
        },
        include: {
          module: { select: { id: true, title: true } },
          quizzes: { select: { questionId: true } },
        },
        orderBy: [{ module: { sortOrder: 'asc' } }, { order: 'asc' }],
      }),
      // Tiết đã gỡ khỏi lớp không tính là đã thêm.
      this.prisma.classContentItem.findMany({
        where: { classId, removedAt: null },
        select: { lessonId: true },
      }),
    ]);

    const addedSet = new Set(existingItemTopicIds.map((i) => i.lessonId));

    return courseTopics.map((t) => ({
      id: t.id,
      title: t.title,
      kind: t.kind,
      moduleTitle: t.module?.title ?? 'Thư viện đề thi',
      moduleId: t.module?.id ?? '',
      alreadyAdded: addedSet.has(t.id),
    }));
  }
}

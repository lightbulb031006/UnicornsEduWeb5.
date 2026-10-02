import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LessonResponseDto,
  ClassContentCreateDto,
  ClassContentScheduleUpdateDto,
  ClassContentItemResponseDto,
  ClassTheoryProgressDto,
  PRACTICE_DURATION_MIN_MINUTES,
  PRACTICE_DURATION_MAX_MINUTES,
  CourseLessonForClassDto,
  TheoryLessonViewResponseDto,
} from 'src/dtos/course-content.dto';
import {
  LessonKind,
  ClassTimelineItemKind,
  StudentClassStatus,
} from 'generated/enums';
import {
  appendClassTimelineItem,
  syncClassTimelineSortByTime,
} from 'src/class-timeline/append-timeline-item';
import {
  ActionHistoryActor,
  CourseContentSupportService,
} from './course-content-support.service';

const CLASS_CONTENT_CREATE_TRANSACTION_TIMEOUT_MS = 15_000;

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

    return topic;
  }

  /**
   * Student may open a lesson only through a lần giao on this class.
   * Practice assignments stay closed until `openAt`.
   */
  async getAssignedLessonForStudent(
    classId: string,
    lessonId: string,
    studentId: string,
  ): Promise<LessonResponseDto> {
    await this.validateStudentClassAccess(classId, studentId);

    const item = await this.prisma.classContentItem.findUnique({
      where: { classId_lessonId: { classId, lessonId } },
      include: { lesson: true },
    });
    if (!item?.lesson) {
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
    if (!item?.lesson) {
      throw new NotFoundException('Tiết học không tồn tại');
    }
    this.assertClassContentVisibleToStudent(item.hiddenAt);
    if (item.lesson.kind !== LessonKind.theory) {
      throw new BadRequestException(
        'Chỉ tiết lý thuyết mới ghi nhận lượt xem',
      );
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
    if (!item?.lesson) {
      throw new NotFoundException('Assignment not found');
    }
    this.assertClassContentVisibleToStudent(item.hiddenAt);
    if (item.lesson.kind !== LessonKind.practice) {
      throw new BadRequestException(
        'Attempts are only for practice assignments',
      );
    }
    this.assertPracticeAssignmentOpen(item.lesson.kind, item.openAt);
    if (item.durationMinutes == null || item.durationMinutes < 1) {
      throw new BadRequestException('Assignment has no duration');
    }
    return item;
  }

  private assertClassContentVisibleToStudent(hiddenAt: Date | null): void {
    if (hiddenAt) {
      throw new NotFoundException('Tiết học không tồn tại');
    }
  }

  private async resolveHiddenByStaffId(
    actor: ActionHistoryActor,
  ): Promise<string | null> {
    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId: actor.userId },
      select: { id: true },
    });
    return staff?.id ?? null;
  }

  /**
   * Block course-level Module/Lesson deletes while any class still
   * references the lesson via ClassContentItem (including hidden items).
   */

  // ---------- Class Content ----------
  //
  // Dual source of truth:
  // `Lesson.classId` (scalar FK on `lessons`) and `class_content_items.class_id`
  // serve different purposes. Lesson.classId marks a lesson as owned by a class
  // (created inline for that class — XOR with courseId+moduleId). class_content_items
  // is the ordered list of lessons shown in the class content tab — it can
  // reference both class-owned lessons AND course lessons. When creating a new
  // lesson for a class, we write BOTH: Lesson.classId = classId AND a
  // class_content_items row. When adding an existing course lesson, only a
  // class_content_items row is created — the lesson's courseId/moduleId stay
  // untouched.

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
    durationMinutes?: number | null;
    hiddenAt?: Date | null;
    hiddenByStaffId?: string | null;
    lesson?: {
      title: string;
      kind: string;
      classId: string | null;
      module?: { title: string } | null;
    } | null;
  }): ClassContentItemResponseDto {
    const lesson = item.lesson;
    const lessonKind: 'theory' | 'practice' =
      lesson?.kind === 'practice' ? 'practice' : 'theory';
    const kindLabel = lessonKind === 'practice' ? 'Tiết thực hành' : 'Tiết lý thuyết';
    const source: 'course' | 'class' =
      item.kind === 'lesson' && lesson?.classId === item.classId
        ? 'class'
        : 'course';
    const openAt = item.openAt ?? null;
    const durationMinutes = item.durationMinutes ?? null;
    return {
      id: item.id,
      lessonId: item.lessonId ?? '',
      kind: item.kind as 'lesson',
      lessonKind,
      sortOrder: item.sortOrder,
      title: lesson?.title ?? '(Tiết học đã xoá)',
      kindLabel,
      source,
      moduleTitle: lesson?.module?.title,
      openAt,
      durationMinutes,
      isOpen: this.isPracticeAssignmentOpen(lessonKind, openAt),
      hiddenAt: item.hiddenAt ?? null,
      hiddenByStaffId: item.hiddenByStaffId ?? null,
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

  private parsePracticeSchedule(
    lessonKind: string,
    dto: { openAt?: string; durationMinutes?: number },
    required: boolean,
  ):
    | { openAt: Date; durationMinutes: number }
    | { openAt: null; durationMinutes: null } {
    if (lessonKind !== 'practice') {
      return { openAt: null, durationMinutes: null };
    }

    const durationMinutes = dto.durationMinutes;
    if (
      durationMinutes == null ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < PRACTICE_DURATION_MIN_MINUTES ||
      durationMinutes > PRACTICE_DURATION_MAX_MINUTES
    ) {
      throw new BadRequestException(
        durationMinutes == null
          ? 'Practice assignments require durationMinutes'
          : `durationMinutes must be an integer from ${PRACTICE_DURATION_MIN_MINUTES} to ${PRACTICE_DURATION_MAX_MINUTES}`,
      );
    }

    const rawOpenAt = dto.openAt?.trim() ? dto.openAt.trim() : undefined;
    let openAt: Date;
    if (rawOpenAt == null) {
      if (required) {
        throw new BadRequestException(
          'Practice assignments require openAt and durationMinutes',
        );
      }
      openAt = new Date();
    } else {
      openAt = new Date(rawOpenAt);
      if (Number.isNaN(openAt.getTime())) {
        throw new BadRequestException('openAt is not a valid date');
      }
    }

    const closeAtMs = openAt.getTime() + durationMinutes * 60_000;
    if (openAt.getTime() >= closeAtMs) {
      throw new BadRequestException(
        'openAt must not be later than assignment close time',
      );
    }

    return { openAt, durationMinutes };
  }

  async createClassContentItem(
    classId: string,
    dto: ClassContentCreateDto,
    actor: ActionHistoryActor,
  ): Promise<ClassContentItemResponseDto> {
    await this.validateStaffClassAccess(classId, actor);

    let lessonKind: string;

    if (dto.lessonId) {
      const topic = await this.prisma.lesson.findUnique({
        where: { id: dto.lessonId },
      });
      if (!topic) {
        throw new NotFoundException(`Lesson ${dto.lessonId} not found`);
      }
      lessonKind = topic.kind;
    } else {
      if (!dto.title?.trim()) {
        throw new BadRequestException(
          'Title is required when creating a new lesson',
        );
      }
      const kind =
        dto.kind === LessonKind.practice ? LessonKind.practice : LessonKind.theory;
      await this.validateLessonOwnership({
        kind,
        classId,
        title: dto.title.trim(),
      });
      await this.validateClassExists(classId);
      lessonKind = kind;
    }

    const schedule = this.parsePracticeSchedule(lessonKind, dto, false);

    const item = await this.prisma.$transaction(
      async (tx) => {
        let lessonId: string;

        if (dto.lessonId) {
          const existing = await tx.classContentItem.findUnique({
            where: { classId_lessonId: { classId, lessonId: dto.lessonId } },
          });
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
          lessonId = dto.lessonId;
        } else {
          const created = await tx.lesson.create({
            data: {
              kind:
                dto.kind === LessonKind.practice
                  ? LessonKind.practice
                  : LessonKind.theory,
              classId,
              title: dto.title!.trim(),
              createdBy: actor.userId,
              updatedBy: actor.userId,
            },
          });
          lessonId = created.id;
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
            openAt: schedule.openAt,
            durationMinutes: schedule.durationMinutes,
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
      where: { classId },
      orderBy: { sortOrder: 'asc' },
      include: {
        lesson: { include: { module: true } },
      },
    });
    return items.map((item) => this.mapClassContentItem(item));
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
        lesson: { select: { id: true, title: true, kind: true } },
      },
    });
    if (!item?.lesson || !item.lessonId) {
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
            },
          });

    const [views, answers] = await Promise.all([viewsPromise, answersPromise]);

    const viewsByStudent = new Map<string, Date>(
      views.map((view): [string, Date] => [view.studentId, view.lastViewedAt]),
    );
    const answersByStudent = new Map<string, Set<string>>();
    for (const answer of answers) {
      const hasAnswer =
        answer.choiceIndex != null || Boolean(answer.essayAnswer?.trim());
      if (!hasAnswer) continue;
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
      where: { id: { in: orderedIds }, classId },
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
    if (!item || item.classId !== classId) {
      throw new NotFoundException('Class content item not found');
    }
    const hiddenAt = item.hiddenAt ?? new Date();
    const hiddenByStaffId = await this.resolveHiddenByStaffId(actor);
    await this.prisma.$transaction([
      this.prisma.classContentItem.update({
        where: { id: itemId },
        data: { hiddenAt, hiddenByStaffId },
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
    });
    if (!item || item.classId !== classId) {
      throw new NotFoundException('Class content item not found');
    }
    await this.prisma.$transaction([
      this.prisma.classContentItem.update({
        where: { id: itemId },
        data: { hiddenAt: null, hiddenByStaffId: null },
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
      throw new BadRequestException(
        'Only practice assignments have openAt and durationMinutes',
      );
    }
    const schedule = this.parsePracticeSchedule(lessonKind, dto, true);
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.classContentItem.update({
        where: { id: itemId },
        data: {
          openAt: schedule.openAt,
          durationMinutes: schedule.durationMinutes,
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
      where: { classId, hiddenAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        lesson: { include: { module: true } },
      },
    });
    return items.map((item) => this.mapClassContentItem(item));
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
        where: { courseId: cls.courseId, classId: null },
        include: {
          module: { select: { id: true, title: true } },
          quizzes: { select: { questionId: true } },
        },
        orderBy: [{ module: { sortOrder: 'asc' } }, { order: 'asc' }],
      }),
      this.prisma.classContentItem.findMany({
        where: { classId },
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

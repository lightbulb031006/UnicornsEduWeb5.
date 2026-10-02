import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActionHistoryService } from 'src/action-history/action-history.service';
import { CourseAccessService } from 'src/class/course-access.service';
import { LessonCreateDto } from 'src/dtos/course-content.dto';
import { LessonKind, StaffRole, UserRole } from 'generated/enums';

export interface ActionHistoryActor {
  userId: string;
  userEmail: string;
  roleType: UserRole;
}

@Injectable()
export class CourseContentSupportService {
  protected readonly logger = new Logger(CourseContentSupportService.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly actionHistory: ActionHistoryService,
    protected readonly courseAccess: CourseAccessService,
  ) {}

  async findStudentIdByUserId(userId: string): Promise<string | null> {
    const studentInfo = await this.prisma.studentInfo.findFirst({
      where: { userId },
      select: { id: true },
    });
    return studentInfo?.id ?? null;
  }

  protected hasMediaValue(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.trim() !== '';
  }

  protected assertPracticeHasNoMedia(
    kind: LessonKind | string,
    videoUrl?: string | null,
    content?: string | null,
  ): void {
    if (kind !== LessonKind.practice) return;
    if (this.hasMediaValue(videoUrl) || this.hasMediaValue(content)) {
      throw new BadRequestException(
        'Tiết thực hành không được kèm video hoặc nội dung — chỉ gồm tập câu hỏi.',
      );
    }
  }

  protected async validateLessonOwnership(dto: LessonCreateDto): Promise<void> {
    const hasCourse = Boolean(dto.courseId);
    const hasClass = Boolean(dto.classId);

    if (hasCourse && hasClass) {
      throw new BadRequestException(
        'Tiết học chỉ thuộc chuyên đề cấp khoá HOẶC lớp học, không được cả hai',
      );
    }

    if (!hasCourse && !hasClass) {
      throw new BadRequestException(
        'Tiết học phải thuộc một chuyên đề cấp khoá hoặc một lớp học',
      );
    }

    if (hasCourse && !dto.moduleId) {
      throw new BadRequestException(
        'Tiết học thuộc khoá phải nằm trong một chuyên đề',
      );
    }

    if (hasCourse && dto.moduleId) {
      const courseModule = await this.prisma.module.findUnique({
        where: { id: dto.moduleId },
      });
      if (!courseModule || courseModule.courseId !== dto.courseId) {
        throw new BadRequestException(
          `Chuyên đề ${dto.moduleId} không thuộc khoá ${dto.courseId}`,
        );
      }
    }

    this.assertPracticeHasNoMedia(dto.kind, dto.videoUrl, dto.content);
  }

  protected async validateLessonExists(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson ${lessonId} not found`);
    }
    return lesson;
  }

  protected async validateCourseExists(courseId: string): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException(`Course ${courseId} not found`);
    }
  }

  /**
   * Soạn nội dung cấp khoá (cây Kiến thức, thư viện đề, đáp án).
   * Không dùng assertCanWriteCourseQuestions — quyền đó chỉ cho ngân hàng câu hỏi.
   */
  protected async assertCanManageCourseContent(
    actor: ActionHistoryActor,
    courseId: string,
  ): Promise<void> {
    const courseActor = await this.courseAccess.resolveActor(
      actor.userId,
      actor.roleType,
    );
    await this.courseAccess.assertCanManageCourse(courseActor, courseId);
  }

  /** Course-owned academic content vs class-owned (gia sư lớp). */
  protected async assertCanManageOwnedAcademicContent(
    actor: ActionHistoryActor,
    owner: { courseId: string | null; classId: string | null },
  ): Promise<void> {
    if (owner.classId) {
      await this.validateStaffClassAccess(owner.classId, actor);
      return;
    }
    if (owner.courseId) {
      await this.assertCanManageCourseContent(actor, owner.courseId);
    }
  }

  protected async validateModuleExists(moduleId: string) {
    const courseModule = await this.prisma.module.findUnique({
      where: { id: moduleId },
    });
    if (!courseModule) {
      throw new NotFoundException(`Module ${moduleId} not found`);
    }
    return courseModule;
  }

  protected async validateClassExists(classId: string): Promise<void> {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) {
      throw new NotFoundException(`Class ${classId} not found`);
    }
  }

  protected async validateStaffClassAccess(
    classId: string,
    actor: ActionHistoryActor,
  ): Promise<void> {
    if (actor.roleType === UserRole.admin) return;

    const staffInfo = await this.prisma.staffInfo.findFirst({
      where: { userId: actor.userId },
    });
    if (!staffInfo) {
      throw new ForbiddenException('Staff profile not found');
    }

    const isTeacher = await this.prisma.classTeacher.findFirst({
      where: { classId, teacherId: staffInfo.id, status: 'active' },
    });

    const isAssistant = staffInfo.roles.includes(StaffRole.assistant);

    if (!isTeacher && !isAssistant) {
      throw new ForbiddenException('You do not have access to this class');
    }
  }

  protected async validateStudentClassAccess(
    classId: string,
    studentId: string,
  ): Promise<void> {
    const enrollment = await this.prisma.studentClass.findFirst({
      where: { classId, studentId, status: 'active' },
      include: { class: { select: { contentAccessExpiresAt: true } } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this class');
    }
    if (
      enrollment.class.contentAccessExpiresAt &&
      enrollment.class.contentAccessExpiresAt < new Date()
    ) {
      throw new ForbiddenException('This class has expired');
    }
  }

  /**
   * Block course-level Module/Lesson deletes while any class still
   * references the lesson via ClassContentItem (including hidden items).
   */
  protected async assertLessonsNotUsedByClasses(
    lessonIds: string[],
    entityLabel: 'Chuyên đề' | 'Tiết học',
  ): Promise<void> {
    if (lessonIds.length === 0) return;
    const used = await this.prisma.classContentItem.findMany({
      where: { lessonId: { in: lessonIds } },
      select: {
        classId: true,
        hiddenAt: true,
        class: { select: { name: true } },
      },
    });
    if (used.length === 0) return;

    const byClass = new Map<
      string,
      { name: string; hidden: number; visible: number }
    >();
    for (const row of used) {
      const cur = byClass.get(row.classId) ?? {
        name: row.class.name,
        hidden: 0,
        visible: 0,
      };
      if (row.hiddenAt) cur.hidden += 1;
      else cur.visible += 1;
      byClass.set(row.classId, cur);
    }
    const parts = [...byClass.values()].map((cls) => {
      const bits: string[] = [];
      if (cls.visible) bits.push(`${cls.visible} lần giao đang hiện`);
      if (cls.hidden) bits.push(`${cls.hidden} lần giao đang ẩn`);
      return `${cls.name} (${bits.join(', ')})`;
    });
    throw new ConflictException(
      `Không thể xoá ${entityLabel.toLowerCase()}: còn ${byClass.size} lớp đang tham chiếu — ${parts.join('; ')}.`,
    );
  }
}

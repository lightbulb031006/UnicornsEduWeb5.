import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LessonKind, QuestionType, type UserRole } from 'generated/enums';
import { assignmentDurationMinutes } from 'src/attempt/assignment-window';
import type { ActionHistoryActor } from 'src/course-content/course-content-support.service';
import { CourseContentService } from 'src/course-content/course-content.service';
import { PracticeQuestionLinkService } from 'src/course-content/practice-question-link.service';
import { LmsProfileService } from 'src/lms-profile/lms-profile.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  collectContentImagePaths,
  signContentImages,
} from 'src/question/content-images';
import { signImagePaths } from 'src/question/content-image.interceptor';
import { StaffOperationsAccessService } from 'src/staff-ops/staff-operations-access.service';
import { ExamPdfRendererService } from './exam-pdf-renderer.service';
import { buildExamPrintHtml, type ExamPrintQuestion } from './exam-print-html';

export interface ExamPrintFile {
  pdf: Buffer;
  /** Tên tiết — controller dựng tên file. */
  lessonTitle: string;
}

interface LessonForPrint {
  id: string;
  title: string;
  elective1Name: string | null;
  elective2Name: string | null;
  durationMinutes: number | null;
  courseName: string;
}

const PRINTABLE_TYPES = new Set<string>([
  QuestionType.single_choice,
  QuestionType.true_false_group,
]);

/**
 * Đề in của tiết thực hành (CONTEXT.md — Đề in). Ba đường vào, mỗi đường dùng
 * lại kiểm quyền sẵn có của màn tương ứng; nội dung đề thì luôn giống nhau.
 */
@Injectable()
export class ExamPrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lmsProfile: LmsProfileService,
    private readonly questionLinks: PracticeQuestionLinkService,
    private readonly courseContent: CourseContentService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
    private readonly renderer: ExamPdfRendererService,
  ) {}

  /** Trang tiết cấp khoá: cùng quyền với xem danh sách câu của tiết. */
  async printCourseLesson(
    lessonId: string,
    actor: ActionHistoryActor,
    withAnswers: boolean,
  ): Promise<ExamPrintFile> {
    this.assertEnabled();
    await this.questionLinks.getQuestionsByLessonId(lessonId, actor);
    const lesson = await this.loadLesson(lessonId);
    return this.print(lesson, lesson.durationMinutes, withAnswers);
  }

  /** Lần giao trên lớp, phía dạy: admin/trợ lí hoặc gia sư phụ trách lớp. */
  async printClassAssignment(
    user: { id: string; roleType: UserRole },
    classId: string,
    assignmentId: string,
    withAnswers: boolean,
  ): Promise<ExamPrintFile> {
    this.assertEnabled();
    const actor = await this.staffOperationsAccess.resolveClassViewerActor(
      user.id,
      user.roleType,
    );
    const mode = await this.staffOperationsAccess.resolveClassViewAccessMode(
      actor,
      classId,
    );
    if (mode !== 'admin' && mode !== 'teacher') {
      throw new ForbiddenException(
        'Chỉ gia sư phụ trách lớp hoặc admin mới in đề lần giao.',
      );
    }
    const item = await this.prisma.classContentItem.findFirst({
      where: { id: assignmentId, classId },
      include: { lesson: { select: { id: true, durationMinutes: true } } },
    });
    if (!item?.lesson) throw new NotFoundException('Assignment not found');
    const lesson = await this.loadLesson(item.lesson.id);
    return this.print(lesson, assignmentDurationMinutes(item), withAnswers);
  }

  /** Học sinh: bất cứ lúc nào thấy lần giao (kể cả trước khi bắt đầu), chỉ bản Đề. */
  async printStudentAssignment(
    userId: string,
    classId: string,
    assignmentId: string,
  ): Promise<ExamPrintFile> {
    this.assertEnabled();
    const studentId = await this.courseContent.findStudentIdByUserId(userId);
    if (!studentId) throw new NotFoundException('Student profile not found');
    const item = await this.courseContent.getPracticeAssignmentForStudent(
      classId,
      assignmentId,
      studentId,
    );
    const lesson = await this.loadLesson(item.lesson!.id);
    return this.print(lesson, assignmentDurationMinutes(item), false);
  }

  private assertEnabled(): void {
    if (!this.lmsProfile.config.examPrint) {
      throw new NotFoundException('Instance này không có Đề in.');
    }
  }

  private async loadLesson(lessonId: string): Promise<LessonForPrint> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        kind: true,
        title: true,
        archivedAt: true,
        elective1Name: true,
        elective2Name: true,
        durationMinutes: true,
        course: { select: { name: true } },
        class: { select: { course: { select: { name: true } } } },
      },
    });
    if (!lesson || lesson.archivedAt) {
      throw new NotFoundException('Tiết học không tồn tại');
    }
    if (lesson.kind !== LessonKind.practice) {
      throw new BadRequestException('Chỉ in đề được cho tiết thực hành.');
    }
    return {
      id: lesson.id,
      title: lesson.title,
      elective1Name: lesson.elective1Name,
      elective2Name: lesson.elective2Name,
      durationMinutes: lesson.durationMinutes,
      courseName: lesson.course?.name ?? lesson.class?.course.name ?? '',
    };
  }

  private async loadQuestions(lessonId: string): Promise<ExamPrintQuestion[]> {
    const links = await this.prisma.questionLink.findMany({
      where: { lessonId, question: { deletedAt: null } },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      select: {
        slot: true,
        question: {
          select: {
            type: true,
            content: true,
            options: true,
            correctIndex: true,
            tfAnswerKey: true,
          },
        },
      },
    });
    return links
      .filter((link) => PRINTABLE_TYPES.has(link.question.type))
      .map((link) => ({
        type: link.question.type,
        slot: link.slot,
        content: link.question.content,
        options: Array.isArray(link.question.options)
          ? link.question.options.map((o) => (typeof o === 'string' ? o : ''))
          : [],
        correctIndex: link.question.correctIndex,
        tfAnswerKey: link.question.tfAnswerKey,
      }));
  }

  private async print(
    lesson: LessonForPrint,
    durationMinutes: number | null,
    withAnswers: boolean,
  ): Promise<ExamPrintFile> {
    const questions = await this.loadQuestions(lesson.id);
    if (questions.length === 0) {
      throw new BadRequestException('Tiết chưa có câu hỏi để in.');
    }
    const unsignedHtml = buildExamPrintHtml(
      {
        courseName: lesson.courseName,
        lessonTitle: lesson.title,
        durationMinutes,
        elective1Name: lesson.elective1Name,
        elective2Name: lesson.elective2Name,
        questions,
        withAnswers,
      },
      this.renderer.getKatexCss(),
    );
    const pdf = await this.renderer.render({
      unsignedHtml,
      lessonTitle: lesson.title,
      withAnswers,
      signImages: async (html) =>
        signContentImages(
          html,
          await signImagePaths(collectContentImagePaths(html)),
        ),
    });
    return { pdf, lessonTitle: lesson.title };
  }
}

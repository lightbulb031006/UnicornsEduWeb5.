import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffRole, UserRole } from 'generated/enums';
import { PrismaService } from 'src/prisma/prisma.service';

export interface CourseActor {
  userId: string;
  staffId: string | null;
  roles: StaffRole[];
  /** User tài khoản admin đầy đủ (roleType = admin). */
  isAdminUser: boolean;
}

/** Các staff role được coi là cấp quản lý nội dung khoá (như admin). */
const COURSE_MANAGER_STAFF_ROLES = [
  StaffRole.admin,
  StaffRole.assistant,
  StaffRole.lesson_plan_head,
] as const;

/**
 * Guard phân quyền nội dung Khoá học — dùng lại cho mọi ticket nội dung khoá về sau
 * (cây Chuyên đề/Tiết học, Ngân hàng câu hỏi, tiết thực hành cấp khoá...).
 *
 * Quy tắc:
 * - Admin đầy đủ, Trợ lí (`assistant`), Trưởng giáo án (`lesson_plan_head`) quản lý
 *   được nội dung của MỌI khoá (manager).
 * - Thành viên `lesson_plan` chỉ thấy/sửa nội dung khoá mình được gán
 *   (qua `CourseLessonPlanMember`).
 * - Gia sư đang dạy lớp thuộc khoá X KHÔNG vì thế mà sửa được nội dung cấp khoá của X
 *   — muốn sửa phải là manager hoặc thành viên đội giáo án của khoá đó.
 */
@Injectable()
export class CourseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve actor từ userId + roleType (đọc staff profile + roles). */
  async resolveActor(userId: string, roleType: UserRole): Promise<CourseActor> {
    const staff = await this.prisma.staffInfo.findUnique({
      where: { userId },
      select: { id: true, roles: true },
    });
    return {
      userId,
      staffId: staff?.id ?? null,
      roles: staff?.roles ?? [],
      isAdminUser: roleType === UserRole.admin,
    };
  }

  isManager(actor: CourseActor): boolean {
    if (actor.isAdminUser) return true;
    return COURSE_MANAGER_STAFF_ROLES.some((role) =>
      actor.roles.includes(role),
    );
  }

  isLessonPlanMember(actor: CourseActor): boolean {
    return actor.roles.includes(StaffRole.lesson_plan);
  }

  /**
   * Phạm vi khoá mà actor được *liệt kê tên* (dropdown, danh sách khoá).
   *
   * Khác `resolveViewableCourseIds`: hàm kia trả lời "ai được quản lý nội dung"
   * và trả mảng rỗng cho teacher / training / kế toán / CSKH. Hàm này trả `null`
   * (mọi khoá) cho mọi role, **trừ** `lesson_plan` thuần — có role `lesson_plan`
   * mà không kèm role quản lý (`admin` / `assistant` / `lesson_plan_head`).
   * Tên khoá không nhạy cảm; chặn sửa nội dung là việc của gate route + guard.
   *
   * Trả `null` = mọi khoá. Trả mảng (kể cả rỗng) = chỉ các id đó.
   * Actor không có staff profile không crash: không phải `lesson_plan` thuần thì
   * vẫn nhận mọi khoá; `lesson_plan` thuần mà thiếu `staffId` thì nhận mảng rỗng.
   */
  async resolveListableCourseIds(actor: CourseActor): Promise<string[] | null> {
    if (this.isManager(actor) || !this.isLessonPlanMember(actor)) {
      return null;
    }
    if (!actor.staffId) {
      return [];
    }
    const memberships = await this.prisma.courseLessonPlanMember.findMany({
      where: { staffId: actor.staffId },
      select: { courseId: true },
    });
    return memberships.map((m) => m.courseId);
  }

  /**
   * Phạm vi khoá mà actor được xem nội dung.
   * Trả `null` = mọi khoá (manager). Trả mảng rỗng = không khoá nào.
   * Thành viên `lesson_plan` thuần (không phải manager) chỉ được các khoá được gán.
   */
  async resolveViewableCourseIds(actor: CourseActor): Promise<string[] | null> {
    if (this.isManager(actor)) {
      return null;
    }
    if (!actor.staffId || !this.isLessonPlanMember(actor)) {
      return [];
    }
    const memberships = await this.prisma.courseLessonPlanMember.findMany({
      where: { staffId: actor.staffId },
      select: { courseId: true },
    });
    return memberships.map((m) => m.courseId);
  }

  /** Kiểm tra actor có quyền xem nội dung một khoá cụ thể. */
  async canViewCourse(actor: CourseActor, courseId: string): Promise<boolean> {
    if (this.isManager(actor)) {
      return true;
    }
    if (!actor.staffId || !this.isLessonPlanMember(actor)) {
      return false;
    }
    const membership = await this.prisma.courseLessonPlanMember.findUnique({
      where: {
        courseId_staffId: { courseId, staffId: actor.staffId },
      },
      select: { id: true },
    });
    return Boolean(membership);
  }

  /** Kiểm tra actor có quyền SỬA nội dung (cấu hình) một khoá. */
  async canManageCourse(
    actor: CourseActor,
    courseId: string,
  ): Promise<boolean> {
    return this.canViewCourse(actor, courseId);
  }

  async assertCanManageCourse(
    actor: CourseActor,
    courseId: string,
    courseName?: string,
  ): Promise<void> {
    if (await this.canManageCourse(actor, courseId)) {
      return;
    }
    const label = courseName ? `của khoá "${courseName}"` : 'của khoá này';
    throw new ForbiddenException(
      `Bạn không có quyền sửa nội dung ${label}. Chỉ admin, trợ lí, trưởng giáo án, hoặc thành viên đội giáo án của khoá mới được sửa.`,
    );
  }

  /**
   * Quyền GHI câu hỏi vào ngân hàng của khoá.
   * Manager + đội giáo án gán khoá: như canManageCourse.
   * Gia sư: chỉ khoá của lớp đang dạy (class_teachers active).
   */
  async canWriteCourseQuestions(
    actor: CourseActor,
    courseId: string,
  ): Promise<boolean> {
    if (await this.canManageCourse(actor, courseId)) {
      return true;
    }
    if (!actor.staffId || !actor.roles.includes(StaffRole.teacher)) {
      return false;
    }
    const teaching = await this.prisma.classTeacher.findFirst({
      where: {
        teacherId: actor.staffId,
        status: 'active',
        class: { courseId },
      },
      select: { id: true },
    });
    return Boolean(teaching);
  }

  async assertCanWriteCourseQuestions(
    actor: CourseActor,
    courseId: string,
  ): Promise<void> {
    if (await this.canWriteCourseQuestions(actor, courseId)) {
      return;
    }
    throw new ForbiddenException(
      'Gia sư chỉ nhập được vào ngân hàng của khoá mà lớp mình đang dạy thuộc về.',
    );
  }

  /** Kiểm tra khoá tồn tại — ném NotFound nếu không. */
  async assertCourseExists(courseId: string): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) {
      throw new NotFoundException('Không tìm thấy khoá học.');
    }
  }
}

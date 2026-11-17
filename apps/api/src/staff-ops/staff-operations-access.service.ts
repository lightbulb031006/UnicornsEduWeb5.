import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffRole, UserRole } from '../../generated/enums';
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyStaffRole } from '../common/staff-role-policy';
import { hasTrainingAccess } from '../common/training-access';

export interface StaffOperationsActor {
  id: string;
  roles: StaffRole[];
}

export type StaffClassViewAccessMode =
  | 'admin'
  | 'teacher'
  | 'customer_care'
  | 'training_manager'
  /**
   * #277: Trưởng ban Đào tạo xem lớp không do mình dạy / quản lý — chỉ xem
   * (thông tin lớp, gia sư, lương gia sư theo lớp, lịch, lịch sử buổi không
   * tiền). Không phải quyền thao tác buổi: việc của gia sư đi qua
   * `resolveClassWorkAccess`, chấm bài / in đề chỉ nhận admin/teacher/
   * training_manager.
   */
  | 'training_head';
export type StaffCalendarAccessMode = 'admin' | 'teacher' | 'training';

export interface StaffClassAccess {
  mode: StaffClassViewAccessMode;
  /** Admin hệ thống hoặc staff mang role admin. */
  isAdmin: boolean;
  /** Mang role gia sư và đang được giao dạy lớp. */
  isClassTeacher: boolean;
  /** Ban Đào tạo được giao làm Quản lý lớp của lớp. */
  isClassManager: boolean;
  /**
   * #277: mang role Trưởng ban Đào tạo — xem mọi lớp (không học phí, không
   * trợ cấp từng buổi) và thấy lương mọi gia sư theo lớp. Admin → `false`.
   */
  isTrainingHead: boolean;
}

/**
 * #277 — Trưởng ban Đào tạo (biên bản 12/11/2026 mục 7). Admin không tính
 * (đã toàn quyền) để các nhánh redact không đụng góc nhìn Admin.
 */
export function isTrainingHeadActor(
  roles: readonly StaffRole[] | null | undefined,
): boolean {
  return (
    Boolean(roles?.includes(StaffRole.training_head)) &&
    !roles?.includes(StaffRole.admin)
  );
}

/**
 * Góc nhìn «quản lý» trên lớp (#276/#277): Quản lý lớp của lớp hoặc Trưởng ban
 * Đào tạo thấy lương mọi gia sư + mọi buổi (không tiền buổi, không học phí).
 */
export function seesClassAsTrainingManager(
  access: Pick<StaffClassAccess, 'isClassManager' | 'isTrainingHead'>,
): boolean {
  return access.isClassManager || access.isTrainingHead;
}

export interface StaffClassWorkAccess {
  /** `staff_info.id` của actor; `null` với user admin không có hồ sơ staff. */
  staffId: string | null;
  isAdmin: boolean;
  isClassTeacher: boolean;
  isClassManager: boolean;
}

/** Admin hoặc Quản lý lớp làm được trên mọi buổi của lớp (#275). */
export function canWorkOnAllClassSessions(
  access: Pick<StaffClassWorkAccess, 'isAdmin' | 'isClassManager'>,
): boolean {
  return access.isAdmin || access.isClassManager;
}

/**
 * Phạm vi chỉnh gia sư + lương gia sư theo lớp (#276) — dùng cho thêm / cho
 * nghỉ gia sư và `PATCH /staff-ops/classes/:id/teacher-pay`.
 */
export interface StaffClassTeacherManagementScope {
  /**
   * `staff_info.id` của actor không phải Admin: không được thêm / cho nghỉ /
   * sửa lương dòng của chính mình (luật #265). `null` với Admin.
   */
  lockedTeacherId: string | null;
  isAdmin: boolean;
  /** Ban Đào tạo được giao làm Quản lý lớp của lớp. */
  isClassManager: boolean;
  /** #277: Trưởng ban Đào tạo — chỉnh gia sư + lương gia sư trên mọi lớp. */
  isTrainingHead: boolean;
}

/**
 * Ai được thêm / bớt gia sư và sửa lương gia sư theo lớp (biên bản 12/11/2026
 * mục 5.2 + 7): Admin, Quản lý lớp trên lớp mình (#276), Trưởng ban Đào tạo
 * trên **mọi lớp** (#277). Phần «không sửa lương của chính mình» đi qua
 * `lockedTeacherId` (`class-teacher-pay-policy.ts`).
 */
export function canManageClassTeachersAndPay(
  access: Pick<
    StaffClassTeacherManagementScope,
    'isAdmin' | 'isClassManager' | 'isTrainingHead'
  >,
): boolean {
  return access.isAdmin || access.isClassManager || access.isTrainingHead;
}

/** Gia sư chỉ buổi do mình dạy; Admin / Quản lý lớp mọi buổi của lớp. */
export function canWorkOnClassSession(
  access: StaffClassWorkAccess,
  sessionTeacherId: string | null | undefined,
): boolean {
  if (canWorkOnAllClassSessions(access)) {
    return true;
  }
  return (
    access.isClassTeacher &&
    access.staffId !== null &&
    sessionTeacherId === access.staffId
  );
}

/**
 * Hệ số / Dạy thử: Admin, hoặc gia sư trên buổi do chính mình dạy. Quản lý lớp
 * không đổi hệ số / dạy thử trên buổi của gia sư khác (#275).
 */
export function canEditClassSessionCoefficient(
  access: StaffClassWorkAccess,
  sessionTeacherId: string | null | undefined,
): boolean {
  if (access.isAdmin) {
    return true;
  }
  return (
    access.isClassTeacher &&
    access.staffId !== null &&
    sessionTeacherId === access.staffId
  );
}

const ELEVATED_CLASS_ACCESS_ROLES = [
  StaffRole.admin,
  StaffRole.accountant_income,
  StaffRole.accountant_expense,
] as const;

@Injectable()
export class StaffOperationsAccessService {
  constructor(private readonly prisma: PrismaService) {}

  hasElevatedClassAccess(roles: StaffRole[]) {
    return hasAnyStaffRole(roles, ELEVATED_CLASS_ACCESS_ROLES);
  }

  private async resolveStaffActor(
    userId: string,
  ): Promise<StaffOperationsActor> {
    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId },
      select: {
        id: true,
        roles: true,
      },
    });

    if (!staff) {
      throw new ForbiddenException(
        'Chỉ nhân sự có hồ sơ staff mới được dùng màn vận hành lớp học.',
      );
    }

    return staff;
  }

  async resolveActor(
    userId: string,
    roleType: UserRole,
  ): Promise<StaffOperationsActor> {
    if (roleType === UserRole.admin) {
      return {
        id: userId,
        roles: [],
      };
    }

    const staff = await this.resolveStaffActor(userId);

    if (
      !staff.roles.includes(StaffRole.teacher) &&
      !hasTrainingAccess(staff.roles) &&
      !this.hasElevatedClassAccess(staff.roles)
    ) {
      throw new ForbiddenException(
        'Màn /staff hiện chỉ mở cho teacher, Đào Tạo, kế toán, hoặc staff admin.',
      );
    }

    return staff;
  }

  async resolveCalendarActor(
    userId: string,
    roleType: UserRole,
  ): Promise<
    StaffOperationsActor & { calendarAccessMode: StaffCalendarAccessMode }
  > {
    if (roleType === UserRole.admin) {
      return {
        id: userId,
        roles: [],
        calendarAccessMode: 'admin',
      };
    }

    const staff = await this.resolveStaffActor(userId);

    if (hasTrainingAccess(staff.roles)) {
      return { ...staff, calendarAccessMode: 'training' };
    }

    if (staff.roles.includes(StaffRole.teacher)) {
      return { ...staff, calendarAccessMode: 'teacher' };
    }

    throw new ForbiddenException(
      'Lịch staff hiện chỉ mở cho teacher hoặc Đào Tạo.',
    );
  }

  async resolveClassViewerActor(
    userId: string,
    roleType: UserRole,
  ): Promise<StaffOperationsActor> {
    if (roleType === UserRole.admin) {
      return {
        id: userId,
        roles: [],
      };
    }

    const staff = await this.resolveStaffActor(userId);

    if (
      !staff.roles.includes(StaffRole.teacher) &&
      !staff.roles.includes(StaffRole.customer_care) &&
      !hasTrainingAccess(staff.roles) &&
      !this.hasElevatedClassAccess(staff.roles)
    ) {
      throw new ForbiddenException(
        'Màn chi tiết lớp chỉ mở cho teacher, CSKH, Đào Tạo, kế toán, hoặc staff admin.',
      );
    }

    return staff;
  }

  /**
   * Quyền chỉnh gia sư / lương gia sư của lớp từ staff workspace (#276).
   * Admin (user hoặc staff role): toàn quyền (#267: Trợ lí không còn quyền này).
   * Quản lý lớp: chỉ lớp có `training_manager_staff_id` là chính mình.
   * #277: Trưởng ban Đào tạo: mọi lớp. Cả hai không được đụng dòng / lương của
   * chính mình (`lockedTeacherId`). Predicate quyền nằm ở
   * `canManageClassTeachersAndPay`.
   */
  async resolveClassTeacherManagerScope(
    userId: string,
    roleType: UserRole,
    classId: string,
  ): Promise<StaffClassTeacherManagementScope> {
    if (roleType === UserRole.admin) {
      return {
        lockedTeacherId: null,
        isAdmin: true,
        isClassManager: false,
        isTrainingHead: false,
      };
    }

    const staff = await this.resolveStaffActor(userId);
    const isAdmin = staff.roles.includes(StaffRole.admin);
    const isTrainingHead = isTrainingHeadActor(staff.roles);
    const isClassManager =
      !isAdmin && (await this.isManagerOfClass(staff, classId));

    if (
      !canManageClassTeachersAndPay({ isAdmin, isClassManager, isTrainingHead })
    ) {
      throw new ForbiddenException(
        'Chỉ Admin, Trưởng ban Đào tạo hoặc Quản lý lớp (Đào Tạo) mới được chỉnh gia sư và lương gia sư của lớp này.',
      );
    }

    return {
      lockedTeacherId: isAdmin ? null : staff.id,
      isAdmin,
      isClassManager,
      isTrainingHead,
    };
  }

  async assertTeacherAssignedToClass(
    teacherId: string,
    classId: string,
  ): Promise<void> {
    const assignment = await this.prisma.classTeacher.findUnique({
      where: {
        classId_teacherId: {
          classId,
          teacherId,
        },
      },
      select: {
        teacherId: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Class not found');
    }
  }

  /**
   * Quyền xem lớp + các cờ hợp quyền (#275). `mode` giữ thứ tự cố định
   * admin → teacher → customer_care → training_manager → training_head và chỉ
   * dùng để chọn cách redact dữ liệu xem; quyền thao tác đọc từ các cờ
   * `isClassTeacher` / `isClassManager` nên người kiêm gia sư + Quản lý lớp
   * được hợp quyền. #277: Trưởng ban Đào tạo xem được mọi lớp (mode
   * `training_head` khi không khớp nhánh nào trước đó).
   */
  async resolveClassAccess(
    actor: StaffOperationsActor,
    classId: string,
  ): Promise<StaffClassAccess> {
    if (actor.roles.length === 0) {
      return {
        mode: 'admin',
        isAdmin: true,
        isClassTeacher: false,
        isClassManager: false,
        isTrainingHead: false,
      };
    }

    const isAdmin = actor.roles.includes(StaffRole.admin);
    const isTrainingHead = isTrainingHeadActor(actor.roles);
    const [isClassTeacher, isClassManager] = await Promise.all([
      this.isTeacherOfClass(actor, classId),
      this.isManagerOfClass(actor, classId),
    ]);
    const flags = { isAdmin, isClassTeacher, isClassManager, isTrainingHead };

    if (this.hasElevatedClassAccess(actor.roles)) {
      return { mode: 'admin', ...flags };
    }

    if (isClassTeacher) {
      return { mode: 'teacher', ...flags };
    }

    if (actor.roles.includes(StaffRole.customer_care)) {
      const customerCareAssignment =
        await this.prisma.customerCareService.findFirst({
          where: {
            staffId: actor.id,
            student: {
              studentClasses: {
                some: {
                  classId,
                },
              },
            },
          },
          select: {
            id: true,
          },
        });

      if (customerCareAssignment) {
        return { mode: 'customer_care', ...flags };
      }
    }

    if (isClassManager) {
      return { mode: 'training_manager', ...flags };
    }

    if (isTrainingHead) {
      // Lớp không tồn tại → 404 như các nhánh khác (không lộ lớp không có).
      const classExists = await this.prisma.class.findUnique({
        where: { id: classId },
        select: { id: true },
      });
      if (classExists) {
        return { mode: 'training_head', ...flags };
      }
    }

    throw new NotFoundException('Class not found');
  }

  async resolveClassViewAccessMode(
    actor: StaffOperationsActor,
    classId: string,
  ): Promise<StaffClassViewAccessMode> {
    return (await this.resolveClassAccess(actor, classId)).mode;
  }

  /**
   * Quyền thao tác trên buổi học / việc của gia sư trong một lớp (#275):
   * Admin (user admin hoặc staff role admin), gia sư được giao lớp, hoặc Quản lý
   * lớp (Ban Đào tạo được giao làm quản lý lớp). Hợp quyền: người kiêm gia sư và
   * Quản lý lớp có cả hai cờ. Kế toán / CSKH / Ban Đào tạo không quản lý lớp → 403.
   */
  async resolveClassWorkAccess(
    userId: string,
    roleType: UserRole,
    classId: string,
  ): Promise<StaffClassWorkAccess> {
    if (roleType === UserRole.admin) {
      return {
        staffId: null,
        isAdmin: true,
        isClassTeacher: false,
        isClassManager: false,
      };
    }

    const staff = await this.resolveStaffActor(userId);

    if (staff.roles.includes(StaffRole.admin)) {
      return {
        staffId: staff.id,
        isAdmin: true,
        isClassTeacher: false,
        isClassManager: false,
      };
    }

    const [isClassTeacher, isClassManager] = await Promise.all([
      this.isTeacherOfClass(staff, classId),
      this.isManagerOfClass(staff, classId),
    ]);

    if (!isClassTeacher && !isClassManager) {
      throw new ForbiddenException(
        'Chỉ Admin, gia sư của lớp hoặc Quản lý lớp mới được thao tác trên lớp này.',
      );
    }

    return {
      staffId: staff.id,
      isAdmin: false,
      isClassTeacher,
      isClassManager,
    };
  }

  private async isTeacherOfClass(
    actor: StaffOperationsActor,
    classId: string,
  ): Promise<boolean> {
    if (!actor.roles.includes(StaffRole.teacher)) {
      return false;
    }

    const teacherAssignment = await this.prisma.classTeacher.findUnique({
      where: {
        classId_teacherId: {
          classId,
          teacherId: actor.id,
        },
      },
      select: {
        teacherId: true,
      },
    });

    return Boolean(teacherAssignment);
  }

  private async isManagerOfClass(
    actor: StaffOperationsActor,
    classId: string,
  ): Promise<boolean> {
    if (!hasTrainingAccess(actor.roles)) {
      return false;
    }

    const managedClass = await this.prisma.class.findFirst({
      where: {
        id: classId,
        trainingManagerStaffId: actor.id,
      },
      select: { id: true },
    });

    return Boolean(managedClass);
  }

  async resolveSingleTeacherForClass(classId: string): Promise<string> {
    const classTeachers = await this.prisma.classTeacher.findMany({
      where: { classId },
      select: {
        teacherId: true,
      },
    });

    if (classTeachers.length !== 1) {
      throw new BadRequestException(
        'Lớp phải có đúng 1 gia sư phụ trách trước khi Staff có thể tạo buổi học.',
      );
    }

    return classTeachers[0].teacherId;
  }
}

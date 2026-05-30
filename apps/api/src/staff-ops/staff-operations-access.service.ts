import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffRole, UserRole } from '../../generated/enums';
import { PrismaService } from '../prisma/prisma.service';

export interface StaffOperationsActor {
  id: string;
  roles: StaffRole[];
}

export type StaffClassViewAccessMode = 'admin' | 'teacher' | 'customer_care';
export type StaffCalendarAccessMode = 'admin' | 'teacher' | 'training';

const ELEVATED_CLASS_ACCESS_ROLES = [
  StaffRole.admin,
  StaffRole.assistant,
  StaffRole.accountant,
  StaffRole.accountant_income,
  StaffRole.accountant_expense,
] as const;

function hasAnyStaffRole(
  roles: StaffRole[],
  allowedRoles: readonly StaffRole[],
) {
  return roles.some((role) => allowedRoles.includes(role));
}

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
      !this.hasElevatedClassAccess(staff.roles)
    ) {
      throw new ForbiddenException(
        'Màn /staff hiện chỉ mở cho teacher, trợ lí, kế toán, hoặc staff admin.',
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

    if (staff.roles.includes(StaffRole.training)) {
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
      !this.hasElevatedClassAccess(staff.roles)
    ) {
      throw new ForbiddenException(
        'Màn chi tiết lớp chỉ mở cho teacher, CSKH, trợ lí, kế toán, hoặc staff admin.',
      );
    }

    return staff;
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

  async resolveClassViewAccessMode(
    actor: StaffOperationsActor,
    classId: string,
  ): Promise<StaffClassViewAccessMode> {
    if (actor.roles.length === 0) {
      return 'admin';
    }

    if (this.hasElevatedClassAccess(actor.roles)) {
      return 'admin';
    }

    if (actor.roles.includes(StaffRole.teacher)) {
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

      if (teacherAssignment) {
        return 'teacher';
      }
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
        return 'customer_care';
      }
    }

    throw new NotFoundException('Class not found');
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

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { StaffRole, UserRole } from 'generated/enums';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LessonManagementGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    if (user?.roleType === UserRole.admin) {
      return true;
    }

    if (!user?.id) {
      throw new ForbiddenException(
        'Chỉ admin hoặc staff.lesson_plan_head mới được quản lý giáo án.',
      );
    }

    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId: user.id },
      select: {
        id: true,
        roles: true,
      },
    });

    if (!staff) {
      if (user.roleType !== UserRole.staff) {
        throw new ForbiddenException(
          'Chỉ admin hoặc staff.lesson_plan_head mới được quản lý giáo án.',
        );
      }

      throw new ForbiddenException(
        'Tài khoản staff hiện tại chưa có hồ sơ nhân sự để dùng màn quản lý giáo án.',
      );
    }

    if (
      !staff.roles.includes(StaffRole.admin) &&
      !staff.roles.includes(StaffRole.lesson_plan_head)
    ) {
      throw new ForbiddenException(
        'Màn quản lý giáo án chỉ mở cho Admin hoặc staff có role lesson_plan_head.',
      );
    }

    return true;
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffRole, UserRole } from 'generated/enums';
import type { ClassCoverImageDto } from 'src/dtos/class.dto';
import { hasSaleCsHeadAccess } from 'src/common/sale-cs-head-access';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  isTrainingHeadActor,
  StaffOperationsAccessService,
} from 'src/staff-ops/staff-operations-access.service';
import { CLASS_COVER_STORAGE_BUCKET } from 'src/storage/media-buckets';
import {
  buildClassCoverPath,
  CLASS_COVER_FIELD_LABEL,
  createClassCoverSignedUrl,
} from './class-cover.storage';
import {
  removeStorageObjects,
  uploadStorageObject,
  validateImageFile,
  type UploadableFile,
} from 'src/storage/supabase-storage';

@Injectable()
export class ClassCoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
  ) {}

  /**
   * Quyền upload/thay/gỡ ảnh bìa: admin và các trưởng (Trưởng phòng Sale & CSKH,
   * Trưởng ban Đào tạo — cùng phạm vi xem mọi lớp #272/#277) với mọi lớp; Gia sư
   * đứng lớp (`class_teachers.status = 'active'`) và Quản lý lớp
   * (`classes.training_manager_staff_id`) chỉ với lớp của mình. Chỉ ảnh bìa —
   * các trưởng vẫn không quản lý lớp (gia sư, học phí, lịch…).
   */
  async canManage(
    userId: string,
    roleType: UserRole,
    classId: string,
  ): Promise<boolean> {
    if (roleType === UserRole.admin) {
      return true;
    }

    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId },
      select: { id: true, roles: true },
    });
    if (!staff) {
      return false;
    }
    if (staff.roles.includes(StaffRole.admin)) {
      return true;
    }
    if (
      hasSaleCsHeadAccess(staff.roles) ||
      isTrainingHeadActor(staff.roles)
    ) {
      return true;
    }

    const ownedClass = await this.prisma.class.findFirst({
      where: {
        id: classId,
        OR: [
          { trainingManagerStaffId: staff.id },
          { teachers: { some: { teacherId: staff.id, status: 'active' } } },
        ],
      },
      select: { id: true },
    });
    return Boolean(ownedClass);
  }

  async getCover(
    userId: string,
    roleType: UserRole,
    classId: string,
  ): Promise<ClassCoverImageDto> {
    await this.assertCanView(userId, roleType, classId);
    const cls = await this.findClassOrThrow(classId);
    return {
      coverImageUrl: await createClassCoverSignedUrl(cls.coverImagePath),
      canManage: await this.canManage(userId, roleType, classId),
    };
  }

  async upload(
    userId: string,
    roleType: UserRole,
    classId: string,
    file: UploadableFile | undefined,
  ): Promise<ClassCoverImageDto> {
    // Kiểm quyền trước khi tra lớp để staff không có quyền không dò được lớp nào tồn tại.
    await this.assertCanManage(userId, roleType, classId);
    const cls = await this.findClassOrThrow(classId);
    if (!file) {
      throw new BadRequestException('Vui lòng chọn ảnh bìa để tải lên.');
    }
    validateImageFile(file, CLASS_COVER_FIELD_LABEL);

    const coverImagePath = buildClassCoverPath(classId, file.mimetype);
    await uploadStorageObject({
      bucket: CLASS_COVER_STORAGE_BUCKET,
      path: coverImagePath,
      body: file.buffer,
      contentType: file.mimetype,
      upsert: true,
    });
    await this.prisma.class.update({
      where: { id: classId },
      data: { coverImagePath },
    });
    if (cls.coverImagePath && cls.coverImagePath !== coverImagePath) {
      await removeStorageObjects({
        bucket: CLASS_COVER_STORAGE_BUCKET,
        paths: [cls.coverImagePath],
      }).catch(() => undefined);
    }

    return {
      coverImageUrl: await createClassCoverSignedUrl(coverImagePath),
      canManage: true,
    };
  }

  async remove(
    userId: string,
    roleType: UserRole,
    classId: string,
  ): Promise<ClassCoverImageDto> {
    await this.assertCanManage(userId, roleType, classId);
    const cls = await this.findClassOrThrow(classId);
    if (cls.coverImagePath) {
      // Gỡ path trong DB trước; file storage xoá best-effort để DB không trỏ tới object đã mất.
      await this.prisma.class.update({
        where: { id: classId },
        data: { coverImagePath: null },
      });
      await removeStorageObjects({
        bucket: CLASS_COVER_STORAGE_BUCKET,
        paths: [cls.coverImagePath],
      }).catch(() => undefined);
    }
    return { coverImageUrl: null, canManage: true };
  }

  private async assertCanView(
    userId: string,
    roleType: UserRole,
    classId: string,
  ) {
    if (roleType === UserRole.admin) {
      return;
    }
    // #272: Trưởng phòng Sale & CSKH xem chi tiết mọi lớp qua `/class/:id` nhưng
    // không thuộc nhóm của màn staff-ops → cho xem ảnh bìa riêng ở đây, không
    // nới `resolveClassViewerActor` (dùng chung cho buổi học, khảo sát, bài làm).
    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId },
      select: { roles: true },
    });
    if (hasSaleCsHeadAccess(staff?.roles)) {
      return;
    }
    const actor = await this.staffOperationsAccess.resolveClassViewerActor(
      userId,
      roleType,
    );
    await this.staffOperationsAccess.resolveClassViewAccessMode(actor, classId);
  }

  private async assertCanManage(
    userId: string,
    roleType: UserRole,
    classId: string,
  ) {
    if (!(await this.canManage(userId, roleType, classId))) {
      throw new ForbiddenException(
        'Chỉ admin, các trưởng, Gia sư đứng lớp hoặc Quản lý lớp mới được đổi ảnh bìa lớp này.',
      );
    }
  }

  private async findClassOrThrow(classId: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, coverImagePath: true },
    });
    if (!cls) {
      throw new NotFoundException('Class not found');
    }
    return cls;
  }
}

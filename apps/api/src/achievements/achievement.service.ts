import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  createSignedStorageUrl,
  removeStorageObjects,
  uploadStorageObject,
  type UploadableFile,
  validateImageFile,
} from '../storage/supabase-storage';
import {
  bakeDiagonalWatermark,
  buildAchievementWatermarkedPath,
} from '../storage/image-watermark';
import {
  ACHIEVEMENT_PUBLIC_BUCKET,
  ACHIEVEMENT_STORAGE_BUCKET,
} from '../storage/media-buckets';
import type {
  CreateAchievementDto,
  CreateStudentAchievementDto,
  ReorderAchievementsDto,
  UpdateAchievementDto,
  UpdateStudentAchievementDto,
} from '../dtos/achievement.dto';
import { AchievementLevel } from 'generated/enums';
import { deriveStudentAchievementTitle } from './achievement-landing.mapper';

const ACHIEVEMENT_SIGNED_URL_TTL_SECONDS = 60 * 60;

export type AchievementOwnerKind = 'staff' | 'student';

type StaffAchievementRow = {
  id: string;
  title: string;
  imagePath: string | null;
  imageWatermarkedPath?: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type StudentAchievementRow = {
  id: string;
  award: string;
  exam: string;
  year: number;
  level: AchievementLevel;
  courseLabel: string | null;
  imagePath: string | null;
  imageWatermarkedPath?: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AchievementService {
  constructor(private readonly prisma: PrismaService) {}

  private extensionForMime(mimetype: string): string {
    if (mimetype === 'image/png') return 'png';
    if (mimetype === 'image/webp') return 'webp';
    return 'jpg';
  }

  private buildImageStoragePath(
    ownerKind: AchievementOwnerKind,
    ownerId: string,
    achievementId: string,
    mimetype: string,
  ) {
    return `${ownerKind}/${ownerId}/${achievementId}.${this.extensionForMime(mimetype)}`;
  }

  private async toStaffDto(row: StaffAchievementRow) {
    const imageUrl = await createSignedStorageUrl({
      bucket: ACHIEVEMENT_STORAGE_BUCKET,
      path: row.imagePath,
      expiresIn: ACHIEVEMENT_SIGNED_URL_TTL_SECONDS,
    });

    return {
      id: row.id,
      title: row.title,
      award: null,
      exam: null,
      year: null,
      level: null,
      courseLabel: null,
      imagePath: row.imagePath,
      imageUrl,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async toStudentDto(row: StudentAchievementRow) {
    const imageUrl = await createSignedStorageUrl({
      bucket: ACHIEVEMENT_STORAGE_BUCKET,
      path: row.imagePath,
      expiresIn: ACHIEVEMENT_SIGNED_URL_TTL_SECONDS,
    });

    return {
      id: row.id,
      title: deriveStudentAchievementTitle(row.award, row.exam),
      award: row.award,
      exam: row.exam,
      year: row.year,
      level: row.level,
      courseLabel: row.courseLabel,
      imagePath: row.imagePath,
      imageUrl,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async toStaffDtoList(rows: StaffAchievementRow[]) {
    return Promise.all(rows.map((row) => this.toStaffDto(row)));
  }

  private async toStudentDtoList(rows: StudentAchievementRow[]) {
    return Promise.all(rows.map((row) => this.toStudentDto(row)));
  }

  private normalizeTitle(title: string) {
    const trimmed = title.trim();
    if (!trimmed) {
      throw new BadRequestException('Tiêu đề thành tích không được để trống.');
    }
    return trimmed;
  }

  private normalizeRequiredText(value: string, label: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} không được để trống.`);
    }
    return trimmed;
  }

  private normalizeCourseLabel(value: string | null | undefined) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeStudentFields(input: {
    award: string;
    exam: string;
    year: number;
    level: AchievementLevel;
    courseLabel?: string | null;
  }) {
    return {
      award: this.normalizeRequiredText(input.award, 'Giải thưởng'),
      exam: this.normalizeRequiredText(input.exam, 'Kỳ thi'),
      year: input.year,
      level: input.level,
      courseLabel: this.normalizeCourseLabel(input.courseLabel) ?? null,
    };
  }

  async resolveStaffIdForUser(userId: string): Promise<string> {
    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!staff) {
      throw new NotFoundException('Không tìm thấy hồ sơ nhân sự liên kết.');
    }
    return staff.id;
  }

  private async assertStaffExists(staffId: string) {
    const staff = await this.prisma.staffInfo.findUnique({
      where: { id: staffId },
      select: { id: true },
    });
    if (!staff) {
      throw new NotFoundException('Staff not found.');
    }
  }

  private async assertStudentExists(studentId: string) {
    const student = await this.prisma.studentInfo.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) {
      throw new NotFoundException('Student not found.');
    }
  }

  async listStaffAchievements(staffId: string) {
    await this.assertStaffExists(staffId);
    const rows = await this.prisma.staffAchievement.findMany({
      where: { staffId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return this.toStaffDtoList(rows);
  }

  async listStudentAchievements(studentId: string) {
    await this.assertStudentExists(studentId);
    const rows = await this.prisma.studentAchievement.findMany({
      where: { studentId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return this.toStudentDtoList(rows);
  }

  async createStaffAchievement(staffId: string, dto: CreateAchievementDto) {
    await this.assertStaffExists(staffId);
    const title = this.normalizeTitle(dto.title);
    const sortOrder = dto.sortOrder ?? (await this.nextStaffSortOrder(staffId));

    const row = await this.prisma.staffAchievement.create({
      data: { staffId, title, sortOrder },
    });
    return this.toStaffDto(row);
  }

  async createStudentAchievement(
    studentId: string,
    dto: CreateStudentAchievementDto,
  ) {
    await this.assertStudentExists(studentId);
    const fields = this.normalizeStudentFields(dto);
    const sortOrder =
      dto.sortOrder ?? (await this.nextStudentSortOrder(studentId));

    const row = await this.prisma.studentAchievement.create({
      data: { studentId, ...fields, sortOrder },
    });
    return this.toStudentDto(row);
  }

  private async nextStaffSortOrder(staffId: string) {
    const last = await this.prisma.staffAchievement.findFirst({
      where: { staffId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  private async nextStudentSortOrder(studentId: string) {
    const last = await this.prisma.studentAchievement.findFirst({
      where: { studentId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  async updateStaffAchievement(
    staffId: string,
    achievementId: string,
    dto: UpdateAchievementDto,
  ) {
    const existing = await this.prisma.staffAchievement.findFirst({
      where: { id: achievementId, staffId },
    });
    if (!existing) {
      throw new NotFoundException('Achievement not found.');
    }

    const data: { title?: string; sortOrder?: number } = {};
    if (dto.title !== undefined) {
      data.title = this.normalizeTitle(dto.title);
    }
    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }

    const row = await this.prisma.staffAchievement.update({
      where: { id: achievementId },
      data,
    });
    return this.toStaffDto(row);
  }

  async updateStudentAchievement(
    studentId: string,
    achievementId: string,
    dto: UpdateStudentAchievementDto,
  ) {
    const existing = await this.prisma.studentAchievement.findFirst({
      where: { id: achievementId, studentId },
    });
    if (!existing) {
      throw new NotFoundException('Achievement not found.');
    }

    const data: {
      award?: string;
      exam?: string;
      year?: number;
      level?: AchievementLevel;
      courseLabel?: string | null;
      sortOrder?: number;
    } = {};
    if (dto.award !== undefined) {
      data.award = this.normalizeRequiredText(dto.award, 'Giải thưởng');
    }
    if (dto.exam !== undefined) {
      data.exam = this.normalizeRequiredText(dto.exam, 'Kỳ thi');
    }
    if (dto.year !== undefined) {
      data.year = dto.year;
    }
    if (dto.level !== undefined) {
      data.level = dto.level;
    }
    if (dto.courseLabel !== undefined) {
      data.courseLabel = this.normalizeCourseLabel(dto.courseLabel) ?? null;
    }
    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }

    const row = await this.prisma.studentAchievement.update({
      where: { id: achievementId },
      data,
    });
    return this.toStudentDto(row);
  }

  async deleteStaffAchievement(staffId: string, achievementId: string) {
    const existing = await this.prisma.staffAchievement.findFirst({
      where: { id: achievementId, staffId },
    });
    if (!existing) {
      throw new NotFoundException('Achievement not found.');
    }

    await this.removeAchievementImages(
      existing.imagePath,
      existing.imageWatermarkedPath,
    );
    await this.prisma.staffAchievement.delete({ where: { id: achievementId } });
    return { ok: true as const };
  }

  async deleteStudentAchievement(studentId: string, achievementId: string) {
    const existing = await this.prisma.studentAchievement.findFirst({
      where: { id: achievementId, studentId },
    });
    if (!existing) {
      throw new NotFoundException('Achievement not found.');
    }

    await this.removeAchievementImages(
      existing.imagePath,
      existing.imageWatermarkedPath,
    );
    await this.prisma.studentAchievement.delete({
      where: { id: achievementId },
    });
    return { ok: true as const };
  }

  /**
   * Validate that `orderedIds` is a complete permutation of the owner's
   * current achievement ids, then apply sortOrder = index.
   *
   * TODO(you): implement assertCompleteReorder — see learning prompt in chat.
   */
  async reorderStaffAchievements(staffId: string, dto: ReorderAchievementsDto) {
    await this.assertStaffExists(staffId);
    const existing = await this.prisma.staffAchievement.findMany({
      where: { staffId },
      select: { id: true },
    });
    this.assertCompleteReorder(
      existing.map((row) => row.id),
      dto.orderedIds,
    );

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.staffAchievement.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.listStaffAchievements(staffId);
  }

  async reorderStudentAchievements(
    studentId: string,
    dto: ReorderAchievementsDto,
  ) {
    await this.assertStudentExists(studentId);
    const existing = await this.prisma.studentAchievement.findMany({
      where: { studentId },
      select: { id: true },
    });
    this.assertCompleteReorder(
      existing.map((row) => row.id),
      dto.orderedIds,
    );

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.studentAchievement.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.listStudentAchievements(studentId);
  }

  /**
   * Ensure `orderedIds` lists every existing id exactly once (no extras, no missing).
   * Throw BadRequestException with a clear Vietnamese message on failure.
   */
  assertCompleteReorder(existingIds: string[], orderedIds: string[]): void {
    if (orderedIds.length !== existingIds.length) {
      throw new BadRequestException(
        'Danh sách sắp xếp phải gồm đủ toàn bộ thành tích hiện có (không thiếu/thừa).',
      );
    }

    const existingSet = new Set(existingIds);
    for (const id of orderedIds) {
      if (!existingSet.has(id)) {
        throw new BadRequestException(
          'Danh sách sắp xếp chứa thành tích không thuộc hồ sơ này.',
        );
      }
    }

    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException(
        'Danh sách sắp xếp không được trùng id thành tích.',
      );
    }
  }

  async uploadStaffAchievementImage(
    staffId: string,
    achievementId: string,
    file: UploadableFile | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn ảnh minh chứng để tải lên.');
    }
    validateImageFile(file, 'Ảnh minh chứng');

    const existing = await this.prisma.staffAchievement.findFirst({
      where: { id: achievementId, staffId },
    });
    if (!existing) {
      throw new NotFoundException('Achievement not found.');
    }

    const imagePath = this.buildImageStoragePath(
      'staff',
      staffId,
      achievementId,
      file.mimetype,
    );
    const imageWatermarkedPath = buildAchievementWatermarkedPath(
      'staff',
      staffId,
      achievementId,
    );
    await this.uploadImagePair({
      imagePath,
      imageWatermarkedPath,
      file,
      previousImagePath: existing.imagePath,
      previousWatermarkedPath: existing.imageWatermarkedPath,
    });

    const row = await this.prisma.staffAchievement.update({
      where: { id: achievementId },
      data: { imagePath, imageWatermarkedPath },
    });
    return this.toStaffDto(row);
  }

  async uploadStudentAchievementImage(
    studentId: string,
    achievementId: string,
    file: UploadableFile | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn ảnh minh chứng để tải lên.');
    }
    validateImageFile(file, 'Ảnh minh chứng');

    const existing = await this.prisma.studentAchievement.findFirst({
      where: { id: achievementId, studentId },
    });
    if (!existing) {
      throw new NotFoundException('Achievement not found.');
    }

    const imagePath = this.buildImageStoragePath(
      'student',
      studentId,
      achievementId,
      file.mimetype,
    );
    const imageWatermarkedPath = buildAchievementWatermarkedPath(
      'student',
      studentId,
      achievementId,
    );
    await this.uploadImagePair({
      imagePath,
      imageWatermarkedPath,
      file,
      previousImagePath: existing.imagePath,
      previousWatermarkedPath: existing.imageWatermarkedPath,
    });

    const row = await this.prisma.studentAchievement.update({
      where: { id: achievementId },
      data: { imagePath, imageWatermarkedPath },
    });
    return this.toStudentDto(row);
  }

  async deleteStaffAchievementImage(staffId: string, achievementId: string) {
    const existing = await this.prisma.staffAchievement.findFirst({
      where: { id: achievementId, staffId },
    });
    if (!existing) {
      throw new NotFoundException('Achievement not found.');
    }
    if (!existing.imagePath && !existing.imageWatermarkedPath) {
      return this.toStaffDto(existing);
    }

    await this.removeAchievementImages(
      existing.imagePath,
      existing.imageWatermarkedPath,
    );
    const row = await this.prisma.staffAchievement.update({
      where: { id: achievementId },
      data: { imagePath: null, imageWatermarkedPath: null },
    });
    return this.toStaffDto(row);
  }

  async deleteStudentAchievementImage(
    studentId: string,
    achievementId: string,
  ) {
    const existing = await this.prisma.studentAchievement.findFirst({
      where: { id: achievementId, studentId },
    });
    if (!existing) {
      throw new NotFoundException('Achievement not found.');
    }
    if (!existing.imagePath && !existing.imageWatermarkedPath) {
      return this.toStudentDto(existing);
    }

    await this.removeAchievementImages(
      existing.imagePath,
      existing.imageWatermarkedPath,
    );
    const row = await this.prisma.studentAchievement.update({
      where: { id: achievementId },
      data: { imagePath: null, imageWatermarkedPath: null },
    });
    return this.toStudentDto(row);
  }

  private async uploadImagePair(options: {
    imagePath: string;
    imageWatermarkedPath: string;
    file: UploadableFile;
    previousImagePath: string | null;
    previousWatermarkedPath: string | null;
  }) {
    const watermarked = await bakeDiagonalWatermark(options.file.buffer);

    await uploadStorageObject({
      bucket: ACHIEVEMENT_STORAGE_BUCKET,
      path: options.imagePath,
      body: options.file.buffer,
      contentType: options.file.mimetype,
      upsert: true,
    });

    try {
      await uploadStorageObject({
        bucket: ACHIEVEMENT_PUBLIC_BUCKET,
        path: options.imageWatermarkedPath,
        body: watermarked.buffer,
        contentType: watermarked.contentType,
        upsert: true,
      });
    } catch (error) {
      if (options.previousImagePath !== options.imagePath) {
        await removeStorageObjects({
          bucket: ACHIEVEMENT_STORAGE_BUCKET,
          paths: [options.imagePath],
        }).catch(() => undefined);
      }
      throw error;
    }

    if (
      options.previousImagePath &&
      options.previousImagePath !== options.imagePath
    ) {
      await removeStorageObjects({
        bucket: ACHIEVEMENT_STORAGE_BUCKET,
        paths: [options.previousImagePath],
      });
    }
    if (
      options.previousWatermarkedPath &&
      options.previousWatermarkedPath !== options.imageWatermarkedPath
    ) {
      await removeStorageObjects({
        bucket: ACHIEVEMENT_PUBLIC_BUCKET,
        paths: [options.previousWatermarkedPath],
      });
    }
  }

  private async removeAchievementImages(
    imagePath: string | null,
    imageWatermarkedPath: string | null | undefined,
  ) {
    await removeStorageObjects({
      bucket: ACHIEVEMENT_STORAGE_BUCKET,
      paths: [imagePath],
    });
    await removeStorageObjects({
      bucket: ACHIEVEMENT_PUBLIC_BUCKET,
      paths: [imageWatermarkedPath],
    });
  }
}

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
  buildStudentGalleryWatermarkedPath,
} from '../storage/image-watermark';
import {
  STUDENT_GALLERY_PUBLIC_BUCKET,
  STUDENT_GALLERY_STORAGE_BUCKET,
} from '../storage/media-buckets';
import type {
  CreateStudentGalleryItemDto,
  ReorderStudentGalleryDto,
  UpdateStudentGalleryItemDto,
} from '../dtos/student-gallery.dto';

const GALLERY_SIGNED_URL_TTL_SECONDS = 60 * 60;

type GalleryRow = {
  id: string;
  caption: string | null;
  imagePath: string | null;
  imageWatermarkedPath?: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class StudentGalleryService {
  constructor(private readonly prisma: PrismaService) {}

  private extensionForMime(mimetype: string): string {
    if (mimetype === 'image/png') return 'png';
    if (mimetype === 'image/webp') return 'webp';
    return 'jpg';
  }

  private buildImageStoragePath(
    studentId: string,
    itemId: string,
    mimetype: string,
  ) {
    return `student/${studentId}/${itemId}.${this.extensionForMime(mimetype)}`;
  }

  private async toDto(row: GalleryRow) {
    const imageUrl = await createSignedStorageUrl({
      bucket: STUDENT_GALLERY_STORAGE_BUCKET,
      path: row.imagePath,
      expiresIn: GALLERY_SIGNED_URL_TTL_SECONDS,
    });

    return {
      id: row.id,
      caption: row.caption,
      imagePath: row.imagePath,
      imageUrl,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async toDtoList(rows: GalleryRow[]) {
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  private normalizeCaption(caption: string | null | undefined) {
    if (caption === undefined) {
      return undefined;
    }
    if (caption === null) {
      return null;
    }
    const trimmed = caption.trim();
    return trimmed ? trimmed : null;
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

  async list(studentId: string) {
    await this.assertStudentExists(studentId);
    const rows = await this.prisma.studentGalleryItem.findMany({
      where: { studentId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return this.toDtoList(rows);
  }

  async create(studentId: string, dto: CreateStudentGalleryItemDto) {
    await this.assertStudentExists(studentId);
    const caption =
      dto.caption !== undefined ? this.normalizeCaption(dto.caption) : null;
    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(studentId));

    const row = await this.prisma.studentGalleryItem.create({
      data: {
        studentId,
        caption: caption ?? null,
        sortOrder,
      },
    });
    return this.toDto(row);
  }

  private async nextSortOrder(studentId: string) {
    const last = await this.prisma.studentGalleryItem.findFirst({
      where: { studentId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  async update(
    studentId: string,
    itemId: string,
    dto: UpdateStudentGalleryItemDto,
  ) {
    const existing = await this.prisma.studentGalleryItem.findFirst({
      where: { id: itemId, studentId },
    });
    if (!existing) {
      throw new NotFoundException('Gallery item not found.');
    }

    const data: { caption?: string | null; sortOrder?: number } = {};
    if (dto.caption !== undefined) {
      data.caption = this.normalizeCaption(dto.caption) ?? null;
    }
    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }

    const row = await this.prisma.studentGalleryItem.update({
      where: { id: itemId },
      data,
    });
    return this.toDto(row);
  }

  async remove(studentId: string, itemId: string) {
    const existing = await this.prisma.studentGalleryItem.findFirst({
      where: { id: itemId, studentId },
    });
    if (!existing) {
      throw new NotFoundException('Gallery item not found.');
    }

    await this.removeImages(existing.imagePath, existing.imageWatermarkedPath);
    await this.prisma.studentGalleryItem.delete({ where: { id: itemId } });
    return { ok: true as const };
  }

  async reorder(studentId: string, dto: ReorderStudentGalleryDto) {
    await this.assertStudentExists(studentId);
    const existing = await this.prisma.studentGalleryItem.findMany({
      where: { studentId },
      select: { id: true },
    });
    this.assertCompleteReorder(
      existing.map((row) => row.id),
      dto.orderedIds,
    );

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.studentGalleryItem.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.list(studentId);
  }

  assertCompleteReorder(existingIds: string[], orderedIds: string[]): void {
    if (orderedIds.length !== existingIds.length) {
      throw new BadRequestException(
        'Danh sách sắp xếp phải gồm đủ toàn bộ ảnh gallery hiện có (không thiếu/thừa).',
      );
    }

    const existingSet = new Set(existingIds);
    for (const id of orderedIds) {
      if (!existingSet.has(id)) {
        throw new BadRequestException(
          'Danh sách sắp xếp chứa ảnh không thuộc hồ sơ học sinh này.',
        );
      }
    }

    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException(
        'Danh sách sắp xếp không được trùng id ảnh gallery.',
      );
    }
  }

  async uploadImage(
    studentId: string,
    itemId: string,
    file: UploadableFile | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn ảnh gallery để tải lên.');
    }
    validateImageFile(file, 'Ảnh gallery');

    const existing = await this.prisma.studentGalleryItem.findFirst({
      where: { id: itemId, studentId },
    });
    if (!existing) {
      throw new NotFoundException('Gallery item not found.');
    }

    const imagePath = this.buildImageStoragePath(
      studentId,
      itemId,
      file.mimetype,
    );
    const imageWatermarkedPath = buildStudentGalleryWatermarkedPath(
      studentId,
      itemId,
    );
    await this.uploadImagePair({
      imagePath,
      imageWatermarkedPath,
      file,
      previousImagePath: existing.imagePath,
      previousWatermarkedPath: existing.imageWatermarkedPath,
    });

    const row = await this.prisma.studentGalleryItem.update({
      where: { id: itemId },
      data: { imagePath, imageWatermarkedPath },
    });
    return this.toDto(row);
  }

  async deleteImage(studentId: string, itemId: string) {
    const existing = await this.prisma.studentGalleryItem.findFirst({
      where: { id: itemId, studentId },
    });
    if (!existing) {
      throw new NotFoundException('Gallery item not found.');
    }
    if (!existing.imagePath && !existing.imageWatermarkedPath) {
      return this.toDto(existing);
    }

    await this.removeImages(existing.imagePath, existing.imageWatermarkedPath);
    const row = await this.prisma.studentGalleryItem.update({
      where: { id: itemId },
      data: { imagePath: null, imageWatermarkedPath: null },
    });
    return this.toDto(row);
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
      bucket: STUDENT_GALLERY_STORAGE_BUCKET,
      path: options.imagePath,
      body: options.file.buffer,
      contentType: options.file.mimetype,
      upsert: true,
    });

    try {
      await uploadStorageObject({
        bucket: STUDENT_GALLERY_PUBLIC_BUCKET,
        path: options.imageWatermarkedPath,
        body: watermarked.buffer,
        contentType: watermarked.contentType,
        upsert: true,
      });
    } catch (error) {
      if (options.previousImagePath !== options.imagePath) {
        await removeStorageObjects({
          bucket: STUDENT_GALLERY_STORAGE_BUCKET,
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
        bucket: STUDENT_GALLERY_STORAGE_BUCKET,
        paths: [options.previousImagePath],
      });
    }
    if (
      options.previousWatermarkedPath &&
      options.previousWatermarkedPath !== options.imageWatermarkedPath
    ) {
      await removeStorageObjects({
        bucket: STUDENT_GALLERY_PUBLIC_BUCKET,
        paths: [options.previousWatermarkedPath],
      });
    }
  }

  private async removeImages(
    imagePath: string | null,
    imageWatermarkedPath: string | null | undefined,
  ) {
    await removeStorageObjects({
      bucket: STUDENT_GALLERY_STORAGE_BUCKET,
      paths: [imagePath],
    });
    await removeStorageObjects({
      bucket: STUDENT_GALLERY_PUBLIC_BUCKET,
      paths: [imageWatermarkedPath],
    });
  }
}

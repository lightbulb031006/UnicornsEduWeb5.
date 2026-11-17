import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActionHistoryService,
  type ActionHistoryActor,
} from '../action-history/action-history.service';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
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

/** Entity type ghi `action_history` khi người khác sửa thành tích nhân sự. */
export const STAFF_ACHIEVEMENT_AUDIT_ENTITY = 'staff_achievement';

/**
 * Ai đang sửa thành tích nhân sự (ADR 2026-11-11-staff-achievement-star-first):
 * - `self`: nhân sự tự sửa hồ sơ mình — không gỡ được ảnh của dòng có sao,
 *   không ghi lịch sử thao tác.
 * - `other`: admin / trợ lí / Ban Đào Tạo sửa hồ sơ người khác — không ràng
 *   buộc minh chứng, ghi lịch sử thao tác (trừ sắp xếp).
 */
export type StaffAchievementEditor =
  | { kind: 'self' }
  | { kind: 'other'; actor: ActionHistoryActor };

export const SELF_STAFF_ACHIEVEMENT_EDITOR: StaffAchievementEditor = {
  kind: 'self',
};

type StaffAchievementRow = {
  id: string;
  title: string;
  imagePath: string | null;
  imageWatermarkedPath?: string | null;
  sortOrder: number;
  isHighlight: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Thành tích nổi bật luôn đứng đầu, sau đó theo thứ tự gia sư sắp xếp. */
const STAFF_ACHIEVEMENT_ORDER_BY = [
  { isHighlight: 'desc' as const },
  { sortOrder: 'asc' as const },
  { createdAt: 'asc' as const },
];

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

  /**
   * Người sửa hồ sơ người khác (admin, trợ lí, Ban Đào Tạo). Hồ sơ của chính
   * mình phải sửa ở trang hồ sơ cá nhân để gate minh chứng áp đúng → 403.
   */
  async resolveOtherStaffAchievementEditor(
    user: Pick<JwtPayload, 'id' | 'email' | 'roleType'>,
    staffId: string,
  ): Promise<StaffAchievementEditor> {
    const ownStaff = await this.prisma.staffInfo.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    if (ownStaff?.id === staffId) {
      throw new ForbiddenException(
        'Thành tích của chính mình sửa ở trang hồ sơ cá nhân.',
      );
    }
    return {
      kind: 'other',
      actor: {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    };
  }

  private toStaffAuditSnapshot(row: StaffAchievementRow & { staffId: string }) {
    return {
      staffId: row.staffId,
      title: row.title,
      isHighlight: row.isHighlight,
      hasImage: Boolean(row.imagePath),
    };
  }

  /** Chỉ ghi khi người khác sửa; nhân sự tự sửa thì bỏ qua. */
  private async auditStaffAchievement(
    editor: StaffAchievementEditor,
    params: {
      actionType: 'create' | 'update' | 'delete';
      achievementId: string;
      description: string;
      beforeValue?: unknown;
      afterValue?: unknown;
    },
  ) {
    if (editor.kind !== 'other') return;
    const base = {
      actor: editor.actor,
      entityType: STAFF_ACHIEVEMENT_AUDIT_ENTITY,
      entityId: params.achievementId,
      description: params.description,
    };
    if (params.actionType === 'create') {
      await this.actionHistoryService.recordCreate(this.prisma, {
        ...base,
        afterValue: params.afterValue,
      });
    } else if (params.actionType === 'delete') {
      await this.actionHistoryService.recordDelete(this.prisma, {
        ...base,
        beforeValue: params.beforeValue,
      });
    } else {
      await this.actionHistoryService.recordUpdate(this.prisma, {
        ...base,
        beforeValue: params.beforeValue,
        afterValue: params.afterValue,
      });
    }
  }

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
      isHighlight: row.isHighlight,
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
      isHighlight: false,
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
      orderBy: STAFF_ACHIEVEMENT_ORDER_BY,
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

  /**
   * Ảnh minh chứng luôn tuỳ chọn, kể cả thành tích đầu tiên; hệ thống không tự
   * gắn sao. Gate hồ sơ gia sư mới đòi dòng có sao phải có ảnh.
   */
  async createStaffAchievement(
    staffId: string,
    dto: CreateAchievementDto,
    file: UploadableFile | undefined,
    editor: StaffAchievementEditor,
  ) {
    if (file) {
      validateImageFile(file, 'Ảnh minh chứng');
    }
    await this.assertStaffExists(staffId);
    const title = this.normalizeTitle(dto.title);
    const sortOrder = dto.sortOrder ?? (await this.nextStaffSortOrder(staffId));

    let row = await this.prisma.staffAchievement.create({
      data: { staffId, title, sortOrder },
    });
    if (file) {
      try {
        row = await this.storeStaffAchievementImage(row, file);
      } catch (error) {
        await this.prisma.staffAchievement
          .delete({ where: { id: row.id } })
          .catch(() => undefined);
        throw error;
      }
    }
    await this.auditStaffAchievement(editor, {
      actionType: 'create',
      achievementId: row.id,
      description: 'Thêm thành tích nhân sự',
      afterValue: this.toStaffAuditSnapshot(row),
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
    editor: StaffAchievementEditor,
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
    if (data.title !== undefined && data.title !== existing.title) {
      await this.auditStaffAchievement(editor, {
        actionType: 'update',
        achievementId,
        description: 'Sửa tiêu đề thành tích nhân sự',
        beforeValue: this.toStaffAuditSnapshot(existing),
        afterValue: this.toStaffAuditSnapshot(row),
      });
    }
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

  /** Xoá dòng có sao thì hồ sơ không còn sao cho tới khi chọn lại. */
  async deleteStaffAchievement(
    staffId: string,
    achievementId: string,
    editor: StaffAchievementEditor,
  ) {
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
    await this.auditStaffAchievement(editor, {
      actionType: 'delete',
      achievementId,
      description: 'Xoá thành tích nhân sự',
      beforeValue: this.toStaffAuditSnapshot(existing),
    });
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
   * Đặt thành tích nổi bật: bỏ sao cũ, gắn sao mới và đưa nó lên đầu
   * (sortOrder 0), các thành tích còn lại giữ thứ tự tương đối. Dòng chưa có
   * ảnh vẫn gắn sao được — chọn sao trước, minh chứng sau.
   */
  async setStaffHighlightAchievement(
    staffId: string,
    achievementId: string,
    editor: StaffAchievementEditor,
  ) {
    await this.assertStaffExists(staffId);
    const rows = await this.prisma.staffAchievement.findMany({
      where: { staffId },
      orderBy: STAFF_ACHIEVEMENT_ORDER_BY,
      select: { id: true, title: true, isHighlight: true },
    });
    const target = rows.find((row) => row.id === achievementId);
    if (!target) {
      throw new NotFoundException('Achievement not found.');
    }
    const previous = rows.find((row) => row.isHighlight);
    const orderedIds = [
      achievementId,
      ...rows.map((row) => row.id).filter((id) => id !== achievementId),
    ];

    await this.prisma.$transaction([
      // Bỏ sao cũ trước để không vi phạm unique index một-sao-mỗi-nhân-sự.
      this.prisma.staffAchievement.updateMany({
        where: { staffId, isHighlight: true, id: { not: achievementId } },
        data: { isHighlight: false },
      }),
      ...orderedIds.map((id, index) =>
        this.prisma.staffAchievement.update({
          where: { id },
          data: {
            sortOrder: index,
            ...(id === achievementId ? { isHighlight: true } : {}),
          },
        }),
      ),
    ]);

    if (!target.isHighlight) {
      await this.auditStaffAchievement(editor, {
        actionType: 'update',
        achievementId,
        description: 'Đổi thành tích nổi bật của nhân sự',
        beforeValue: {
          staffId,
          highlightAchievementId: previous?.id ?? null,
          title: previous?.title ?? null,
        },
        afterValue: {
          staffId,
          highlightAchievementId: achievementId,
          title: target.title,
        },
      });
    }
    return this.listStaffAchievements(staffId);
  }

  /**
   * Validate that `orderedIds` is a complete permutation of the owner's
   * current achievement ids, then apply sortOrder = index. Thành tích nổi bật
   * luôn bị ghim ở đầu, bất kể vị trí client gửi lên.
   */
  async reorderStaffAchievements(staffId: string, dto: ReorderAchievementsDto) {
    await this.assertStaffExists(staffId);
    const existing = await this.prisma.staffAchievement.findMany({
      where: { staffId },
      select: { id: true, isHighlight: true },
    });
    this.assertCompleteReorder(
      existing.map((row) => row.id),
      dto.orderedIds,
    );
    const highlightId = existing.find((row) => row.isHighlight)?.id;
    const orderedIds = highlightId
      ? [highlightId, ...dto.orderedIds.filter((id) => id !== highlightId)]
      : dto.orderedIds;

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
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
    editor: StaffAchievementEditor,
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

    const row = await this.storeStaffAchievementImage(existing, file);
    await this.auditStaffAchievement(editor, {
      actionType: 'update',
      achievementId,
      description: existing.imagePath
        ? 'Thay ảnh minh chứng thành tích nhân sự'
        : 'Tải ảnh minh chứng thành tích nhân sự',
      beforeValue: this.toStaffAuditSnapshot(existing),
      afterValue: this.toStaffAuditSnapshot(row),
    });
    return this.toStaffDto(row);
  }

  private async storeStaffAchievementImage(
    existing: StaffAchievementRow & { staffId: string },
    file: UploadableFile,
  ) {
    const imagePath = this.buildImageStoragePath(
      'staff',
      existing.staffId,
      existing.id,
      file.mimetype,
    );
    const imageWatermarkedPath = buildAchievementWatermarkedPath(
      'staff',
      existing.staffId,
      existing.id,
    );
    await this.uploadImagePair({
      imagePath,
      imageWatermarkedPath,
      file,
      previousImagePath: existing.imagePath,
      previousWatermarkedPath: existing.imageWatermarkedPath ?? null,
    });

    return this.prisma.staffAchievement.update({
      where: { id: existing.id },
      data: { imagePath, imageWatermarkedPath },
    });
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

  /**
   * Nhân sự tự sửa không gỡ được ảnh của dòng có sao (chỉ thay). Người khác
   * sửa thì gỡ được — gate của gia sư sẽ đòi tải lại.
   */
  async deleteStaffAchievementImage(
    staffId: string,
    achievementId: string,
    editor: StaffAchievementEditor,
  ) {
    const existing = await this.prisma.staffAchievement.findFirst({
      where: { id: achievementId, staffId },
    });
    if (!existing) {
      throw new NotFoundException('Achievement not found.');
    }
    if (existing.isHighlight && editor.kind === 'self') {
      throw new BadRequestException(
        'Không gỡ ảnh minh chứng của thành tích nổi bật. Hãy thay ảnh khác hoặc đổi sao sang thành tích khác.',
      );
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
    await this.auditStaffAchievement(editor, {
      actionType: 'update',
      achievementId,
      description: 'Gỡ ảnh minh chứng thành tích nhân sự',
      beforeValue: this.toStaffAuditSnapshot(existing),
      afterValue: this.toStaffAuditSnapshot(row),
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

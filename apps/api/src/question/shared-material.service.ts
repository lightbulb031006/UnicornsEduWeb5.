import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from 'generated/enums';
import type { Prisma } from 'generated/client';
import { PrismaService } from '../prisma/prisma.service';
import type { LmsProfileConfig } from '../lms-profile/lms-profile';
import { ActionHistoryService } from '../action-history/action-history.service';
import { CourseAccessService } from '../class/course-access.service';
import { LmsProfileService } from '../lms-profile/lms-profile.service';
import {
  CreateSharedMaterialDto,
  SharedMaterialResponseDto,
  SharedMaterialUsageDto,
  UpdateSharedMaterialDto,
} from '../dtos/shared-material.dto';
import { assertAudioAttachable, withAudioRefs } from './audio-asset.service';
import { linkQuestionToSetLessons } from './set-lesson-sync';

type MaterialActor = {
  userId?: string;
  userEmail?: string;
  roleType?: UserRole;
};

/** Tư liệu dùng chung của ngân hàng câu hỏi (ADR 2026-10-09-shared-material). */
@Injectable()
export class SharedMaterialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistory: ActionHistoryService,
    private readonly courseAccess: CourseAccessService,
    private readonly lmsProfile: LmsProfileService = new LmsProfileService(),
  ) {}

  private assertEnabled(): void {
    if (!this.lmsProfile.config.sharedMaterials) {
      throw new BadRequestException(
        'Hồ sơ môn này không dùng Tư liệu dùng chung.',
      );
    }
  }

  private async assertWriteAccess(
    actor: MaterialActor,
    courseId: string,
  ): Promise<void> {
    if (!actor.userId) {
      throw new BadRequestException('Missing actor for shared material write');
    }
    const courseActor = await this.courseAccess.resolveActor(
      actor.userId,
      actor.roleType ?? UserRole.staff,
    );
    await this.courseAccess.assertCanWriteCourseQuestions(
      courseActor,
      courseId,
    );
  }

  private async assertModuleInCourse(
    moduleId: string,
    courseId: string,
  ): Promise<void> {
    const courseModule = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { courseId: true },
    });
    if (!courseModule || courseModule.courseId !== courseId) {
      throw new BadRequestException('Chuyên đề không thuộc khoá của bộ.');
    }
  }

  private async findOrThrow(id: string) {
    const material = await this.prisma.sharedMaterial.findUnique({
      where: { id },
    });
    if (!material || material.deletedAt) {
      throw new NotFoundException('Không tìm thấy tư liệu.');
    }
    return material;
  }

  private activeQuestionCount(sharedMaterialId: string): Promise<number> {
    return this.prisma.question.count({
      where: { sharedMaterialId, deletedAt: null },
    });
  }

  async list(courseId: string): Promise<SharedMaterialResponseDto[]> {
    this.assertEnabled();
    const rows = await this.prisma.sharedMaterial.findMany({
      where: { courseId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { questions: { where: { deletedAt: null } } } },
      },
    });
    return withAudioRefs(
      this.prisma,
      rows.map(({ _count, ...m }) => ({
        ...m,
        questionCount: _count.questions,
      })),
    );
  }

  async create(
    dto: CreateSharedMaterialDto,
    actor: MaterialActor,
  ): Promise<SharedMaterialResponseDto> {
    this.assertEnabled();
    await this.courseAccess.assertCourseExists(dto.courseId);
    await this.assertWriteAccess(actor, dto.courseId);
    assertSetHeader(dto.content, dto.audioId ?? null);
    await this.assertModuleInCourse(dto.moduleId, dto.courseId);
    await assertAudioAttachable(
      this.prisma,
      this.lmsProfile.config,
      dto.audioId,
      dto.courseId,
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sharedMaterial.create({
        data: {
          courseId: dto.courseId,
          moduleId: dto.moduleId,
          title: dto.title.trim(),
          content: dto.content,
          audioId: dto.audioId ?? null,
        },
      });
      await this.actionHistory.recordCreate(tx, {
        entityType: 'shared_material',
        entityId: created.id,
        actor,
        afterValue: created,
      });
      return created;
    });
    const [withAudio] = await withAudioRefs(this.prisma, [
      { ...created, questionCount: 0 },
    ]);
    return withAudio;
  }

  async update(
    id: string,
    dto: UpdateSharedMaterialDto,
    actor: MaterialActor,
  ): Promise<SharedMaterialResponseDto> {
    this.assertEnabled();
    const existing = await this.findOrThrow(id);
    await this.assertWriteAccess(actor, existing.courseId);
    assertSetHeader(
      dto.content ?? existing.content,
      dto.audioId !== undefined ? dto.audioId : existing.audioId,
    );
    const movedTo =
      dto.moduleId !== undefined && dto.moduleId !== existing.moduleId
        ? dto.moduleId
        : null;
    if (movedTo) {
      await this.assertModuleInCourse(movedTo, existing.courseId);
    }
    if (dto.audioId !== undefined && dto.audioId !== existing.audioId) {
      await assertAudioAttachable(
        this.prisma,
        this.lmsProfile.config,
        dto.audioId,
        existing.courseId,
        { sharedMaterialId: id },
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.sharedMaterial.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title.trim() }),
          ...(dto.content !== undefined && { content: dto.content }),
          ...(dto.audioId !== undefined && { audioId: dto.audioId }),
          ...(movedTo && { moduleId: movedTo }),
        },
      });
      // Bộ thuộc đúng một chuyên đề: chuyển bộ thì cả bộ đi theo.
      if (movedTo) {
        await tx.question.updateMany({
          where: { sharedMaterialId: id },
          data: { moduleId: movedTo },
        });
      }
      await this.actionHistory.recordUpdate(tx, {
        entityType: 'shared_material',
        entityId: id,
        actor,
        beforeValue: existing,
        afterValue: row,
      });
      return row;
    });
    const [withAudio] = await withAudioRefs(this.prisma, [
      { ...updated, questionCount: await this.activeQuestionCount(id) },
    ]);
    return withAudio;
  }

  /** Tiết thực hành / bài ôn đang dùng bộ (tiết đi theo bộ → sửa bộ là sửa các tiết này). */
  async usage(id: string): Promise<SharedMaterialUsageDto> {
    this.assertEnabled();
    await this.findOrThrow(id);
    return this.lessonUsage({ sharedMaterialId: id, deletedAt: null });
  }

  /** Tiết thực hành / bài ôn đang chứa một câu — cảnh báo khi chuyển câu vào / ra bộ. */
  async questionUsage(questionId: string): Promise<SharedMaterialUsageDto> {
    this.assertEnabled();
    return this.lessonUsage({ id: questionId });
  }

  private async lessonUsage(
    question: Prisma.QuestionWhereInput,
  ): Promise<SharedMaterialUsageDto> {
    const [links, quizzes] = await Promise.all([
      this.prisma.questionLink.findMany({
        where: { question },
        distinct: ['lessonId'],
        select: { lessonId: true },
      }),
      this.prisma.lessonQuiz.findMany({
        where: { question },
        distinct: ['lessonId'],
        select: { lessonId: true },
      }),
    ]);
    const lessonIds = links.map((l) => l.lessonId);
    const assigned = lessonIds.length
      ? await this.prisma.classContentItem.findMany({
          where: { lessonId: { in: lessonIds } },
          distinct: ['lessonId'],
          select: { lessonId: true },
        })
      : [];
    return {
      lessonCount: lessonIds.length,
      assignedLessonCount: assigned.length,
      quizLessonCount: quizzes.length,
    };
  }

  /**
   * Sắp lại thứ tự câu trong bộ: `questionIds` phải đúng là mọi câu (chưa xoá)
   * của bộ, mỗi câu một lần; vị trí = thứ tự trong danh sách.
   */
  async reorderQuestions(
    id: string,
    questionIds: string[],
    actor: MaterialActor,
  ): Promise<void> {
    this.assertEnabled();
    const existing = await this.findOrThrow(id);
    await this.assertWriteAccess(actor, existing.courseId);
    const members = await this.prisma.question.findMany({
      where: { sharedMaterialId: id, deletedAt: null },
      select: { id: true },
    });
    const memberIds = new Set(members.map((q) => q.id));
    const sameSet =
      questionIds.length === memberIds.size &&
      new Set(questionIds).size === questionIds.length &&
      questionIds.every((qid) => memberIds.has(qid));
    if (!sameSet) {
      throw new BadRequestException(
        'Danh sách câu không khớp các câu trong bộ — tải lại rồi thử lại.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [setPosition, qid] of questionIds.entries()) {
        await tx.question.update({
          where: { id: qid },
          data: { setPosition },
        });
      }
    });
  }

  /**
   * Câu lẻ vào bộ (ADR 2026-10-09-question-set): gỡ mọi link lẻ của câu trong
   * tiết thực hành / bài ôn, câu nhận chuyên đề của bộ, đứng cuối bộ và vào mọi
   * tiết / bài ôn đang dùng bộ.
   */
  async moveQuestionIn(
    id: string,
    questionId: string,
    actor: MaterialActor,
  ): Promise<void> {
    this.assertEnabled();
    const set = await this.findOrThrow(id);
    await this.assertWriteAccess(actor, set.courseId);
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question || question.deletedAt) {
      throw new NotFoundException('Không tìm thấy câu hỏi.');
    }
    if (question.courseId !== set.courseId) {
      throw new BadRequestException('Câu phải cùng khoá với bộ.');
    }
    if (question.sharedMaterialId) {
      throw new BadRequestException(
        question.sharedMaterialId === id
          ? 'Câu đã ở trong bộ này.'
          : 'Câu đang thuộc bộ khác — đưa ra khỏi bộ đó trước.',
      );
    }
    const setPosition = await nextSetPosition(this.prisma, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.questionLink.deleteMany({ where: { questionId } });
      await tx.lessonQuiz.deleteMany({ where: { questionId } });
      const row = await tx.question.update({
        where: { id: questionId },
        data: {
          sharedMaterialId: id,
          setPosition,
          moduleId: set.moduleId,
        },
      });
      await linkQuestionToSetLessons(tx, questionId, id);
      await this.actionHistory.recordUpdate(tx, {
        entityType: 'question',
        entityId: questionId,
        actor,
        beforeValue: question,
        afterValue: row,
      });
    });
  }

  /**
   * Câu ra khỏi bộ: biến mất khỏi mọi tiết / bài ôn đang dùng bộ, thành câu lẻ
   * chưa vào tiết nào. Lượt đã bắt đầu đọc snapshot nên không đổi.
   */
  async moveQuestionOut(
    id: string,
    questionId: string,
    actor: MaterialActor,
  ): Promise<void> {
    this.assertEnabled();
    const set = await this.findOrThrow(id);
    await this.assertWriteAccess(actor, set.courseId);
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question || question.deletedAt || question.sharedMaterialId !== id) {
      throw new NotFoundException('Câu không thuộc bộ này.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.questionLink.deleteMany({ where: { questionId } });
      await tx.lessonQuiz.deleteMany({ where: { questionId } });
      const row = await tx.question.update({
        where: { id: questionId },
        data: { sharedMaterialId: null, setPosition: null },
      });
      await this.actionHistory.recordUpdate(tx, {
        entityType: 'question',
        entityId: questionId,
        actor,
        beforeValue: question,
        afterValue: row,
      });
    });
  }

  /**
   * Xoá bộ = xoá mềm phần đầu bộ cùng mọi câu, gỡ bộ khỏi mọi tiết thực hành /
   * bài ôn. Giữ dòng bộ và liên kết câu → bộ để lượt đã làm còn xem lại được.
   */
  async delete(id: string, actor: MaterialActor) {
    this.assertEnabled();
    const existing = await this.findOrThrow(id);
    await this.assertWriteAccess(actor, existing.courseId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const inSet = { question: { sharedMaterialId: id } };
      await tx.questionLink.deleteMany({ where: inSet });
      await tx.lessonQuiz.deleteMany({ where: inSet });
      await tx.question.updateMany({
        where: { sharedMaterialId: id, deletedAt: null },
        data: { deletedAt: now },
      });
      const deleted = await tx.sharedMaterial.update({
        where: { id },
        data: { deletedAt: now },
      });
      await this.actionHistory.recordDelete(tx, {
        entityType: 'shared_material',
        entityId: id,
        actor,
        beforeValue: existing,
      });
      return deleted;
    });
  }
}

/** Phần đầu bộ phải có ít nhất một trong: văn bản, ảnh, audio. */
function assertSetHeader(content: string, audioId: string | null): void {
  const text = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim();
  if (!text && !/<img\b/i.test(content) && !audioId) {
    throw new BadRequestException(
      'Phần đầu bộ cần có văn bản, ảnh hoặc audio.',
    );
  }
}

/**
 * Gắn câu vào Bộ câu hỏi: hồ sơ phải bật, bộ cùng khoá và cùng chuyên đề với
 * câu. `undefined` = không đổi, `null` = bỏ gắn (luôn hợp lệ).
 */
export async function assertMaterialAttachable(
  prisma: PrismaService,
  profile: LmsProfileConfig,
  sharedMaterialId: string | null | undefined,
  courseId: string,
  moduleId: string,
): Promise<void> {
  if (sharedMaterialId == null) return;
  if (!profile.sharedMaterials) {
    throw new BadRequestException(
      'Hồ sơ môn này không dùng Tư liệu dùng chung.',
    );
  }
  const material = await prisma.sharedMaterial.findUnique({
    where: { id: sharedMaterialId },
    select: { courseId: true, moduleId: true, deletedAt: true },
  });
  if (!material || material.deletedAt || material.courseId !== courseId) {
    throw new BadRequestException(
      'Tư liệu dùng chung không thuộc khoá của câu hỏi.',
    );
  }
  if (material.moduleId !== moduleId) {
    throw new BadRequestException('Câu phải cùng chuyên đề với bộ.');
  }
}

/** Vị trí cuối bộ cho câu mới vào bộ. */
export async function nextSetPosition(
  prisma: Pick<PrismaService, 'question'>,
  sharedMaterialId: string,
): Promise<number> {
  const { _max } = await prisma.question.aggregate({
    where: { sharedMaterialId },
    _max: { setPosition: true },
  });
  return (_max.setPosition ?? -1) + 1;
}
